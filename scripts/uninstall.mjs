#!/usr/bin/env node

/**
 * AE omp 插件卸载脚本
 *
 * 用法：
 *   node scripts/uninstall.mjs --detect                      输出安装状态 JSON（供 LLM 代理解析）
 *   node scripts/uninstall.mjs --scope user --yes            卸载全局安装（跳过确认）
 *   node scripts/uninstall.mjs --scope project --yes         卸载项目级安装（跳过确认）
 *   node scripts/uninstall.mjs --scope user --scope project  卸载多个范围
 *
 * --scope <user|project>：卸载范围，可重复传入；别名 global 等价于 user。
 *   未传 --scope 时按检测到的已安装范围逐一确认后卸载。
 * --project-root <path>：项目级卸载的目标项目根目录（默认 process.cwd()）
 * --purge：所有 scope 卸载完成后，同时移除 marketplace 登记并删除托管克隆
 *   ~/.omp/ai-agent-engine（需确认；--yes 时直接执行）
 * --yes / -y：跳过所有交互式确认
 *
 * 卸载不影响用户 omp 配置（config.yml / mcp.json）。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'

const MARKETPLACE = 'ae-marketplace'
const PLUGIN_ID = `ae@${MARKETPLACE}`
const CLONE_DIR = join(homedir(), '.omp', 'ai-agent-engine')

function fail(msg) {
  console.error(`错误：${msg}`)
  process.exit(1)
}

function parseArgs(argv) {
  const opts = { yes: false, scopes: [], projectRoot: null, detect: false, purge: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--yes' || a === '-y') opts.yes = true
    else if (a === '--detect') opts.detect = true
    else if (a === '--purge') opts.purge = true
    else if (a === '--scope' && argv[i + 1]) {
      const v = argv[++i]
      const s = v === 'global' ? 'user' : v
      if (s !== 'user' && s !== 'project') fail(`无效的 scope 值 "${v}"，必须为 user（或别名 global）或 project`)
      if (!opts.scopes.includes(s)) opts.scopes.push(s)
    } else if (a === '--project-root' && argv[i + 1]) opts.projectRoot = resolve(argv[++i])
    else fail(`未知参数 "${a}"。用法：node scripts/uninstall.mjs [--detect] [--scope <user|project>]... [--purge] [--yes] [--project-root <path>]`)
  }
  return opts
}

function makeConfirm(autoYes) {
  if (autoYes) return async () => true
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return async (message) => new Promise((res) => {
    rl.question(`${message} [y/N] `, (a) => { rl.close(); res(a.trim().toLowerCase() === 'y' || a.trim().toLowerCase() === 'yes') })
  })
}

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
  return [...new Set((j?.marketplace ?? [])
    .filter((m) => m.id === PLUGIN_ID)
    .flatMap((m) => (m.entries ?? []).map((e) => e.scope)))]
    .filter((s) => s === 'user' || s === 'project')
}

function marketplaceSourceUri() {
  const reg = join(homedir(), '.omp', 'marketplaces.json')
  if (!existsSync(reg)) return null
  try {
    const j = JSON.parse(readFileSync(reg, 'utf8'))
    return (j.marketplaces ?? []).find((m) => m.name === MARKETPLACE)?.sourceUri ?? null
  } catch { return null }
}

function detect(projectRoot) {
  const scopes = installedScopes(projectRoot)
  console.log(JSON.stringify({
    plugin: PLUGIN_ID,
    installed: { user: scopes.includes('user'), project: scopes.includes('project') },
    marketplace: { registered: marketplaceSourceUri() !== null, sourceUri: marketplaceSourceUri() },
    cloneDir: { path: CLONE_DIR, exists: existsSync(join(CLONE_DIR, '.git')) },
    projectRoot,
  }, null, 2))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const projectRoot = opts.projectRoot ?? process.cwd()

  if (opts.detect) { detect(projectRoot); return }

  const installed = installedScopes(projectRoot)
  let scopes = opts.scopes
  if (scopes.length === 0) {
    if (installed.length === 0) {
      console.log(`未检测到 ${PLUGIN_ID} 安装，无需卸载。`)
      if (!opts.purge) return
      scopes = []
    } else {
      scopes = installed
      console.log(`未指定 --scope，将卸载检测到的范围：${scopes.join(', ')}`)
    }
  }

  const confirmFn = makeConfirm(opts.yes)

  for (const scope of scopes) {
    if (!installed.includes(scope)) {
      console.log(`\n跳过 ${scope} scope：未安装。`)
      continue
    }
    const ok = await confirmFn(`卸载 ${PLUGIN_ID}（scope=${scope}${scope === 'project' ? `，项目 ${projectRoot}` : ''}）？`)
    if (!ok) { console.log('用户取消。'); continue }
    if (run('omp', ['plugin', 'uninstall', PLUGIN_ID, '--scope', scope], { cwd: scope === 'project' ? projectRoot : undefined }) !== 0) {
      fail(`卸载失败（scope=${scope}）`)
    }
    console.log(`已卸载 ${PLUGIN_ID}（scope=${scope}）`)
  }

  if (opts.purge) {
    const uri = marketplaceSourceUri()
    if (uri !== null) {
      const ok = await confirmFn(`移除 marketplace 登记 "${MARKETPLACE}"（指向 ${uri}）？`)
      if (ok) {
        if (run('omp', ['plugin', 'marketplace', 'remove', MARKETPLACE]) !== 0) fail('marketplace remove 失败')
        console.log('已移除 marketplace 登记。')
      }
    }
    if (existsSync(CLONE_DIR)) {
      const ok = await confirmFn(`删除托管克隆目录 ${CLONE_DIR}？`)
      if (ok) { rmSync(CLONE_DIR, { recursive: true, force: true }); console.log('已删除托管克隆。') }
    }
  }

  console.log('\n卸载完成。会话内执行 /reload-plugins 或重启会话使变更生效；/skill:ae-prd 不再可用即卸载成功。')
}

main().catch((err) => {
  console.error('卸载失败:', err.message)
  process.exit(1)
})
