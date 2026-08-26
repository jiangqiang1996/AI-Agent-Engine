#!/usr/bin/env node

/**
 * AE 插件安装或更新脚本
 *
 * 用法：node scripts/install.js --target-dir <path> [--repo-dir <path>] [--yes]
 *   --target-dir <path>：安装目标目录（全局=~/.config/opencode，项目级=<project>/.opencode）
 *   --repo-dir <path>：源码仓库目录（默认 <target-dir>/ai-agent-engine-src）
 *   --yes / -y：跳过所有交互式确认
 *
 * 脚本不硬编码任何安装路径，所有路径通过参数传入。
 * 安装范围（全局/项目级）由调用方通过 --target-dir 隐式决定。
 *
 * 流程：
 * - 已安装 → 更新：git reset --hard、git pull、npm install、npm run build
 * - 未安装 → 克隆仓库、npm install、npm run build
 * - 部署构建产物到 <target-dir>/plugins/
 * - 在 <target-dir>/plugins/ai-agent-engine/ 内安装 @napi-rs/canvas
 *
 * 安全约束：只操作 <target-dir>/plugins/ 下的 ae-server.js 和 ai-agent-engine/，
 * 不触碰 plugins/ 目录内的其他文件。
 */

import { existsSync } from 'node:fs'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'

const REPO_URL = 'https://gitee.com/jiangqiang1996/ai-agent-engine.git'

function parseArgs(argv) {
  const yes = argv.includes('--yes') || argv.includes('-y')
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
  return { yes, targetDir, repoDir }
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

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'))
}

async function updateExisting(repoDir, confirmFn) {
  console.log(`\n检测到已安装，执行更新流程: ${repoDir}`)

  const authorized = await confirmFn(
    `将对 ${repoDir} 执行 git reset --hard HEAD、git clean -fd --exclude=node_modules、git pull，这些操作会丢弃本地未提交修改和未追踪文件。是否继续？`,
  )
  if (!authorized) {
    console.log('用户取消更新。')
    process.exit(0)
  }

  await runCommand('git', ['reset', '--hard', 'HEAD'], { cwd: repoDir })
  await runCommand('git', ['clean', '-fd', '--exclude=node_modules'], { cwd: repoDir })
  await runCommand('git', ['pull', 'origin', 'master'], { cwd: repoDir })

  console.log('\n安装依赖...')
  await runCommand('npm', ['install'], { cwd: repoDir })

  console.log('\n构建产物...')
  await runCommand('npm', ['run', 'build'], { cwd: repoDir })
}

async function freshInstall(repoDir, confirmFn) {
  console.log(`\n未检测到安装，执行全新安装流程`)

  if (existsSync(repoDir)) {
    const authorized = await confirmFn(`目标目录已存在但不是 git 仓库: ${repoDir}。将删除该目录并重新克隆。是否继续？`)
    if (!authorized) {
      console.log('用户取消安装。')
      process.exit(0)
    }
    await rm(repoDir, { recursive: true, force: true })
  }

  const parentDir = dirname(repoDir)
  await mkdir(parentDir, { recursive: true })

  console.log(`克隆仓库到: ${repoDir}`)
  await runCommand('git', ['clone', REPO_URL, repoDir], { cwd: parentDir })

  console.log('\n安装依赖...')
  await runCommand('npm', ['install'], { cwd: repoDir })

  console.log('\n构建产物...')
  await runCommand('npm', ['run', 'build'], { cwd: repoDir })
}

async function deployBuild(repoDir, targetDir) {
  const sourcePluginsDir = join(repoDir, '.opencode', 'plugins')
  const targetPluginsDir = join(targetDir, 'plugins')
  const sourceBundle = join(sourcePluginsDir, 'ae-server.js')
  const sourceAssets = join(sourcePluginsDir, 'ai-agent-engine')
  const targetBundle = join(targetPluginsDir, 'ae-server.js')
  const targetAssets = join(targetPluginsDir, 'ai-agent-engine')

  if (!existsSync(sourceBundle)) {
    throw new Error(`构建产物不存在: ${sourceBundle}。请确认 npm run build 已成功执行。`)
  }

  await mkdir(targetPluginsDir, { recursive: true })

  console.log('\n部署构建产物...')
  await rm(targetBundle, { force: true })
  await cp(sourceBundle, targetBundle)
  console.log(`  bundle: ${targetBundle}`)

  await rm(targetAssets, { recursive: true, force: true })
  await cp(sourceAssets, targetAssets, { recursive: true })
  console.log(`  assets: ${targetAssets}`)
}

async function installNativeDeps(targetDir) {
  const assetsDir = join(targetDir, 'plugins', 'ai-agent-engine')
  const packageJsonPath = join(assetsDir, 'package.json')

  if (!existsSync(packageJsonPath)) {
    await writeFile(packageJsonPath, JSON.stringify({ type: 'module' }, null, 2) + '\n', 'utf8')
  }

  console.log('\n安装 @napi-rs/canvas...')
  await runCommand('npm', ['install', '@napi-rs/canvas'], { cwd: assetsDir })
  console.log('  @napi-rs/canvas 安装完成')
}

async function main() {
  const { yes: autoYes, targetDir, repoDir: repoDirArg } = parseArgs(process.argv.slice(2))

  if (!targetDir) {
    console.error('错误：必须指定 --target-dir。')
    console.error('用法：node scripts/install.js --target-dir <path> [--repo-dir <path>] [--yes]')
    console.error('  全局安装：--target-dir ~/.config/opencode')
    console.error('  项目级安装：--target-dir <项目根目录>/.opencode')
    process.exit(1)
  }

  const confirmFn = makeConfirm(autoYes)
  const repoDir = repoDirArg || join(targetDir, 'ai-agent-engine-src')

  console.log('AE 插件安装或更新')
  console.log(`目标目录: ${targetDir}`)
  console.log(`仓库目录: ${repoDir}`)

  const installed = existsSync(repoDir) && isGitRepo(repoDir)

  if (installed) {
    await updateExisting(repoDir, confirmFn)
  } else {
    await freshInstall(repoDir, confirmFn)
  }

  await deployBuild(repoDir, targetDir)
  await installNativeDeps(targetDir)

  console.log(`\nAE 插件已${installed ? '更新' : '安装'}完成`)
  console.log('请重启 opencode 以加载最新版本。')
  console.log('如需验证，重启后尝试 /ae-help 命令。')
}

main().catch((err) => {
  console.error('安装或更新失败:', err.message)
  process.exit(1)
})
