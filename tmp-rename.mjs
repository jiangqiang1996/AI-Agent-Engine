import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKILLS = 'skills'

/** 顶层技能改名 */
const TOP_RENAMES = {
  'linux-remote-ops': 'ae-linux-remote-ops',
  'ocr-code-review': 'ae-ocr-code-review',
  'playwright-verify': 'ae-playwright-verify',
  'wechatide-skill': 'ae-wechatide-skill',
}

/** wechatide 嵌套子技能改名 */
const NESTED_RENAMES = {
  'wechatide-automator': 'ae-wechatide-automator',
  'wechatide-cloudbase-operator': 'ae-wechatide-cloudbase-operator',
  'wechatide-compiler': 'ae-wechatide-compiler',
  'wechatide-debugger': 'ae-wechatide-debugger',
  'wechatide-initializer': 'ae-wechatide-initializer',
  'wechatide-installer': 'ae-wechatide-installer',
  'wechatide-previewer': 'ae-wechatide-previewer',
  'wechatide-project-config': 'ae-wechatide-project-config',
  'wechatide-project-manager': 'ae-wechatide-project-manager',
}

/** 文本替换表：长名优先，避免前缀互相覆盖 */
const TEXT_RENAMES = [
  ...Object.entries(NESTED_RENAMES),
  ...Object.entries(TOP_RENAMES),
]

/* ------------------------------------------------------------------ *
 * 1. 目录改名
 * ------------------------------------------------------------------ */

function renameDir(from, to) {
  if (!exists(from)) {
    return false
  }
  execFileSync('git', ['mv', from, to], { stdio: 'pipe' })
  return true
}

function exists(path) {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

for (const [from, to] of Object.entries(TOP_RENAMES)) {
  if (renameDir(join(SKILLS, from), join(SKILLS, to))) {
    console.log(`目录改名：${from} → ${to}`)
  }
}

for (const [from, to] of Object.entries(NESTED_RENAMES)) {
  const parent = join(SKILLS, 'ae-wechatide-skill', 'skills')
  if (renameDir(join(parent, from), join(parent, to))) {
    console.log(`子技能改名：${from} → ${to}`)
  }
}

/* ------------------------------------------------------------------ *
 * 2. 文本替换
 * ------------------------------------------------------------------ */

const SCAN_ROOTS = [SKILLS, 'docs', 'tools', '.claude-plugin']
const TEXT_EXT = new Set(['.md', '.json', '.mjs', '.js', '.jsonc', '.sh', '.yaml', '.yml'])
const SKIP_DIRS = new Set(['node_modules', '.git'])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue
    }
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile()) {
      const dot = full.lastIndexOf('.')
      const ext = dot === -1 ? '' : full.slice(dot)
      if (TEXT_EXT.has(ext)) {
        out.push(full)
      }
    }
  }
  return out
}

let touched = 0
for (const root of SCAN_ROOTS) {
  if (!exists(root)) {
    continue
  }
  for (const file of walk(root)) {
    const source = readFileSync(file, 'utf8')
    let next = source
    for (const [from, to] of TEXT_RENAMES) {
      next = next.split(from).join(to)
    }
    if (next !== source) {
      writeFileSync(file, next, 'utf8')
      touched += 1
      console.log(`文本替换：${relative('.', file)}`)
    }
  }
}

console.log(`\n共更新 ${touched} 个文件`)
