import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dir = 'skills'
const rows = []

function countFiles(root, sub) {
  const p = join(root, sub)
  try {
    if (!statSync(p).isDirectory()) {
      return 0
    }
  } catch {
    return 0
  }
  let n = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) {
        walk(f)
      } else if (e.name.endsWith('.md')) {
        n += 1
      }
    }
  }
  walk(p)
  return n
}

function countAll(root, sub) {
  const p = join(root, sub)
  try {
    if (!statSync(p).isDirectory()) {
      return 0
    }
  } catch {
    return 0
  }
  let n = 0
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, e.name)
      if (e.isDirectory()) {
        walk(f)
      } else {
        n += 1
      }
    }
  }
  walk(p)
  return n
}

for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue
  }
  const skill = entry.name
  const root = join(dir, skill)
  const skillFile = join(root, 'SKILL.md')
  const source = readFileSync(skillFile, 'utf8')
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')

  rows.push({
    skill,
    lines: source.split(/\r?\n/).length,
    kb: Buffer.byteLength(source) / 1024,
    refs: countFiles(root, 'references'),
    roles: countFiles(root, join('references', 'roles')),
    scripts: countAll(root, 'scripts'),
    tests: countAll(root, 'tests'),
    headings: (body.match(/^## /gm) ?? []).length,
    hasCode: body.includes('```'),
    // 技能正文里的关键信号
    hasStep: /步骤|流程|Workflow|执行/.test(body),
    hasBoundary: /边界|不适用|禁止|安全/.test(body),
    hasDone: /完成标准|完成判据|完成条件|验收/.test(body),
    hasPath: /ae\/[a-z0-9-]+\//.test(body),
    hasConfig: /ae\.jsonc/.test(body),
    hasDispatch: /并行.*分派|顺序执行|角色卡/.test(body),
  })
}

rows.sort((a, b) => a.lines - b.lines)
console.log('技能'.padEnd(24) + '行'.padEnd(6) + 'KB'.padEnd(7) + 'ref'.padEnd(5) + 'role'.padEnd(6) + 'scr'.padEnd(5) + 'tst'.padEnd(5) + 'h'.padEnd(4) + ' 标记')
for (const r of rows) {
  const flags = [
    r.hasStep ? 'S' : '-',
    r.hasBoundary ? 'B' : '-',
    r.hasDone ? 'D' : '-',
    r.hasPath ? 'P' : '-',
    r.hasConfig ? 'C' : '-',
    r.hasDispatch ? 'R' : '-',
    r.hasCode ? 'c' : '-',
  ].join('')
  console.log(
    r.skill.padEnd(24)
    + String(r.lines).padEnd(6)
    + r.kb.toFixed(0).padEnd(7)
    + String(r.refs).padEnd(5)
    + String(r.roles).padEnd(6)
    + String(r.scripts).padEnd(5)
    + String(r.tests).padEnd(5)
    + String(r.headings).padEnd(4)
    + ' ' + flags,
  )
}
console.log(`\n共 ${rows.length} 个技能`)
console.log('标记：S=有流程 B=有边界 D=有完成标准 P=有产物路径 C=读配置 R=有派发范式 c=有代码块')
