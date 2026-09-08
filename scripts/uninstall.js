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
 *
 * 退出码：
 *   0 = 卸载完成（含"未安装无需卸载"和"用户取消"）
 *   1 = ae-server.js 未能删除，插件仍会被 opencode 加载，卸载未生效
 *   2 = ae-server.js 已删除（插件已注销），但存在被进程占用的残留文件，需关闭 opencode 后重试
 *
 * Windows 下 DLL 一旦被运行中的进程映射就无法 unlink，因此目录删除采用逐项容错策略，
 * 单项失败不中断整体流程，并把结果如实反映在退出码和输出中，避免把残留谎报为卸载成功。
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import { removeTreeTolerant } from './remove-tree.mjs'

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

/**
 * 容错删除目录树见 ./remove-tree.mjs。
 */

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
    return 0
  }

  console.log(`AE 插件卸载`)
  console.log(`目标目录: ${targetDir}`)

  const targets = []
  if (status.bundleExists) targets.push(`bundle: ${paths.bundleFile}`)
  if (status.assetsExists) targets.push(`assets: ${paths.assetsDir}`)
  if (status.repoExists && !keepRepo) targets.push(`仓库: ${paths.repoDir}`)

  if (targets.length === 0) {
    console.log('无需删除的内容。')
    return 0
  }

  const authorized = await confirmFn(`将删除以下内容:\n  ${targets.join('\n  ')}\n是否继续卸载？`)
  if (!authorized) {
    console.log('用户取消卸载。')
    return 0
  }

  const residuals = []

  // 先删 bundle：opencode 通过扫描 plugins/*.js 注册插件，删除该文件即完成注销。
  // 后续 assetsDir 内被进程映射的原生模块即使删不掉，插件也不会再被加载。
  let bundleRemoved = true
  if (status.bundleExists) {
    try {
      await rm(paths.bundleFile, { force: true })
      console.log(`已删除: ${paths.bundleFile}`)
    } catch (error) {
      bundleRemoved = false
      residuals.push(`${paths.bundleFile} (${error.code || error.message})`)
    }
  }

  if (status.assetsExists) {
    const failed = await removeTreeTolerant(paths.assetsDir)
    if (failed.length === 0) {
      console.log(`已删除: ${paths.assetsDir}`)
    } else {
      residuals.push(...failed)
    }
  }

  if (status.repoExists && !keepRepo) {
    const failed = await removeTreeTolerant(paths.repoDir)
    if (failed.length === 0) {
      console.log(`已删除: ${paths.repoDir}`)
    } else {
      residuals.push(...failed)
    }
  }

  if (residuals.length === 0) {
    console.log('\nAE 插件已卸载完成')
    console.log('请重启 opencode 以使变更生效。')
    console.log('验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。')
    return 0
  }

  console.warn(`\n以下 ${residuals.length} 项被占用，未能删除：`)
  for (const item of residuals.slice(0, 20)) {
    console.warn(`  ${item}`)
  }
  if (residuals.length > 20) {
    console.warn(`  ... 其余 ${residuals.length - 20} 项省略`)
  }

  if (!bundleRemoved) {
    console.error('\n插件入口 ae-server.js 未能删除，opencode 仍会加载 AE 插件，卸载未生效。')
    console.error('请关闭所有 opencode 进程后重新执行本卸载命令。')
    return 1
  }

  console.log('\n插件入口 ae-server.js 已删除，opencode 重启后不再加载 AE 插件。')
  console.log('残留文件多为被当前进程映射的原生模块（Windows 下 DLL 被加载即无法删除），只占磁盘、不影响卸载效果。')
  console.log('如需彻底清理：关闭所有 opencode 进程后重新执行本卸载命令。')
  return 2
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
  const exitCode = await uninstall(targetDir, repoDirArg, confirmFn, keepRepo)
  if (exitCode !== 0) {
    process.exit(exitCode)
  }
}

main().catch((err) => {
  console.error('卸载失败:', err.message)
  process.exit(1)
})
