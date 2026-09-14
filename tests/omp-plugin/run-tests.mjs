#!/usr/bin/env node
/**
 * AE omp 插件测试套件。
 *
 * 三层验证（对应 omp 官方测试面，见文件尾注释）：
 *   L1 静态契约：JSON/frontmatter/禁用术语/交叉引用
 *   L2 脚本行为：scope-analyze.mjs 与 review-proof.mjs 的正/负例（临时 git 仓库）
 *   L3 集成发现：omp plugin marketplace add/install + headless `omp -p` 验证技能与代理被真实发现
 *
 * 用法：node tests/omp-plugin/run-tests.mjs [--skip-integration]
 * L3 需要本机 omp CLI 与已配置模型；--skip-integration 只跑 L1+L2。
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

const REPO_ROOT = resolve(import.meta.dirname, '..', '..')
const PLUGIN_DIR = join(REPO_ROOT, 'ae-omp-plugin')
const SKIP_INTEGRATION = process.argv.includes('--skip-integration')

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ✔ ${name}`)
  } catch (error) {
    failed++
    const msg = error instanceof Error ? error.message : String(error)
    failures.push(`${name}: ${msg}`)
    console.log(`  ✘ ${name}\n      ${msg.split('\n').join('\n      ')}`)
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/)
  assert(m, 'missing frontmatter')
  const keys = [...m[1].matchAll(/^([a-zA-Z_-]+):/gm)].map((x) => x[1])
  return { keys, block: m[1] }
}

// ================= L1 静态契约 =================
console.log('\n[L1] 静态契约')

test('仓库根 catalog 与 plugin manifest 可解析且 source 指向插件目录', () => {
  const mk = JSON.parse(readFileSync(join(REPO_ROOT, '.omp-plugin/marketplace.json'), 'utf8'))
  assert(mk.name && mk.owner?.name && Array.isArray(mk.plugins) && mk.plugins.length > 0, 'catalog 缺必填顶层字段')
  assert(mk.plugins[0].source === './ae-omp-plugin', `plugin source 应为 "./ae-omp-plugin"，实际 ${mk.plugins[0].source}`)
  assert(!existsSync(join(PLUGIN_DIR, '.omp-plugin')), '插件目录内不应再带 catalog（marketplace 根=仓库根）')
  JSON.parse(readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8'))
  JSON.parse(readFileSync(join(PLUGIN_DIR, '.claude-plugin/plugin.json'), 'utf8'))
})

test('开源协议与仓库根一致（GPL-3.0-or-later）且随包分发 LICENSE', () => {
  const root = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')).license
  const pkg = JSON.parse(readFileSync(join(PLUGIN_DIR, 'package.json'), 'utf8')).license
  const manifest = JSON.parse(readFileSync(join(PLUGIN_DIR, '.claude-plugin/plugin.json'), 'utf8')).license
  const catalog = JSON.parse(readFileSync(join(REPO_ROOT, '.omp-plugin/marketplace.json'), 'utf8')).plugins[0].license
  assert(root === 'GPL-3.0-or-later', `仓库根协议异常: ${root}`)
  assert(pkg === root && manifest === root && catalog === root,
    `协议不一致: pkg=${pkg} manifest=${manifest} catalog=${catalog} root=${root}`)
  assert(readFileSync(join(PLUGIN_DIR, 'LICENSE'), 'utf8').includes('GNU GENERAL PUBLIC LICENSE'), '插件包 LICENSE 缺失或非 GPLv3')
})

test('恰好 7 个技能 + 2 个代理', () => {
  const skills = readdirSync(join(PLUGIN_DIR, 'skills')).sort()
  const agents = readdirSync(join(PLUGIN_DIR, 'agents')).sort()
  assert(skills.length === 7, `skills=${skills.length}: ${skills.join(',')}`)
  assert(agents.join(',') === 'ocr-reviewer.md,test-triage.md', `agents=${agents.join(',')}`)
})

test('技能 frontmatter 仅 name+description 且 name 与目录一致', () => {
  for (const dir of readdirSync(join(PLUGIN_DIR, 'skills'))) {
    const fm = parseFrontmatter(readFileSync(join(PLUGIN_DIR, 'skills', dir, 'SKILL.md'), 'utf8'))
    assert(fm.keys.length === 2 && fm.keys.includes('name') && fm.keys.includes('description'),
      `${dir}: frontmatter keys = ${fm.keys.join(',')}`)
    assert(fm.block.includes(`name: ${dir}`), `${dir}: name 与目录名不一致`)
    assert(/description:\s*"?.{20,}/.test(fm.block), `${dir}: description 过短或缺失`)
  }
})

test('代理 frontmatter 仅 omp 契约键且 output 为结构化 schema', () => {
  const allowed = new Set(['name', 'description', 'tools', 'output', 'model', 'spawns',
    'thinking-level', 'autoloadSkills', 'blocking', 'read-summarize', 'prewalk', 'advisor'])
  for (const f of ['ocr-reviewer.md', 'test-triage.md']) {
    const text = readFileSync(join(PLUGIN_DIR, 'agents', f), 'utf8')
    const fm = parseFrontmatter(text)
    for (const k of fm.keys) assert(allowed.has(k), `${f}: 非法键 ${k}`)
    assert(fm.keys.includes('name') && fm.keys.includes('description') && fm.keys.includes('output'),
      `${f}: 缺 name/description/output`)
    assert(/^\s{2,}(type|required|properties):/m.test(fm.block), `${f}: output 非内联 JSON Schema`)
    for (const banned of ['temperature', 'mode:', 'steps:', 'maxSteps']) {
      assert(!fm.block.includes(banned), `${f}: 含非法 frontmatter 键 ${banned}`)
    }
  }
})


test('SKILL.md 引用的 references/scripts 路径全部存在', () => {
  const missing = []
  for (const dir of readdirSync(join(PLUGIN_DIR, 'skills'))) {
    const text = readFileSync(join(PLUGIN_DIR, 'skills', dir, 'SKILL.md'), 'utf8')
    for (const m of text.matchAll(/(?:references|scripts)\/[A-Za-z0-9._-]+\.(?:md|mjs|json|sh)/g)) {
      if (!existsSync(join(PLUGIN_DIR, 'skills', dir, m[0]))) missing.push(`${dir}/${m[0]}`)
    }
  }
  assert(missing.length === 0, `缺失引用:\n${missing.join('\n')}`)
})

test('findings-schema.json 可解析且含 severity/title/file', () => {
  const s = JSON.parse(readFileSync(join(PLUGIN_DIR, 'skills/ae-review/references/findings-schema.json'), 'utf8'))
  const str = JSON.stringify(s)
  for (const k of ['severity', 'title', 'file']) assert(str.includes(k), `findings schema 缺 ${k}`)
})

test('两个脚本语法有效', () => {
  for (const s of ['scope-analyze.mjs', 'review-proof.mjs']) {
    const r = spawnSync(process.execPath, ['--check', join(PLUGIN_DIR, 'skills/ae-review/scripts', s)], { encoding: 'utf8' })
    assert(r.status === 0, `${s}: ${r.stderr}`)
  }
})

// ================= L2 脚本行为 =================
console.log('\n[L2] 脚本行为')

const SCRIPTS = join(PLUGIN_DIR, 'skills/ae-review/scripts')

function runScript(script, args, cwd) {
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8' })
  let json = null
  try { json = JSON.parse(r.stdout) } catch { /* 保留 null */ }
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr }
}

test('scope-analyze: 代码+设计文档混合路由', () => {
  const r = runScript('scope-analyze.mjs', ['--files',
    'src/a.ts,ae/designs/api.md,ae/prds/p.md,README.md,node_modules/x.js,.env,logo.png',
    '--mode', 'changes', '--context-hint', '会话变更'], REPO_ROOT)
  assert(r.status === 0 && r.json?.ok === true, `exit=${r.status} ${r.stderr}`)
  const j = r.json
  assert(j.agents.includes('ocr-reviewer') && j.agents.includes('document-reviewer'), `agents=${j.agents}`)
  assert(j.agents.includes('api-design-reviewer'), '未激活 api 维度 persona')
  assert(j.agents.includes('traceability-reviewer'), '2 类文档未激活追溯 persona')
  assert(j.agents.includes('goal-alignment-reviewer'), '缺目标对齐 persona')
  assert(j.excludedFiles.includes('.env') && j.excludedFiles.includes('logo.png')
    && j.excludedFiles.includes('node_modules/x.js'), `排除错误: ${j.excludedFiles}`)
  assert(j.tasks.find((t) => t.agent === 'ocr-reviewer')?.registered === true, 'ocr-reviewer 应 registered:true')
  assert(j.tasks.filter((t) => t.registered).length === 1, 'registered 应仅 ocr-reviewer')
  assert(j.tasks.every((t) => typeof t.prompt === 'string' && t.prompt.length > 30), 'task prompt 缺失')
  assert(j.contentAnalysisCandidates.includes('README.md'), '非设计文档应进 contentAnalysisCandidates')
  assert(j.stats.codeFiles >= 1 && j.stats.docFiles >= 3, `stats 异常: ${JSON.stringify(j.stats)}`)
})

test('scope-analyze: goals 显式透传 + full 模式', () => {
  const r = runScript('scope-analyze.mjs', ['--files', 'src/index.ts', '--mode', 'full',
    '--goals', '验证目标透传'], REPO_ROOT)
  assert(r.json?.goals === '验证目标透传', 'goals 未透传')
  assert(r.json.extraPrompt.includes('完整内容'), 'full 模式提示词错误')
})

test('scope-analyze: 非法参数退出码 1', () => {
  const r1 = runScript('scope-analyze.mjs', ['--files', 'a.ts', '--mode', 'bogus'], REPO_ROOT)
  assert(r1.status === 1 && r1.json?.ok === false, 'bogus mode 应拒绝')
  const r2 = runScript('scope-analyze.mjs', ['--files', '', '--mode', 'changes'], REPO_ROOT)
  assert(r2.status === 1, '空 files 应拒绝')
})

// review-proof 需要真实 git 仓库
const proofRepo = mkdtempSync(join(tmpdir(), 'ae-proof-'))
function git(args) {
  return execFileSync('git', args, { cwd: proofRepo, encoding: 'utf8' }).trim()
}
git(['init', '-q', '-b', 'main', '.'])
git(['config', 'user.email', 't@t'])
git(['config', 'user.name', 't'])
writeFileSync(join(proofRepo, 'a.txt'), 'hi')
git(['add', '-A'])
git(['commit', '-qm', 'init'])

function makeReviewOutput({ status = 'passed', head = git(['rev-parse', 'HEAD']), wt = git(['rev-parse', '--show-toplevel']), summary = 'clean', extra = '' } = {}) {
  const f = join(tmpdir(), `ae-review-out-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
  writeFileSync(f, `review_status: ${status}\nworktree: ${wt}\nbranch: main\nhead: ${head}\nstatus_summary: ${summary}\n${extra}`)
  return f
}

test('review-proof: 干净树 passed 写入 metadata（12 冻结字段）', () => {
  const src = makeReviewOutput()
  const r = runScript('review-proof.mjs', ['--run-id', 'run-ok', '--status', 'passed',
    '--summary', '无阻断发现', '--source-output-file', src, '--repo', proofRepo], proofRepo)
  assert(r.status === 0 && r.json?.ok === true, `exit=${r.status} out=${r.stdout.slice(0, 200)}`)
  const metaPath = join(proofRepo, 'ae/reviews/run-ok/metadata.json')
  assert(existsSync(metaPath), 'metadata.json 未写入')
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  for (const k of ['generatedBy', 'proofKind', 'reviewRunIdOrMessageRef', 'sourceReviewRef',
    'worktree', 'branch', 'head', 'statusSummary', 'reviewStatus', 'hasBlockingFinding', 'reviewOutputHash']) {
    assert(k in meta, `metadata 缺字段 ${k}`)
  }
  assert(meta.generatedBy === 'ae-review' && meta.proofKind === 'ae-review-proof', 'generatedBy/proofKind 错误')
  assert(/^[0-9a-f]{64}$/.test(meta.reviewOutputHash), 'sha256 格式错误')
  assert(meta.reviewStatus === 'passed' && meta.hasBlockingFinding === false, 'status 字段错误')
  rmSync(src)
})

test('review-proof: 陈旧 head 被拒（防陈旧报告）', () => {
  const src = makeReviewOutput({ head: '0'.repeat(40) })
  const r = runScript('review-proof.mjs', ['--run-id', 'run-stale', '--status', 'passed',
    '--summary', 'x', '--source-output-file', src, '--repo', proofRepo], proofRepo)
  assert(r.status === 1 && r.json?.ok === false && r.json.reason.includes('指纹'), `应拒绝: ${r.stdout}`)
  rmSync(src)
})

test('review-proof: passed 含 P1 findings 被拒', () => {
  const src = makeReviewOutput()
  const ff = join(tmpdir(), 'ae-findings-block.json')
  writeFileSync(ff, JSON.stringify([{ severity: 'P1', title: 't', file: 'a.txt', detail: 'd' }]))
  const r = runScript('review-proof.mjs', ['--run-id', 'run-block', '--status', 'passed',
    '--summary', 'x', '--source-output-file', src, '--findings-file', ff, '--repo', proofRepo], proofRepo)
  assert(r.status === 1 && r.json.reason.includes('P0/P1/P2'), `应拒绝: ${r.stdout}`)
  rmSync(src); rmSync(ff)
})

test('review-proof: 正文含 [P1] 标记时 passed 被拒（文本级阻断检测）', () => {
  const src = makeReviewOutput({ extra: '\n[P1] a.txt:1 -- 发现问题\n' })
  const r = runScript('review-proof.mjs', ['--run-id', 'run-text', '--status', 'passed',
    '--summary', 'x', '--source-output-file', src, '--repo', proofRepo], proofRepo)
  assert(r.status === 1, '正文阻断标记应导致 passed 拒绝')
  rmSync(src)
})

test('review-proof: 脏树 "; " 连接 status_summary + failed 状态通过', () => {
  writeFileSync(join(proofRepo, 'b.txt'), 'dirty')
  const st = execFileSync('git', ['status', '--porcelain', '--branch'], { cwd: proofRepo, encoding: 'utf8' })
  const ss = st.split('\n').filter((l) => l && !l.startsWith('## ')).map((l) => l.trimEnd()).join('; ')
  const src = makeReviewOutput({ status: 'failed', summary: ss, extra: '\n[P1] b.txt:1 -- dirty\n' })
  const r = runScript('review-proof.mjs', ['--run-id', 'run-dirty', '--status', 'failed',
    '--summary', '有阻断发现', '--source-output-file', src, '--repo', proofRepo], proofRepo)
  assert(r.status === 0 && r.json?.ok === true, `应通过: ${r.stdout.slice(0, 200)}`)
  const meta = JSON.parse(readFileSync(join(proofRepo, 'ae/reviews/run-dirty/metadata.json'), 'utf8'))
  assert(meta.hasBlockingFinding === true && meta.statusSummary.includes('b.txt'), '脏树指纹错误')
  rmSync(src)
})

test('review-proof: 非法 run-id 被拒（防目录穿越）', () => {
  const src = makeReviewOutput()
  for (const bad of ['../evil', 'a/b', '.']) {
    const r = runScript('review-proof.mjs', ['--run-id', bad, '--status', 'passed',
      '--summary', 'x', '--source-output-file', src, '--repo', proofRepo], proofRepo)
    assert(r.status === 1, `run-id "${bad}" 应被拒`)
  }
  rmSync(src)
})

rmSync(proofRepo, { recursive: true, force: true })

// ================= L3 集成发现 =================
console.log(`\n[L3] 集成发现${SKIP_INTEGRATION ? '（跳过）' : ''}`)

if (!SKIP_INTEGRATION) {
  const omp = spawnSync('omp', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' })
  if (omp.status !== 0) {
    console.log('  ! omp CLI 不可用，跳过 L3')
  } else {
    const overlayDir = mkdtempSync(join(tmpdir(), 'ae-l3-'))
    const overlay = join(overlayDir, 'overlay.yml')
    writeFileSync(overlay, 'enabledProviders:\n  - claude-plugins\n  - omp-plugins\n  - native\n')
    const probeCwd = mkdtempSync(join(tmpdir(), 'ae-l3-probe-'))

    const sh = process.platform === 'win32'
    function ompRun(args, opts = {}) {
      const r = spawnSync('omp', args, { cwd: opts.cwd ?? REPO_ROOT, encoding: 'utf8', shell: sh, timeout: opts.timeout ?? 150_000 })
      return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
    }
    // headless 探测：让模型自由枚举清单原文，断言期望成员在列、阴性对照缺席（各带一次重试）。
    // cwd 用中性临时目录：user scope 全局生效；避免模型读仓库文档（曾据此枚举旧技能表导致误报）。
    function probe(prompt, expectPresent, expectAbsent, cwd = probeCwd) {
      let lastOut = ''
      for (let attempt = 1; attempt <= 2; attempt++) {
        const r = ompRun(['-p', `${prompt} 只依据系统提示中的清单作答；禁止读取文件、禁止调用工具。只输出逗号分隔的名字清单，不要表格、不要解释。`,
          '--no-session', '--max-time', '100', '--config', overlay], { cwd })
        lastOut = r.out
        const missing = expectPresent.filter((n) => !r.out.includes(n))
        const leaked = expectAbsent.filter((n) => r.out.includes(n))
        if (missing.length === 0 && leaked.length === 0) return { ok: true, msg: '' }
        if (attempt === 2) {
          return { ok: false, msg: `缺失=[${missing}] 泄漏=[${leaked}] 原始输出尾部: ${r.out.slice(-300)}` }
        }
      }
      return { ok: false, msg: lastOut.slice(-300) }
    }

    // 自管安装状态：user scope 缺失时自动补装（含 marketplace 登记），套件结束恢复原状
    let installedBySuite = false
    let marketplaceAddedBySuite = false
    {
      const mk = ompRun(['plugin', 'marketplace', 'list'])
      if (!mk.out.includes('ae-marketplace')) {
        const add = ompRun(['plugin', 'marketplace', 'add', './.', '--json'])
        assert(add.status === 0, `自动 add marketplace 失败: ${add.out.slice(0, 200)}`)
        marketplaceAddedBySuite = true
      }
      const lb = ompRun(['plugin', 'list', '--json'])
      const jb = JSON.parse(lb.out.slice(lb.out.indexOf('{')))
      const hadUser = (jb.marketplace ?? []).find((m) => m.id === 'ae@ae-marketplace')?.entries?.some((e) => e.scope === 'user')
      if (!hadUser) {
        const inst = ompRun(['plugin', 'install', 'ae@ae-marketplace', '--json'])
        assert(inst.status === 0, `自动安装 user scope 失败: ${inst.out.slice(0, 200)}`)
        installedBySuite = true
      }
    }

    test('插件已安装（ae@ae-marketplace user scope，全局模式）', () => {
      const r = ompRun(['plugin', 'list', '--json'])
      const j = JSON.parse(r.out.slice(r.out.indexOf('{')))
      const entry = (j.marketplace ?? []).find((m) => m.id === 'ae@ae-marketplace')
      assert(entry?.entries?.some((e) => e.scope === 'user'), `user scope 未安装: ${r.out.slice(0, 300)}`)
    })

    test('omp plugin doctor 无 error', () => {
      const r = ompRun(['plugin', 'doctor', '--json'])
      const items = JSON.parse(r.out.slice(r.out.indexOf('[')))
      const errors = items.filter((i) => i.status === 'error')
      assert(errors.length === 0, `doctor errors: ${JSON.stringify(errors)}`)
    })

    test('headless 会话发现全部 7 个技能（含阴性对照）', () => {
      const p = probe('列出你系统提示技能清单（skills manifest）中的全部技能名。',
        ['ae-prd', 'ae-design', 'ae-work', 'ae-review', 'ae-test', 'ae-fix', 'ae-doc-gen'],
        ['ae-zz-nonexistent', 'ae-zz-legacy-a', 'ae-zz-legacy-b'])
      assert(p.ok, `技能发现失败: ${p.msg}`)
    })

    test('headless 会话发现 ocr-reviewer 与 test-triage 代理（含阴性对照）', () => {
      const p = probe('列出你 task 工具说明中提到的全部自定义代理名（bundled 与自定义都列）。',
        ['ocr-reviewer', 'test-triage'],
        ['zz-nonexistent-agent'])
      assert(p.ok, `代理发现失败: ${p.msg}`)
    })

    // 项目级安装模式：临时项目根 --scope project 安装 → 该项目内可见 → 卸载清理
    test('project scope 安装：项目内可见、卸载后登记移除（项目级模式）', () => {
      const proj = mkdtempSync(join(tmpdir(), 'ae-proj-scope-'))
      try {
        const inst = ompRun(['plugin', 'install', 'ae@ae-marketplace', '--scope', 'project', '--json'], { cwd: proj })
        assert(inst.status === 0, `project 安装失败: ${inst.out.slice(0, 300)}`)
        const reg = join(proj, '.omp', 'plugins', 'installed_plugins.json')
        assert(existsSync(reg), '项目级 installed_plugins.json 未写入')
        const list = ompRun(['plugin', 'list', '--json'], { cwd: proj })
        const j = JSON.parse(list.out.slice(list.out.indexOf('{')))
        const entry = (j.marketplace ?? []).find((m) => m.id === 'ae@ae-marketplace')
        const pEntry = entry?.entries?.find((e) => e.scope === 'project')
        assert(pEntry, `project scope 未登记: ${list.out.slice(0, 300)}`)
        assert(existsSync(pEntry.installPath), `project 安装路径无效: ${JSON.stringify(pEntry)}`)
        const p = probe('列出你系统提示技能清单（skills manifest）中的全部技能名。',
          ['ae-prd', 'ae-review'], ['ae-zz-nonexistent'], proj)
        assert(p.ok, `项目级会话未发现技能: ${p.msg}`)
        const un = ompRun(['plugin', 'uninstall', 'ae@ae-marketplace', '--scope', 'project', '--json'], { cwd: proj })
        assert(un.status === 0, `project 卸载失败: ${un.out.slice(0, 300)}`)
      } finally {
        rmSync(proj, { recursive: true, force: true })
      }
    })

    if (installedBySuite) ompRun(['plugin', 'uninstall', 'ae@ae-marketplace', '--scope', 'user', '--json'])
    if (marketplaceAddedBySuite) ompRun(['plugin', 'marketplace', 'remove', 'ae-marketplace', '--json'])
    rmSync(overlayDir, { recursive: true, force: true })
    rmSync(probeCwd, { recursive: true, force: true })
  }
}

// ================= 汇总 =================
console.log(`\n${'='.repeat(50)}`)
console.log(`通过 ${passed} / 失败 ${failed}`)
if (failed > 0) {
  console.log('\n失败明细:')
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
console.log('ALL TESTS PASSED')

/*
 * omp 官方测试面备忘（本套件 L3 的依据，2026-09-14 实测 + 官方文档核实）：
 * - omp 无专用「plugin test」命令；官方测试路径为四件套：
 *   1) `omp plugin doctor [--fix] [--json]`：插件目录/manifest/node_modules 健康检查
 *   2) `omp plugin link <dir>`：本地开发链接（Windows 无符号链接特权时 EPERM，
 *      降级用 `omp plugin marketplace add <dir>` + `install name@marketplace`）
 *   3) headless `omp -p "..." --no-session [--config overlay] [--skills glob] [--no-extensions]`：
 *      真实会话内验证技能/代理/命令发现（本套件 L3 采用）
 *   4) `~/.omp/logs/omp.<date>.*.log` 结构化日志：扩展/资产加载失败诊断；
 *      `disabledExtensions` 可隔离单个资产
 * - SDK `createAgentSession`（omp://sdk.md）可编程构造 ephemeral 会话做自动化断言，
 *   官方注明 "Useful for tests"；需要更深集成时可用其替代 L3 的 CLI 探测。
 * - 关键门控（实测）：marketplace 插件的 agents/ 仅在 `enabledProviders` 含
 *   `claude-plugins` 时被 task 发现；skills/ 走 omp-plugins provider 默认可发现。
 */
