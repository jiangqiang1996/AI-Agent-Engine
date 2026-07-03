#!/usr/bin/env node

/**
 * AE 插件卸载脚本
 *
 * 用法：node scripts/uninstall.js [global|project]
 * - global（默认）：卸载 ~/.config/opencode/ai-agent-engine
 * - project：卸载 <当前项目根目录>/.opencode/ai-agent-engine
 *
 * 删除桥接文件和克隆的仓库目录。
 * 脚本内置交互式 confirm，删除操作前会在终端等待用户确认。
 */

import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline'

const __dirname = dirname(fileURLToPath(import.meta.url))

const rl = createInterface({ input: process.stdin, output: process.stdout })

function confirm(message) {
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      const normalized = answer.trim().toLowerCase()
      resolve(normalized === 'y' || normalized === 'yes')
    })
  })
}

function getPaths(scope) {
  const home = process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME']
  const opencodeDir = join(home, '.config', 'opencode')

  if (scope === 'project') {
    const projectRoot = process.cwd()
    return {
      scope,
      repoDir: join(projectRoot, '.opencode', 'ai-agent-engine'),
      bridgeFile: join(projectRoot, '.opencode', 'plugins', 'ae-server.js'),
    }
  }

  return {
    scope,
    repoDir: join(opencodeDir, 'ai-agent-engine'),
    bridgeFile: join(opencodeDir, 'plugins', 'ae-server.js'),
  }
}

async function main() {
  const arg = process.argv[2] || 'global'
  const scope = arg === 'project' ? 'project' : 'global'

  const paths = getPaths(scope)
  console.log(`AE 插件卸载（${scope === 'project' ? '项目级' : '全局'}）`)
  console.log(`仓库目录: ${paths.repoDir}`)
  console.log(`桥接文件: ${paths.bridgeFile}`)

  const bridgeExists = existsSync(paths.bridgeFile)
  const repoExists = existsSync(paths.repoDir)

  if (!bridgeExists && !repoExists) {
    console.log('\n未检测到 AE 插件安装，无需卸载。')
    rl.close()
    return
  }

  const targets = []
  if (bridgeExists) targets.push(`桥接文件: ${paths.bridgeFile}`)
  if (repoExists) targets.push(`仓库目录: ${paths.repoDir}`)

  const authorized = await confirm(`将删除以下内容:\n  ${targets.join('\n  ')}\n是否继续卸载？`)
  if (!authorized) {
    console.log('用户取消卸载。')
    rl.close()
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

  rl.close()
  console.log(`\nAE 插件已卸载完成（${scope === 'project' ? '项目级' : '全局'}）`)
  console.log('请重启 opencode 以使变更生效。')
  console.log('验证方式：重启后尝试 /ae-help，该命令不再可用即表示卸载成功。')
}

main().catch((err) => {
  console.error('卸载失败:', err.message)
  rl.close()
  process.exit(1)
})
