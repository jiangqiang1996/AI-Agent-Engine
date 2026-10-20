#!/usr/bin/env node
/**
 * 角色卡校验器（零外部依赖，Node 18+，ESM）
 *
 * 用法：node scripts/quick_validate.mjs <role-file-or-dir>
 *
 * 退出码：0 通过，1 失败，2 有告警。
 *
 * 校验项：
 *   1. 文件名与标题行
 *   2. 五个固定段落齐全且非空
 *   3. 段落顺序符合规范（告警）
 *   4. 不含 frontmatter
 *   5. 不含宿主专属语法
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const REQUIRED_SECTIONS = ['职责', '触发条件', '输入契约', '输出契约', '工作流']

/** 宿主专属语法：角色卡里一律不得出现 */
const FORBIDDEN_PATTERNS = [
  { pattern: /\bopencode\b/i, message: '包含宿主专属名 opencode' },
  { pattern: /\.opencode\//, message: '包含宿主专属路径 .opencode/' },
  { pattern: /mode\s*:\s*subagent/i, message: '包含宿主专属 frontmatter mode: subagent' },
  { pattern: /\bsteps\s*:/i, message: '包含宿主专属 frontmatter steps:' },
  { pattern: /\bsubagent_type\b/, message: '包含宿主专属参数 subagent_type' },
  { pattern: /\$ARGUMENTS\b/, message: '包含宿主专属占位符 $ARGUMENTS' },
]

function usage() {
  return [
    '用法: node scripts/quick_validate.mjs <role-file-or-dir>',
    '',
    '  <role-file>   单个角色卡 Markdown 文件',
    '  <role-dir>    技能目录（自动定位 references/roles/ 或 roles/ 下的角色卡）',
  ].join('\n')
}

function extractSections(body) {
  const sections = []
  const lines = body.split(/\r?\n/)
  let current = null
  let buffer = []

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      if (current) {
        current.content = buffer.join('\n').trim()
        sections.push(current)
      }
      current = { title: heading[1].trim(), content: '' }
      buffer = []
      continue
    }
    if (current) {
      buffer.push(line)
    }
  }
  if (current) {
    current.content = buffer.join('\n').trim()
    sections.push(current)
  }

  return sections
}

async function collectRoleFiles(target) {
  const info = await stat(target)
  if (info.isFile()) {
    return [target]
  }
  if (!info.isDirectory()) {
    throw new Error(`目标不是文件或目录: ${target}`)
  }

  const candidates = [
    path.join(target, 'references', 'roles'),
    path.join(target, 'roles'),
    target,
  ]

  for (const dir of candidates) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(dir, entry.name))
      .sort()
    if (files.length > 0) {
      return files
    }
  }

  return []
}

async function validateRoleCard(filePath) {
  const errors = []
  const warnings = []
  const text = await readFile(filePath, 'utf8')
  const fileName = path.basename(filePath, '.md')

  if (!NAME_PATTERN.test(fileName)) {
    errors.push(`文件名必须为 kebab-case: ${fileName}.md`)
  }

  if (/^\s*---\r?\n/.test(text)) {
    errors.push('角色卡不应包含 frontmatter，角色卡是纯 Markdown')
  }

  const titleLine = text.split(/\r?\n/).find((line) => line.trim() !== '')
  if (!titleLine || !/^#\s+角色[:：]\s*\S+/.test(titleLine.trim())) {
    errors.push('缺少标题行，要求形如 "# 角色：<角色名>"')
  }

  const sections = extractSections(text)
  for (const name of REQUIRED_SECTIONS) {
    const matches = sections.filter((section) => section.title === name || section.title.startsWith(name))
    if (matches.length === 0) {
      errors.push(`缺少段落: ## ${name}`)
      continue
    }
    if (matches.length > 1) {
      errors.push(`段落重复: ## ${name} 出现 ${matches.length} 次`)
      continue
    }
    if (!matches[0].content.trim()) {
      errors.push(`段落为空: ## ${name}`)
    }
  }

  const order = sections
    .map((section) => REQUIRED_SECTIONS.find((name) => section.title === name || section.title.startsWith(name)))
    .filter(Boolean)
  const expectedOrder = REQUIRED_SECTIONS.filter((name) => order.includes(name))
  if (order.join('>') !== expectedOrder.join('>')) {
    warnings.push(`段落顺序应为: ${REQUIRED_SECTIONS.join(' → ')}`)
  }

  for (const { pattern, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      errors.push(message)
    }
  }

  return { filePath, errors, warnings }
}

async function main() {
  const target = process.argv[2]
  if (!target) {
    throw new Error('缺少校验目标')
  }

  const files = await collectRoleFiles(path.resolve(target))
  if (files.length === 0) {
    throw new Error('未找到角色卡 Markdown 文件')
  }

  const results = []
  for (const file of files) {
    results.push(await validateRoleCard(file))
  }

  const failed = results.filter((result) => result.errors.length > 0)
  const warned = results.filter((result) => result.errors.length === 0 && result.warnings.length > 0)

  for (const result of warned) {
    for (const warning of result.warnings) {
      console.warn(`警告 ${result.filePath}: ${warning}`)
    }
  }

  if (failed.length > 0) {
    console.error('校验失败:')
    for (const result of failed) {
      console.error(`- ${result.filePath}`)
      for (const issue of result.errors) {
        console.error(`  - ${issue}`)
      }
    }
    process.exitCode = 1
    return
  }

  if (warned.length > 0) {
    process.stdout.write(`校验通过: ${results.length} 个角色卡（含 ${warned.length} 个告警）\n`)
    process.exitCode = 2
    return
  }

  process.stdout.write(`校验通过: ${results.length} 个角色卡\n`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  console.error('')
  console.error(usage())
  process.exitCode = 1
})
