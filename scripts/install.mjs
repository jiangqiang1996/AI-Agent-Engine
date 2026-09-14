#!/usr/bin/env node

/**
 * AE omp 插件远程安装或更新脚本（gitee 源）
 *
 * 用法：node scripts/install.mjs --scope <user|project> [--yes] [--project-root <path>] [--branch <ref>]
 *   --scope <user|project>：安装范围（必须显式指定，避免误操作全局安装）
 *     - user（别名 global）：全局安装，所有项目可用
 *     - project：项目级安装，仅 --project-root 指定的项目可用
 *   --yes / -y：跳过所有交互式确认（适用于 AI 代理已获用户授权的场景）
 *   --project-root <path>：项目级安装的目标项目根目录（默认 process.cwd()）
 *   --branch <ref>：远程分支（默认 oh-my-pi，即插件发布分支）
 *   --detect：输出 JSON 安装状态后退出，不执行任何变更
 *
 * 自动判断：
 * - 托管克隆（~/.omp/ai-agent-engine）已存在 → 更新：fetch+reset 到远程分支最新，
 *   刷新 marketplace catalog，再按 scope upgrade/install
 * - 不存在 → 全新安装：浅克隆 → marketplace add → plugin install
 *
 * 环境检查（git/omp/node）由调用方（docs/INSTALL.md 流程）在脚本执行前完成。
 * 未显式指定 scope 时报错退出，不静默回退到全局。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const REPO_URL = 'https://gitee.com/jiangqiang1996/ai-agent-engine.git'
const DEFAULT_BRANCH = 'oh-my-pi'
const MARKETPLACE = 'ae-marketplace'
const PLUGIN_ID = `ae@${MARKETPLACE}`
const CLONE_DIR = join(homedir(), '.omp', 'ai-agent-engine')

function parseArgs(argv) {
  const opts = { yes: false, scope: null, projectRoot: null, branch: DEFAULT_BRANCH, detect: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--detect') opts.detect = true
    else if (a === '--scope' && argv[i + 1]) {
      const v = argv[++i]
      if (v === 'global') opts.scope = 'user'
      else if (v === 'user' || v === 'project') opts.scope = v
      else fail(`无效的 scope 值 "${v}"，必须为 user（或别名 global）或 project`)
    } else if (a === '--project-root' && argv[i + 1]) opts.projectRoot = resolve(argv[++i])
    else if (a === '--branch' && argv[i + 1]) opts.branch = argv[++i]
    else fail(`未知参数 "${a}"。用法：node scripts/install.mjs --scope <user|project> [--yes] [--project-root <path>] [--branch <ref>]`)
  }
  return opts
}

function fail(msg) {
  console.error(`错误：${msg}`)
  process.exit(1)
}

function makeConfirm(autoYes) {
  if (autoYes) return async () => true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return async (message) => new Promise((res) => {
    rl.question(`${message} [y/N] `, (a) => { rl.close(); res(a.trim().toLowerCase() === 'y' || a.trim().toLowerCase() === 'yes') })
  })
}

/** 运行命令并捕获输出；stdio 直通便于用户观察 git/omp 进度 */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'], ...opts })
  if (r.error) fail(`无法执行 ${cmd}：${r.error.message}`)
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  if (out.trim()) console.error(out.trim())
  return r.status ?? 1
}

function runJson(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  if (r.status !== 0) return null
  const i = (r.stdout ?? '').indexOf('{')
  if (i < 0) return null
  try { return JSON.parse(r.stdout.slice(i)) } catch { return null }
}

function installedScopes(projectRoot) {
  const j = runJson('omp', ['plugin', 'list', '--json'], { cwd: projectRoot })
  return (j?.marketplace ?? [])
    .filter((m) => m.id === PLUGIN_ID)
    .flatMap((m) => (m.entries ?? []).map((e) => e.scope))
}

function marketplaceSourceUri() {
  const reg = join(homedir(), '.omp', 'marketplaces.json')
  if (!existsSync(reg)) return null
  try {
    const j = JSON.parse(readFileSync(reg, 'utf8'))
    return (j.marketplaces ?? []).find((m) => m.name === MARKETPLACE)?.sourceUri ?? null
  } catch { return null }
}

function isGitRepo(dir) {
  return existsSync(join(dir, '.git'))
}

function detect(projectRoot) {
  const state = {
    repoUrl: REPO_URL,
    cloneDir: CLONE_DIR,
    clone: { exists: isGitRepo(CLONE_DIR) },
    marketplace: { registered: false, sourceUri: null },
    installed: { user: false, project: false },
  }
  const uri = marketplaceSourceUri()
  if (uri !== null) { state.marketplace.registered = true; state.marketplace.sourceUri = uri }
  if (isGitRepo(CLONE_DIR)) {
    const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: CLONE_DIR, encoding: 'utf8' })
    if (r.status === 0) state.clone.head = r.stdout.trim()
    const b = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: CLONE_DIR, encoding: 'utf8' })
    if (b.status === 0) state.clone.branch = b.stdout.trim()
  }
  const scopes = installedScopes(projectRoot)
  for (const s of scopes) if (s in state.installed) state.installed[s] = true
  console.log(JSON.stringify(state, null, 2))
}

async function ensureClone(branch, confirmFn) {
  if (isGitRepo(CLONE_DIR)) {
    console.log(`\n检测到托管克隆，执行更新：${CLONE_DIR}`)
    const ok = await confirmFn(
      `将对 ${CLONE_DIR} 执行 git fetch + reset --hard origin/${branch} + clean -fd，会丢弃该目录内本地未提交修改和未追踪文件。是否继续？`,
    )
    if (!ok) { console.log('用户取消更新。'); process.exit(0) }
    if (run('git', ['fetch', '--depth', '1', 'origin', branch], { cwd: CLONE_DIR }) !== 0) fail('git fetch 失败，请检查网络或分支名')
    if (run('git', ['reset', '--hard', 'FETCH_HEAD'], { cwd: CLONE_DIR }) !== 0) fail('git reset 失败')
    run('git', ['clean', '-fd'], { cwd: CLONE_DIR })
    return false
  }
  if (existsSync(CLONE_DIR)) {
    const ok = await confirmFn(`目标目录已存在但不是 git 仓库：${CLONE_DIR}。将删除并重新克隆。是否继续？`)
    if (!ok) { console.log('用户取消安装。'); process.exit(0) }
    rmSync(CLONE_DIR, { recursive: true, force: true })
  }
  console.log(`\n克隆仓库（分支 ${branch}）到：${CLONE_DIR}`)
  if (run('git', ['clone', '--depth', '1', '--branch', branch, REPO_URL, CLONE_DIR]) !== 0) fail('git clone 失败，请检查网络或分支名')
  return true
}

async function ensureMarketplace(confirmFn, fresh) {
  const uri = marketplaceSourceUri()
  if (uri === null) {
    console.log(`\n注册 marketplace：${CLONE_DIR}`)
    if (run('omp', ['plugin', 'marketplace', 'add', CLONE_DIR]) !== 0) fail('marketplace add 失败')
    return
  }
  if (resolve(uri) === resolve(CLONE_DIR)) {
    if (!fresh) {
      console.log('\n刷新 marketplace catalog…')
      run('omp', ['plugin', 'marketplace', 'update', MARKETPLACE])
    }
    return
  }
  console.log(`\nmarketplace "${MARKETPLACE}" 已登记且指向其他位置：${uri}`)
  const ok = await confirmFn(`将移除原登记并改指托管克隆 ${CLONE_DIR}。是否继续？`)
  if (!ok) { console.log('用户取消。'); process.exit(0) }
  if (run('omp', ['plugin', 'marketplace', 'remove', MARKETPLACE]) !== 0) fail('marketplace remove 失败')
  if (run('omp', ['plugin', 'marketplace', 'add', CLONE_DIR]) !== 0) fail('marketplace add 失败')
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const projectRoot = opts.projectRoot ?? process.cwd()

  if (opts.detect) { detect(projectRoot); return }
  if (!opts.scope) {
    console.error('错误：必须显式指定安装范围。使用 --scope user（全局）或 --scope project（项目级）。')
    console.error('用法：node scripts/install.mjs --scope <user|project> [--yes] [--project-root <path>] [--branch <ref>]')
    process.exit(1)
  }

  console.log(`AE omp 插件安装或更新（${opts.scope === 'project' ? '项目级' : '全局'}）`)
  console.log(`托管克隆：${CLONE_DIR}`)
  if (opts.scope === 'project') console.log(`目标项目：${projectRoot}`)

  const confirmFn = makeConfirm(opts.yes)

  if (!opts.yes) {
    const ok = await confirmFn(
      `将从 ${REPO_URL}（分支 ${opts.branch}）克隆/更新到 ${CLONE_DIR}，注册 marketplace "${MARKETPLACE}"，并安装插件 ${PLUGIN_ID}（scope=${opts.scope}）。是否继续？`,
    )
    if (!ok) { console.log('用户取消安装。'); process.exit(0) }
  }

  const fresh = await ensureClone(opts.branch, confirmFn)
  await ensureMarketplace(confirmFn, fresh)

  const scopes = installedScopes(opts.scope === 'project' ? projectRoot : undefined)
  const already = scopes.includes(opts.scope)
  const installArgs = already
    ? ['plugin', 'upgrade', PLUGIN_ID, '--scope', opts.scope]
    : ['plugin', 'install', PLUGIN_ID, '--scope', opts.scope]
  console.log(`\n${already ? '升级' : '安装'}插件（scope=${opts.scope}）…`)
  if (run('omp', installArgs, { cwd: opts.scope === 'project' ? projectRoot : undefined }) !== 0) {
    fail(`插件${already ? '升级' : '安装'}失败`)
  }

  console.log(`\nAE 插件已${already ? '更新' : '安装'}完成（${opts.scope === 'project' ? `项目级：${projectRoot}` : '全局'}）`)
  console.log('后续步骤：')
  console.log('  1. 会话内执行 /reload-plugins 刷新技能与命令（新会话无需此步）')
  console.log('  2. 代理发现门控：确认 omp 配置 enabledProviders 含 claude-plugins（见 docs/INSTALL.md 注意事项）')
  console.log('  3. 验证：omp plugin list 应含 ae@ae-marketplace 及对应 scope')
}

main().catch((err) => {
  console.error('安装或更新失败:', err.message)
  process.exit(1)
})
