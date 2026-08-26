#!/usr/bin/env node

/**
 * AE 插件卸载脚本
 *
 * 用法：
 *   node scripts/uninstall.js --target-dir <path> [--repo-dir <path>] [--yes] [--keep-repo]
 *   node scripts/uninstall.js --target-dir <path> --detect
 *
 * --target-dir <path>：卸载目标目录（全局=~/.config/opencode，项目级=<project>/.opencode）
 * --repo-dir <path>：源码仓库目录（默认 <target-dir>/ai-agent-engine-src）
 * --yes / -y：跳过所有交互式确认
 * --detect：只检测安装状态，输出 JSON，不执行任何删除操作
 * --keep-repo：保留仓库目录，只删除 plugins/ 下的部署产物
 *
 * 安全约束：只删除 <target-dir>/plugins/ 下的 ae-server.js 和 ai-agent-engine/，
 * 不触碰 plugins/ 目录内的其他文件。
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

function parseArgs(argv) {
  const detect = argv.includes('--detect')
  const yes = argv.includes('--yes') || argv.includes('-y')
  const keepRepo = argv.includes('--keep-repo')
  let targetDir = null
  let repoDir = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--target-dir' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      targetDir = argv[i + 1]
      i++
    } else if (argv[i] === '--repo-dir' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      repoDir = argv[i + 1]
      i++
    }
  }
  return { detect, yes, keepRepo, targetDir, repoDir }
}

function makeConfirm(autoYes) {
  if (autoYes) {
    return async () => true
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return async (message) => {
    return new Promise((resolve) => {
      rl.question(`${message} [y/N] `, (answer) => {
        const normalized = answer.trim().toLowerCase()
        resolve(normalized === 'y' || normalized === 'yes')
      })
    })
  }
}

function getPaths(targetDir, repoDirArg) {
  const pluginsDir = join(targetDir, 'plugins')
  const repoDir = repoDirArg || join(targetDir, 'ai-agent-engine-src')
  return {
    bundleFile: join(pluginsDir, 'ae-server.js'),
    assetsDir: join(pluginsDir, 'ai-agent-engine'),
    repoDir,
  }
}

function detectStatus(targetDir, repoDirArg) {
  const paths = getPaths(targetDir, repoDirArg)
  const bundleExists = existsSync(paths.bundleFile)
  const assetsExists = existsSync(paths.assetsDir)
  const repoExists = existsSync(paths.repoDir)
  const installed = bundleExists || assetsExists
  return {
    installed,
    bundleExists,
    assetsExists,
    repoExists,
    bundleFile: paths.bundleFile,
    assetsDir: paths.assetsDir,
    repoDir: paths.repoDir,
  }
}

async function uninstall(targetDir, repoDirArg, confirmFn, keepRepo) {
  const paths = getPaths(targetDir, repoDirArg)
  const status = detectStatus(targetDir, repoDirArg)

  if (!status.installed && !status.repoExists) {
    console.log('未检测到 AE 插件安装，无需卸载。')
    return
  }

  console.log(`AE 插件卸载`)
  console.log(`目标目录: ${targetDir}`)

  const targets = []
  if (status.bundleExists) targets.push(`bundle: ${paths.bundleFile}`)
  if (status.assetsExists) targets.push(`assets: ${paths.assetsDir}`)
  if (status.repoExists && !keepRepo) targets.push(`仓库: ${paths.repoDir}`)

  if (targets.length === 0) {
    console.log('无需删除的内容。')
    return
  }

  const authorized = await confirmFn(`将删除以下内容:\n  ${targets.join('\n  ')}\n是否继续卸载？`)
  if (!authorized) {
    console.log('用户取消卸载。')
    return
  }

  if (status.bundleExists) {
    await rm(paths.bundleFile, { force: true })
    console.log(`已删除: ${paths.bundleFile}`)
  }

  if (status.assetsExists) {
    await rm(paths.assetsDir, { recursive: true, force: true })
    console.log(`已删除: ${paths.assetsDir}`)
  }

  if (status.repoExists && !keepRepo) {
    await rm(paths.repoDir, { recursive: true, force: true })
    console.log(`已删除: ${paths.repoDir}`)
  }

  console.log('\nAE 插件已卸载完成')
  console.log('请重启 opencode 以使变更生效。')
  console.log('验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。')
}

async function main() {
  const { detect, yes: autoYes, keepRepo, targetDir, repoDir: repoDirArg } = parseArgs(process.argv.slice(2))

  if (!targetDir) {
    console.error('错误：必须指定 --target-dir。')
    console.error('用法：node scripts/uninstall.js --target-dir <path> [--repo-dir <path>] [--yes] [--keep-repo] [--detect]')
    console.error('  全局卸载：--target-dir ~/.config/opencode')
    console.error('  项目级卸载：--target-dir <项目根目录>/.opencode')
    process.exit(1)
  }

  if (detect) {
    const status = detectStatus(targetDir, repoDirArg)
    console.log(JSON.stringify(status, null, 2))
    return
  }

  const confirmFn = makeConfirm(autoYes)
  await uninstall(targetDir, repoDirArg, confirmFn, keepRepo)
}

main().catch((err) => {
  console.error('卸载失败:', err.message)
  process.exit(1)
})
