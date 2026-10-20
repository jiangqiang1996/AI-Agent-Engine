#!/usr/bin/env node
/**
 * 一次性迁移器：把 src/assets/skills 下的旧技能迁移到 skills/ 目录。
 * 旧目录名已带 ae- 前缀，frontmatter 里的 name 却是 ae:xxx 冒号形式。
 *
 * 只做"机械可判定"的改写：
 *   - frontmatter 规范化（name/description/license/compatibility/metadata）
 *   - 技能引用 ae:xxx → ae-xxx
 *   - 产物路径 ae/xxx/ → ae/<slug>/
 *   - 宿主专属措辞 → 能力抽象措辞
 *   - 插件工具调用 → 脚本调用
 *
 * 语义级改写（角色卡、流程重排等）由人工/后续处理完成，
 * 最终以 tools/validate.mjs 为准绳。
 *
 * 用法：node tools/migrate-legacy.mjs [--dry-run]
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const LEGACY_DIR = join(REPO_ROOT, 'src', 'assets', 'skills')
const TARGET_DIR = join(REPO_ROOT, 'skills')
const DRY_RUN = process.argv.includes('--dry-run')

/* ------------------------------------------------------------------ *
 * 全局路径映射
 * ------------------------------------------------------------------ */

const GLOBAL_PATH_MAP = [
  ['ae/prds/', 'ae/prd/'],
  ['ae/designs/', 'ae/design/'],
  ['ae/reviews/', 'ae/review/'],
  ['ae/handoffs/', 'ae/handoff/'],
  ['ae/documents/', 'ae/document/'],
  ['ae/work-reports/', 'ae/work-report/'],
  ['ae/tests/e2e/', 'ae/e2e-test/'],
  ['ae/tests/api/', 'ae/api-test/'],
  ['ae/tests/unit/', 'ae/unit-test/'],
  ['ae/tests/', 'ae/test-artifacts/'],
]

/** 每技能独有的路径覆盖（先于全局映射生效） */
const SKILL_PATH_MAP = {
  'ae-image': [['ae/markdown/', 'ae/image/']],
  'ae-audio': [['ae/markdown/', 'ae/audio/']],
  'ae-video': [['ae/markdown/', 'ae/video/']],
  'ae-api-test': [['ae/reports/api-test/', 'ae/api-test/reports/']],
  'ae-e2e-test': [['ae/screenshots/', 'ae/e2e-test/screenshots/']],
  'ae-work-report': [['ae/reports/', 'ae/work-report/']],
  'ae-playwright': [['ae/screenshots/', 'ae/playwright/screenshots/']],
  'ae-frontend-fix': [['ae/screenshots/', 'ae/frontend-fix/screenshots/']],
  'ae-prototype-preview': [['ae/screenshots/', 'ae/prototype-preview/screenshots/']],
  'ae-spec-html': [['ae/specs/', 'ae/spec-html/specs/']],
  'ae-slides-outline': [['ae/documents/', 'ae/slides-outline/']],
  'ae-docx': [['ae/documents/', 'ae/docx/']],
  'ae-pptx': [['ae/documents/', 'ae/pptx/']],
  'ae-xlsx': [['ae/documents/', 'ae/xlsx/']],
  'ae-pdf': [['ae/markdown/', 'ae/pdf/'], ['ae/documents/', 'ae/pdf/']],
  'ae-review': [['ae/review-state.json', 'ae/review/review-state.json']],
}

/* ------------------------------------------------------------------ *
 * 措辞映射
 * ------------------------------------------------------------------ */

const PHRASE_MAP = [
  // 提问能力
  ['优先使用 opencode 的 `question` 工具。', '优先使用宿主的交互式提问能力（常见别名 AskUserQuestion / question）。'],
  ['优先使用 opencode 的 `question` 工具', '优先使用宿主的交互式提问能力（常见别名 AskUserQuestion / question）'],
  ['使用 opencode 的 `question` 工具', '使用宿主的交互式提问能力（常见别名 AskUserQuestion / question）'],
  ['使用 opencode 的 `question` 工具呈现选项', '使用宿主的交互式提问能力呈现选项'],
  ['使用平台的 `question` 工具', '使用宿主的交互式提问能力（常见别名 AskUserQuestion / question）'],
  ['平台的 `question` 工具', '宿主的交互式提问能力'],
  ['`question` 工具', '交互式提问能力'],
  ['`question` 提供选项', '提问时提供选项'],
  ['禁止 `question` 工具或任何形式提问', '禁止使用交互式提问能力或任何形式提问'],

  // 子代理派发
  ['OpenCode Task 工具支持在同一条消息中发出多个调用时并行执行', '宿主支持子代理派发时，可在同一条消息中一次性发出全部派发调用以并行执行'],
  ['必须在同一轮回复中一次性发出所有 Task 工具调用', '必须在同一轮回复中一次性发出所有子代理派发调用'],
  ['在同一轮回复中一次性发出所有 Task 调用', '在同一轮回复中一次性发出所有子代理派发调用'],
  ['在**同一轮回复**中一次性发出所有 Task 调用', '在**同一轮回复**中一次性发出所有子代理派发调用'],
  ['`task` 工具', '子代理派发能力'],
  ['`task` 工具委托子代理执行', '子代理派发能力委托执行'],
  ['Task 工具', '子代理派发能力'],
  ['Task 调用', '子代理派发调用'],
  ['Task 工具调用', '子代理派发调用'],

  // 宿主专属路径
  ['.opencode/review-state.json', 'ae/review/review-state.json'],
  ['.opencode/rules/', 'ae/save-experience/rules/'],
  ['.opencode/ae.jsonc', 'ae.jsonc'],
  ['`.opencode/`', '`ae/`'],

  // 宿主专属代理
  ['本技能是 opencode 内置 `@explore` 代理的增强版', '本技能是宿主内置代码探索代理的增强版'],
  ['均为已注册的 opencode 代理', '均为本技能内置的角色卡'],
  ['opencode 自行分配模型', '宿主自行分配模型'],
  ['由 opencode 自行分配当前默认模型', '由宿主自行分配当前默认模型'],

  // 命令占位符
  ['<feature_description> #$ARGUMENTS </feature_description>', '<用户输入>\n\n（用户输入为本次任务描述。若为空，先向用户询问："您想定义什么需求？请描述您正在考虑的功能、问题或改进。"）'],
  ['$ARGUMENTS', '用户输入'],
]

/* ------------------------------------------------------------------ *
 * 插件工具 → 脚本调用
 * ------------------------------------------------------------------ */

const TOOL_CALL_MAP = {
  'ae-review': [
    ['调用 `ae-review-scope-analyze` 工具', '运行 `scripts/scope-analyze.mjs`'],
    ['`ae-review-scope-analyze` 工具', '`scripts/scope-analyze.mjs`'],
    ['调用 `ae-specialist-aggregate` 聚合', '运行 `scripts/aggregate.mjs` 聚合'],
    ['`ae-specialist-aggregate` 工具', '`scripts/aggregate.mjs`'],
    ['调用 `ae-review-proof` 写入结构化审查证明', '运行 `scripts/write-proof.mjs` 写入结构化审查证明'],
    ['`ae-review-proof` 工具', '`scripts/write-proof.mjs`'],
  ],
  'ae-work': [
    ['通过 `ae-specialist-aggregate` 聚合结果', '通过 `scripts/aggregate.mjs` 聚合结果'],
    ['`ae-specialist-aggregate` 工具', '`scripts/aggregate.mjs`'],
  ],
  'ae-unit-test': [
    ['调用 `ae-test-triage` 工具', '运行 `scripts/triage.mjs`'],
    ['`ae-test-triage` 工具', '`scripts/triage.mjs`'],
  ],
  'ae-api-test': [
    ['调用 `ae-test-triage` 工具', '运行 `scripts/triage.mjs`'],
    ['`ae-test-triage` 工具', '`scripts/triage.mjs`'],
  ],
  'ae-e2e-test': [
    ['调用 `ae-test-triage` 工具', '运行 `scripts/triage.mjs`'],
    ['`ae-test-triage` 工具', '`scripts/triage.mjs`'],
  ],
  'ae-playwright': [
    ['`ae-async-bash`', '`scripts/async-bash.mjs`'],
    ['ae-async-bash 后台执行', 'scripts/async-bash.mjs 后台执行'],
    ['一律使用 `scripts/async-bash.mjs` 后台执行', '一律使用 `scripts/async-bash.mjs` 后台执行'],
  ],
  'ae-officecli': [
    ['通过 `ae-officecli` 工具调用', '通过 `scripts/officecli.mjs` 调用'],
    ['`ae-officecli` 工具', '`scripts/officecli.mjs`'],
    ['ae-officecli file=', 'node scripts/officecli.mjs run -- '],
  ],
  'ae-docx': [['ae-officecli file=', 'node scripts/officecli.mjs run -- ']],
  'ae-pptx': [['ae-officecli file=', 'node scripts/officecli.mjs run -- ']],
  'ae-xlsx': [['ae-officecli file=', 'node scripts/officecli.mjs run -- ']],
  'ae-pdf': [['`ae-pdf` 工具', '`scripts/pdf.mjs`']],
  'ae-ocr': [['`ae-ocr` 工具', '`scripts/ocr.mjs`']],
}

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

function skillSlug(name) {
  return name.startsWith('ae-') ? name.slice(3) : name
}

function applyPhrases(text, skillName) {
  let out = text
  // 先做"插件工具 → 脚本"的具体映射，再做通用措辞替换
  const toolMap = TOOL_CALL_MAP[skillName] ?? []
  for (const [from, to] of toolMap) {
    out = out.split(from).join(to)
  }
  for (const [from, to] of PHRASE_MAP) {
    out = out.split(from).join(to)
  }
  // 兜底：技能不得再以"工具"方式被引用
  out = out.replace(/`ae-[a-z-]+`\s*工具/g, '`ae-$1` 技能')
  return out
}

function applyPaths(text, skillName) {
  let out = text
  for (const [from, to] of SKILL_PATH_MAP[skillName] ?? []) {
    out = out.split(from).join(to)
  }
  for (const [from, to] of GLOBAL_PATH_MAP) {
    if (from === to) {
      continue
    }
    out = out.split(from).join(to)
  }
  return out
}

function rewriteSkillReferences(text) {
  return text.replace(/\bae:([a-z0-9-]+)\b/g, 'ae-$1')
}

/** 重写 frontmatter 为 Agent Skills 规范 */
function rewriteFrontmatter(content, skillName) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/)
  if (!match) {
    return content
  }
  const data = parseYaml(match[1]) ?? {}
  const body = match[2]

  const next = {
    name: skillName,
    description: typeof data.description === 'string' ? data.description.trim() : '',
    license: 'GPL-3.0-or-later',
    compatibility: '需要 Node.js 18+ 以运行本技能附带脚本；其余依赖见正文"环境要求"章节',
    metadata: {
      author: 'ae-skills',
      version: '1.0.0',
    },
  }

  // 允许已有 metadata 覆盖默认值
  if (data.metadata && typeof data.metadata === 'object') {
    for (const [key, value] of Object.entries(data.metadata)) {
      if (typeof value === 'string') {
        next.metadata[key] = value
      }
    }
  }

  const frontmatter = stringifyYaml(next, { lineWidth: 0 }).trimEnd()
  return `---\n${frontmatter}\n---\n${body}`
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function migrateSkill(legacyName) {
  const skillName = legacyName
  const source = join(LEGACY_DIR, legacyName)
  const target = join(TARGET_DIR, skillName)

  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true })
  }

  // 复制目录
  cpSync(source, target, { recursive: true, force: true })

  // 重写所有 markdown
  const files = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile() && /\.(md|mjs|json|sh)$/.test(entry.name)) {
        files.push(full)
      }
    }
  }
  walk(target)

  for (const file of files) {
    const isSkillFile = relative(target, file) === 'SKILL.md'
    let text = readFileSync(file, 'utf8')

    text = rewriteSkillReferences(text)
    text = applyPhrases(text, skillName)
    text = applyPaths(text, skillName)

    if (isSkillFile) {
      text = rewriteFrontmatter(text, skillName)
    }

    writeFileSync(file, text, 'utf8')
  }

  return { skillName, fileCount: files.length }
}

/** 明确不迁移的技能（能力已废弃或已并入其他技能） */
const SKIP_SKILLS = new Set([
  'ae-handoff',   // 会话交接属宿主专属能力，改为纯文档交接
  'ae-ocr',       // CLI 包装能力并入根技能 ocr-code-review
])

function main() {
  if (!existsSync(LEGACY_DIR)) {
    process.stderr.write(`未找到 ${relative(REPO_ROOT, LEGACY_DIR)}，无需迁移\n`)
    return
  }

  const legacyNames = readdirSync(LEGACY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
    .filter((name) => !SKIP_SKILLS.has(name))

  if (DRY_RUN) {
    process.stdout.write(`将迁移 ${legacyNames.length} 个技能：\n${legacyNames.map((n) => `  ae-${n}`).join('\n')}\n`)
    return
  }

  let totalFiles = 0
  for (const legacyName of legacyNames) {
    const result = migrateSkill(legacyName)
    totalFiles += result.fileCount
    process.stdout.write(`  迁移 ${result.skillName}  (${result.fileCount} 文件)\n`)
  }
  process.stdout.write(`\n共迁移 ${legacyNames.length} 个技能，${totalFiles} 个文件\n`)
}

main()
