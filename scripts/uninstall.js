#!/usr/bin/env node

/**
 * AE 插件卸载脚本
 *
 * 用法：
 *   node scripts/uninstall.js --detect          输出安装状态 JSON（供 LLM 解析）
 *   node scripts/uninstall.js --scope global --yes   卸载全局安装（跳过确认）
 *   node scripts/uninstall.js --scope project --yes  卸载项目级安装（跳过确认）
 *   node scripts/uninstall.js [global|project]       交互式卸载（默认）
 *
 * --detect：只检测安装状态，输出 JSON，不执行任何删除操作
 * --scope <global|project>：指定卸载范围（可多次使用卸载多个范围）
 * --yes / -y：跳过所有交互式确认，直接执行删除
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

function getPaths(scope, projectRoot) {
  const home = process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME']
  const opencodeDir = join(home, '.config', 'opencode')

  if (scope === 'project') {
    const resolvedRoot = projectRoot || process.cwd()
    return {
      scope,
      repoDir: join(resolvedRoot, '.opencode', 'ai-agent-engine'),
      bridgeFile: join(resolvedRoot, '.opencode', 'plugins', 'ae-server.js'),
    }
  }

  return {
    scope,
    repoDir: join(opencodeDir, 'ai-agent-engine'),
    bridgeFile: join(opencodeDir, 'plugins', 'ae-server.js'),
  }
}

function detectStatus(projectRoot) {
  const scopes = ['global', 'project']
  const result = {}
  for (const scope of scopes) {
    const paths = getPaths(scope, projectRoot)
    const bridgeExists = existsSync(paths.bridgeFile)
    const repoExists = existsSync(paths.repoDir)
    const installed = bridgeExists || repoExists
    result[scope] = { installed, bridgeExists, repoExists, bridgeFile: paths.bridgeFile, repoDir: paths.repoDir }
  }
  return result
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

async function uninstallScope(scope, confirmFn, projectRoot) {
  const paths = getPaths(scope, projectRoot)
  console.log(`AE 插件卸载（${scope === 'project' ? '项目级' : '全局'}）`)
  console.log(`仓库目录: ${paths.repoDir}`)
  console.log(`桥接文件: ${paths.bridgeFile}`)

  const bridgeExists = existsSync(paths.bridgeFile)
  const repoExists = existsSync(paths.repoDir)

  if (!bridgeExists && !repoExists) {
    console.log(`\n未检测到 AE 插件安装（${scope === 'project' ? '项目级' : '全局'}），无需卸载。`)
    return
  }

  const targets = []
  if (bridgeExists) targets.push(`桥接文件: ${paths.bridgeFile}`)
  if (repoExists) targets.push(`仓库目录: ${paths.repoDir}`)

  const authorized = await confirmFn(`将删除以下内容:\n  ${targets.join('\n  ')}\n是否继续卸载？`)
  if (!authorized) {
    console.log('用户取消卸载。')
    return
  }

  if (bridgeExists) {
    await rm(paths.bridgeFile, { force: true })
    console.log(`桥接文件已删除: ${paths.bridgeFile}`)
  }

  if (repoExists) {
    await rm(paths.repoDir, { recursive: true, force: true })
    console.log(`仓库目录已删除: ${paths.repoDir}`)
  }

  console.log(`\nAE 插件已卸载完成（${scope === 'project' ? '项目级' : '全局'}）`)
  console.log('请重启 opencode 以使变更生效。')
  console.log('验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。')
}

function parseArgs(argv) {
  const detect = argv.includes('--detect')
  const yes = argv.includes('--yes') || argv.includes('-y')
  const scopes = []
  let projectRoot = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scope' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      scopes.push(argv[i + 1] === 'project' ? 'project' : 'global')
      i++
    } else if (argv[i] === '--project-root' && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      projectRoot = argv[i + 1]
      i++
    } else if (scopes.length === 0 && (argv[i] === 'project' || argv[i] === 'global')) {
      scopes.push(argv[i] === 'project' ? 'project' : 'global')
    }
  }
  if (scopes.length === 0) {
    scopes.push('global')
  }
  return { detect, yes, scopes, projectRoot }
}

async function main() {
  const { detect, yes: autoYes, scopes, projectRoot } = parseArgs(process.argv.slice(2))

  if (detect) {
    const status = detectStatus(projectRoot)
    console.log(JSON.stringify(status, null, 2))
    return
  }

  const confirmFn = makeConfirm(autoYes)

  for (const scope of scopes) {
    await uninstallScope(scope, confirmFn, projectRoot)
  }
}

main().catch((err) => {
  console.error('卸载失败:', err.message)
  process.exit(1)
})
