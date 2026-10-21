#!/usr/bin/env node
/**
 * 本地自检（仓库内部工具，不随技能分发）
 *
 * 1. 共享脚本同步状态
 * 2. 技能规范校验
 * 3. 各技能脚本单元测试
 * 4. 第三方组件声明版本核对
 * 5. 外部工具可用性探测（仅提示，不阻断）
 *
 * 用法：node tools/doctor.mjs [--skip-tests]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function run(label, command, args) {
  process.stdout.write(`\n=== ${label} ===\n`)
  const result = spawnSync(command, args, { cwd: REPO_ROOT, stdio: 'inherit', shell: false })
  return result.status === 0
}

function probeExternalTools() {
  process.stdout.write('\n=== 外部工具探测 ===\n')
  const tools = [
    { name: 'git', args: ['--version'] },
    { name: 'node', args: ['--version'] },
    { name: 'python', args: ['--version'] },
    { name: 'officecli', args: ['--version'] },
    { name: 'ffmpeg', args: ['-version'] },
  ]

  const isWindows = process.platform === 'win32'
  for (const tool of tools) {
    const probe = isWindows ? 'where' : 'which'
    // 不开 shell：where/which 都是真实可执行文件，
    // shell:true + args 会触发 Node DEP0190 告警并带来参数拼接注入面
    const found = spawnSync(probe, [tool.name], { encoding: 'utf8', shell: false })
    const available = found.status === 0 && `${found.stdout ?? ''}`.trim().length > 0
    process.stdout.write(`  ${available ? '✔' : '✘'} ${tool.name}${available ? '' : '  (缺失，部分技能不可用)'}\n`)
  }
}

/**
 * 核对第三方组件声明版本 vs 实际打包版本。
 *
 * 打包产物把依赖的 package.json 内联进 bundle，可以直接读出真实版本；
 * THIRD-PARTY-NOTICES 里写错版本会让许可证声明失真。
 */
function checkThirdPartyVersions() {
  process.stdout.write('\n=== 第三方组件版本核对 ===\n')
  const noticesPath = join(REPO_ROOT, 'THIRD-PARTY-NOTICES')
  if (!existsSync(noticesPath)) {
    process.stdout.write('  ✘ 未找到 THIRD-PARTY-NOTICES\n')
    return false
  }
  const notices = readFileSync(noticesPath, 'utf8')

  const checks = [
    {
      pkg: 'ssh2',
      bundle: 'skills/ae-linux-remote-ops/scripts/ssh2.dist.cjs',
      extract(source) {
        const m = source.match(/"node_modules\/ssh2\/package\.json"[\s\S]{0,600}?version:\s*"([^"]+)"/)
        return m ? m[1] : null
      },
    },
  ]

  let ok = true
  for (const check of checks) {
    const bundlePath = join(REPO_ROOT, check.bundle)
    if (!existsSync(bundlePath)) continue
    const actual = check.extract(readFileSync(bundlePath, 'utf8'))
    if (!actual) continue
    const escaped = check.pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const declared = notices.match(new RegExp(escaped + '\\s*\\((\\d+\\.\\d+\\.\\d+)\\)'))?.[1]
    if (!declared) {
      process.stdout.write(`  ✘ ${check.pkg} 未在 THIRD-PARTY-NOTICES 中声明版本（实际打包 ${actual}）\n`)
      ok = false
    } else if (declared !== actual) {
      process.stdout.write(`  ✘ ${check.pkg} 版本声明不符：声明 ${declared}，实际打包 ${actual}\n`)
      ok = false
    } else {
      process.stdout.write(`  ✔ ${check.pkg} ${actual}\n`)
    }
  }
  return ok
}

function main() {
  const skipTests = process.argv.includes('--skip-tests')

  const sharedOk = run('共享脚本同步检查', process.execPath, [join('tools', 'sync-shared.mjs'), '--check'])
  const validateOk = run('技能规范校验', process.execPath, [join('tools', 'validate.mjs')])

  let testOk = true
  if (!skipTests) {
    testOk = run('单元测试', process.execPath, [join('tools', 'run-tests.mjs')])
  }

  const noticesOk = checkThirdPartyVersions()
  probeExternalTools()

  process.stdout.write('\n=== 汇总 ===\n')
  process.stdout.write(`  共享脚本  ${sharedOk ? 'OK' : 'FAIL'}\n`)
  process.stdout.write(`  规范校验  ${validateOk ? 'OK' : 'FAIL'}\n`)
  process.stdout.write(`  单元测试  ${testOk ? 'OK' : 'FAIL'}\n`)
  process.stdout.write(`  组件声明  ${noticesOk ? 'OK' : 'FAIL'}\n`)

  process.exitCode = sharedOk && validateOk && testOk && noticesOk ? 0 : 1
}

main()
