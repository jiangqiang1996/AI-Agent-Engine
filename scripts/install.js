#!/usr/bin/env node

/**
 * AE 插件安装或更新脚本
 *
 * 用法：node scripts/install.js [--yes] [global|project]
 * --yes：跳过所有交互式确认，直接执行（适用于 LLM 代理已获授权的场景）
 * - global（默认）：安装到 ~/.config/opencode/ai-agent-engine
 * - project：安装到 <当前项目根目录>/.opencode/ai-agent-engine
 *
 * 自动判断：
 * - 已安装 → 更新：拉取最新代码，重新安装依赖并构建
 * - 未安装 → 克隆仓库、安装依赖、构建产物（全新安装）
 *
 * 环境检查（Node.js/npm/git）由调用方（/ae-install 命令模板）在脚本执行前完成。
 *
 * 不传 --yes 时，脚本内置交互式 confirm，destructive 操作前等待用户确认。
 */

import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'

const REPO_URL = 'https://gitee.com/jiangqiang1996/ai-agent-engine.git'
const BRIDGE_CONTENT = "export { default } from '../ai-agent-engine/dist/src/index.js'\n"

function parseArgs(argv) {
  const yes = argv.includes('--yes') || argv.includes('-y')
  const positional = argv.filter((a) => !a.startsWith('-'))
  const scope = positional[0] === 'project' ? 'project' : 'global'
  return { yes, scope }
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

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
    })
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`命令失败 (exit ${code}): ${command} ${args.join(' ')}`))
    })
    child.on('error', reject)
  })
}

function runCommandCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      ...options,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => { stdout += data.toString() })
    child.stderr.on('data', (data) => { stderr += data.toString() })
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim())
      else reject(new Error(`命令失败 (exit ${code}): ${command} ${args.join(' ')}\n${stderr}`))
    })
    child.on('error', reject)
  })
}

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'))
}

function getPaths(scope) {
  const home = process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME']
  const opencodeDir = join(home, '.config', 'opencode')

  if (scope === 'project') {
    const projectRoot = process.cwd()
    return {
      scope,
      repoDir: join(projectRoot, '.opencode', 'ai-agent-engine'),
      pluginsDir: join(projectRoot, '.opencode', 'plugins'),
      bridgeFile: join(projectRoot, '.opencode', 'plugins', 'ae-server.js'),
      workDir: projectRoot,
    }
  }

  return {
    scope,
    repoDir: join(opencodeDir, 'ai-agent-engine'),
    pluginsDir: join(opencodeDir, 'plugins'),
    bridgeFile: join(opencodeDir, 'plugins', 'ae-server.js'),
    workDir: opencodeDir,
  }
}

async function writeBridgeFile(paths) {
  await mkdir(paths.pluginsDir, { recursive: true })
  await writeFile(paths.bridgeFile, BRIDGE_CONTENT, 'utf8')
  console.log(`桥接文件已写入: ${paths.bridgeFile}`)
}

async function updateExisting(paths, confirmFn) {
  console.log(`\n检测到已安装，执行更新流程: ${paths.repoDir}`)

  const authorized = await confirmFn(
    `将对 ${paths.repoDir} 执行 git reset --hard HEAD、git clean -fd --exclude=node_modules、git pull，这些操作会丢弃本地未提交修改和未追踪文件。是否继续？`,
  )
  if (!authorized) {
    console.log('用户取消更新。')
    process.exit(0)
  }

  await runCommand('git', ['reset', '--hard', 'HEAD'], { cwd: paths.repoDir })
  await runCommand('git', ['clean', '-fd', '--exclude=node_modules'], { cwd: paths.repoDir })

  const pullOutput = await runCommandCapture('git', ['pull', 'origin', 'master'], { cwd: paths.repoDir })
  console.log(pullOutput)

  console.log('\n安装依赖...')
  await runCommand('npm', ['install'], { cwd: paths.repoDir })

  console.log('\n构建产物...')
  await runCommand('npm', ['run', 'build'], { cwd: paths.repoDir })

  console.log('\n写入桥接文件...')
  await writeBridgeFile(paths)
}

async function freshInstall(paths, confirmFn) {
  console.log(`\n未检测到安装，执行全新安装流程`)

  if (existsSync(paths.repoDir)) {
    const target = paths.repoDir
    const authorized = await confirmFn(`目标目录已存在但不是 git 仓库: ${target}。将删除该目录并重新克隆。是否继续？`)
    if (!authorized) {
      console.log('用户取消安装。')
      process.exit(0)
    }
    await rm(target, { recursive: true, force: true })
  }

  const parentDir = dirname(paths.repoDir)
  await mkdir(parentDir, { recursive: true })

  console.log(`克隆仓库到: ${paths.repoDir}`)
  await runCommand('git', ['clone', REPO_URL, paths.repoDir], { cwd: parentDir })

  console.log('\n安装依赖...')
  await runCommand('npm', ['install'], { cwd: paths.repoDir })

  console.log('\n构建产物...')
  await runCommand('npm', ['run', 'build'], { cwd: paths.repoDir })

  console.log('\n写入桥接文件...')
  await writeBridgeFile(paths)
}

async function main() {
  const { yes: autoYes, scope } = parseArgs(process.argv.slice(2))
  const confirmFn = makeConfirm(autoYes)

  const paths = getPaths(scope)
  console.log(`AE 插件安装或更新（${scope === 'project' ? '项目级' : '全局'}）`)
  console.log(`仓库目录: ${paths.repoDir}`)
  console.log(`桥接文件: ${paths.bridgeFile}`)

  const installed = existsSync(paths.repoDir) && isGitRepo(paths.repoDir)

  if (installed) {
    await updateExisting(paths, confirmFn)
  } else {
    await freshInstall(paths, confirmFn)
  }

  console.log(`\nAE 插件已${installed ? '更新' : '安装'}完成（${scope === 'project' ? '项目级' : '全局'}）`)
  console.log('请重启 opencode 以加载最新版本。')
  console.log('如需验证，重启后尝试 /ae-help 命令。')
}

main().catch((err) => {
  console.error('安装或更新失败:', err.message)
  process.exit(1)
})
