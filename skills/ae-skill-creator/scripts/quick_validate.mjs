#!/usr/bin/env node
/**
 * Agent Skills 技能校验器（零外部依赖，Node 18+，ESM）
 *
 * 用法：node scripts/quick_validate.mjs <skill-dir>
 *
 * 校验项：
 *   1. SKILL.md 存在
 *   2. frontmatter 存在且可解析
 *   3. 字段集合合法（只允许规范字段）
 *   4. name 合法且等于目录名
 *   5. description 非空且 ≤1024 字符
 *   6. compatibility ≤500 字符
 *   7. metadata 为 string → string 映射
 *   8. 正文非空且 ≤500 行
 *   9. 正文引用的 references/ scripts/ assets/ 文件真实存在
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ALLOWED_FRONTMATTER = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
])

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 1024
const MAX_COMPATIBILITY_LENGTH = 500
const MAX_BODY_LINES = 500
const SKILL_RELATIVE = /^(references|scripts|assets)\/[A-Za-z0-9._/-]+$/
const NUMERIC_LIKE = /^[-+]?[0-9]+(\.[0-9]+)?$/
const BOOLEAN_LIKE = /^(true|false|null|yes|no|on|off)$/i

function usage() {
  return '用法: node scripts/quick_validate.mjs <skill-dir>'
}

/* ------------------------------------------------------------------ *
 * 极简 YAML frontmatter 解析器
 *
 * 支持：
 *   key: value
 *   key: "quoted"  /  key: 'quoted'
 *   key:            （后跟缩进的 - item 列表）
 *   key:            （后跟缩进的 key: value 映射）
 * 不支持：锚点、别名、多行块标量、流式写法、超过两层的嵌套。
 * ------------------------------------------------------------------ */

function parseQuoted(text) {
  const quote = text[0]
  let index = 1

  while (index < text.length) {
    const ch = text[index]
    if (quote === '"' && ch === '\\') {
      index += 2
      continue
    }
    if (ch === quote) {
      const inner = text.slice(1, index)
      if (quote === '"') {
        try {
          return JSON.parse(text.slice(0, index + 1))
        } catch {
          return inner
        }
      }
      return inner.replace(/''/g, "'")
    }
    index += 1
  }

  return null
}

function parseScalar(raw) {
  const text = raw.trim()
  if (text === '') {
    return { value: '', quoted: false }
  }
  const first = text[0]
  if (first === '"' || first === "'") {
    const parsed = parseQuoted(text)
    if (parsed !== null) {
      return { value: parsed, quoted: true }
    }
  }
  return { value: text, quoted: false }
}

function parseYaml(source) {
  const lines = source.split(/\r?\n/)
  const root = new Map()
  let index = 0

  while (index < lines.length) {
    const raw = lines[index]
    const trimmed = raw.trim()

    if (trimmed === '' || trimmed.startsWith('#')) {
      index += 1
      continue
    }

    const indent = raw.length - raw.trimStart().length
    if (indent > 0) {
      throw new Error(`frontmatter 存在无法归属的缩进行: ${trimmed}`)
    }

    const match = raw.match(/^([A-Za-z0-9_.$-]+)[ \t]*:(.*)$/)
    if (!match) {
      throw new Error(`frontmatter 行无法解析: ${trimmed}`)
    }

    const key = match[1]
    const inline = match[2].trim()

    if (inline !== '') {
      root.set(key, parseScalar(inline))
      index += 1
      continue
    }

    const block = []
    let cursor = index + 1
    while (cursor < lines.length) {
      const line = lines[cursor]
      if (line.trim() === '') {
        block.push('')
        cursor += 1
        continue
      }
      const lineIndent = line.length - line.trimStart().length
      if (lineIndent === 0) {
        break
      }
      block.push(line)
      cursor += 1
    }
    while (block.length > 0 && block[block.length - 1] === '') {
      block.pop()
    }

    if (block.length === 0) {
      root.set(key, { value: '', quoted: false })
      index = cursor
      continue
    }

    const isList = block.every((line) => line.trim() === '-' || line.trim().startsWith('- '))
    if (isList) {
      root.set(key, { list: block.map((line) => parseScalar(line.trim().replace(/^-\s*/, ''))) })
    } else {
      const baseIndent = block[0].length - block[0].trimStart().length
      const map = new Map()
      for (const line of block) {
        const lineIndent = line.length - line.trimStart().length
        if (lineIndent > baseIndent) {
          throw new Error(`frontmatter 嵌套层级过深（规范只支持两层）: ${line.trim()}`)
        }
        const item = line.match(/^\s*([A-Za-z0-9_.$-]+)[ \t]*:(.*)$/)
        if (!item) {
          throw new Error(`frontmatter 嵌套结构无法解析: ${line.trim()}`)
        }
        map.set(item[1], parseScalar(item[2]))
      }
      root.set(key, { map })
    }

    index = cursor
  }

  return root
}

function splitFrontmatter(content) {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/)
  if (!match) {
    throw new Error('缺少 YAML frontmatter（必须以 --- 开头并成对闭合）')
  }
  return { frontmatter: match[1] ?? '', body: match[2] ?? '' }
}

/* ------------------------------------------------------------------ *
 * 校验主体
 * ------------------------------------------------------------------ */

function isScalar(entry) {
  return Boolean(entry) && !entry.list && !entry.map
}

function describe(entry) {
  if (!entry) {
    return '缺失'
  }
  if (entry.list) {
    return '列表'
  }
  if (entry.map) {
    return '映射'
  }
  return typeof entry.value
}

function extractReferences(body) {
  const refs = new Set()
  const patterns = [/\]\(([^)#]+?)\)/g, /`([^`\n]+)`/g]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(body)) !== null) {
      let target = match[1].trim()
      if (target.startsWith('@')) {
        target = target.slice(1).trim()
      }
      if (target.startsWith('./')) {
        target = target.slice(2)
      }
      if (SKILL_RELATIVE.test(target)) {
        refs.add(target)
      }
    }
  }

  return [...refs]
}

function validateSkill(skillDir) {
  const errors = []
  const skillFile = path.join(skillDir, 'SKILL.md')

  if (!existsSync(skillFile)) {
    return { skillFile, errors: [`缺少 SKILL.md: ${skillFile}`] }
  }

  const content = readFileSync(skillFile, 'utf8')
  let frontmatter = ''
  let body = ''
  try {
    const split = splitFrontmatter(content)
    frontmatter = split.frontmatter
    body = split.body
  } catch (error) {
    return { skillFile, errors: [error instanceof Error ? error.message : String(error)] }
  }

  let data
  try {
    data = parseYaml(frontmatter)
  } catch (error) {
    return { skillFile, errors: [error instanceof Error ? error.message : String(error)] }
  }

  /* --- 字段集合 --- */
  for (const key of data.keys()) {
    if (!ALLOWED_FRONTMATTER.has(key)) {
      errors.push(`frontmatter 含非规范字段 "${key}"（允许：${[...ALLOWED_FRONTMATTER].join(', ')}）`)
    }
  }

  /* --- name --- */
  const expectedName = path.basename(path.resolve(skillDir))
  const nameEntry = data.get('name')
  if (!nameEntry) {
    errors.push('frontmatter 缺少 name')
  } else if (!isScalar(nameEntry)) {
    errors.push(`name 必须是字符串，当前是${describe(nameEntry)}`)
  } else {
    const name = String(nameEntry.value).trim()
    if (name === '') {
      errors.push('frontmatter 缺少 name')
    } else {
      if (name.length > MAX_NAME_LENGTH) {
        errors.push(`name 超过 ${MAX_NAME_LENGTH} 字符: ${name.length}`)
      }
      if (!NAME_PATTERN.test(name)) {
        errors.push(`name 不符合规范（^[a-z0-9]+(-[a-z0-9]+)*$）: ${name}`)
      }
      if (name !== expectedName) {
        errors.push(`name (${name}) 与目录名 (${expectedName}) 不一致`)
      }
    }
  }

  /* --- description --- */
  const descriptionEntry = data.get('description')
  if (!descriptionEntry) {
    errors.push('frontmatter 缺少 description')
  } else if (!isScalar(descriptionEntry)) {
    errors.push(`description 必须是字符串，当前是${describe(descriptionEntry)}`)
  } else {
    const description = String(descriptionEntry.value).trim()
    if (description === '') {
      errors.push('frontmatter 缺少 description')
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`description 超过 ${MAX_DESCRIPTION_LENGTH} 字符: ${description.length}`)
    }
  }

  /* --- license --- */
  const licenseEntry = data.get('license')
  if (licenseEntry && !isScalar(licenseEntry)) {
    errors.push(`license 必须是字符串，当前是${describe(licenseEntry)}`)
  }

  /* --- compatibility --- */
  const compatibilityEntry = data.get('compatibility')
  if (compatibilityEntry) {
    if (!isScalar(compatibilityEntry)) {
      errors.push(`compatibility 必须是字符串，当前是${describe(compatibilityEntry)}`)
    } else if (String(compatibilityEntry.value).length > MAX_COMPATIBILITY_LENGTH) {
      errors.push(`compatibility 超过 ${MAX_COMPATIBILITY_LENGTH} 字符: ${String(compatibilityEntry.value).length}`)
    }
  }

  /* --- allowed-tools --- */
  const allowedToolsEntry = data.get('allowed-tools')
  if (allowedToolsEntry && !isScalar(allowedToolsEntry)) {
    errors.push(`allowed-tools 必须是空格分隔的字符串，当前是${describe(allowedToolsEntry)}`)
  }

  /* --- metadata --- */
  const metadataEntry = data.get('metadata')
  if (metadataEntry) {
    if (!metadataEntry.map) {
      errors.push(`metadata 必须是 string → string 映射，当前是${describe(metadataEntry)}`)
    } else {
      for (const [key, entry] of metadataEntry.map) {
        if (!isScalar(entry)) {
          errors.push(`metadata.${key} 必须是字符串，当前是${describe(entry)}`)
          continue
        }
        const value = String(entry.value)
        if (value.trim() === '') {
          errors.push(`metadata.${key} 必须是字符串（当前为空值）`)
          continue
        }
        if (!entry.quoted && (NUMERIC_LIKE.test(value) || BOOLEAN_LIKE.test(value))) {
          errors.push(`metadata.${key} 必须是字符串，请加引号（例如 version: "1.0.0"）`)
        }
      }
    }
  }

  /* --- 正文 --- */
  const bodyLines = body.split(/\r?\n/).length
  if (!body.trim()) {
    errors.push('SKILL.md 正文为空')
  } else if (bodyLines > MAX_BODY_LINES) {
    errors.push(`正文 ${bodyLines} 行，超过 ${MAX_BODY_LINES} 行上限，请拆分到 references/`)
  }

  /* --- 引用文件 --- */
  for (const ref of extractReferences(body)) {
    const target = path.resolve(skillDir, ref)
    if (!existsSync(target)) {
      errors.push(`正文引用的文件不存在: ${ref}`)
    }
  }

  return { skillFile, errors }
}

function main() {
  const target = process.argv[2]
  if (!target) {
    throw new Error('缺少技能目录')
  }

  const skillDir = path.resolve(target)
  if (!existsSync(skillDir) || !statSync(skillDir).isDirectory()) {
    throw new Error(`技能目录不存在: ${skillDir}`)
  }

  const result = validateSkill(skillDir)
  if (result.errors.length > 0) {
    console.error(`校验失败: ${result.skillFile}`)
    for (const issue of result.errors) {
      console.error(`  - ${issue}`)
    }
    process.exitCode = 1
    return
  }

  process.stdout.write(`校验通过: ${result.skillFile}\n`)
}

main()
