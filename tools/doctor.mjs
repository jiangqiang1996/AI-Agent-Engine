#!/usr/bin/env node
/**
 * 本地自检（仓库内部工具，不随技能分发）
 *
 * 1. 共享脚本同步状态
 * 2. 技能规范校验
 * 3. 各技能脚本单元测试
 * 4. 外部工具可用性探测（仅提示，不阻断）
 *
 * 用法：node tools/doctor.mjs [--skip-tests]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
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
    { name: 'officecli', args: ['--version'] },
    { name: 'playwright-cli', args: ['--version'] },
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

function main() {
  const skipTests = process.argv.includes('--skip-tests')

  const sharedOk = run('共享脚本同步检查', process.execPath, [join('tools', 'sync-shared.mjs'), '--check'])
  const validateOk = run('技能规范校验', process.execPath, [join('tools', 'validate.mjs')])

  let testOk = true
  if (!skipTests) {
    testOk = run('单元测试', process.execPath, [join('tools', 'run-tests.mjs')])
  }

  probeExternalTools()

  process.stdout.write('\n=== 汇总 ===\n')
  process.stdout.write(`  共享脚本  ${sharedOk ? 'OK' : 'FAIL'}\n`)
  process.stdout.write(`  规范校验  ${validateOk ? 'OK' : 'FAIL'}\n`)
  process.stdout.write(`  单元测试  ${testOk ? 'OK' : 'FAIL'}\n`)

  process.exitCode = sharedOk && validateOk && testOk ? 0 : 1
}

main()
