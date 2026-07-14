#!/usr/bin/env node
// ae:prd 产物行数校验与拆分脚本
// 用法: node <ae-prd技能目录>/scripts/split-prd.mjs <prd文件路径> [--threshold 300]
// 退出码: 0 = 通过或拆分成功, 1 = 拆分后仍超标, 2 = 文件不存在

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { resolve, dirname, basename, join } from 'node:path'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node <ae-prd技能目录>/scripts/split-prd.mjs <prd文件路径> [--threshold N]')
  console.log('')
  console.log('参数:')
  console.log('  <prd文件路径>  ae:prd 产物文件路径，支持绝对路径和相对路径')
  console.log('  --threshold N   行数阈值，默认 300')
  console.log('')
  console.log('退出码:')
  console.log('  0 = 文件未超标或拆分成功')
  console.log('  1 = 拆分后仍有文件超标')
  console.log('  2 = 文件不存在')
  console.log('')
  console.log('拆分逻辑:')
  console.log('  - 文件 ≤ threshold 行：不拆分，退出')
  console.log('  - 文件 > threshold 行：按 **[分组标题]** 切分需求章节')
  console.log('    全局章节保留在主文件，各模块需求写为 type: prd-shard 子文件')
  console.log('    主文件 frontmatter sharded 改为 true，## 需求 章节替换为分片引用列表')
  process.exit(0)
}

const fileArg = args[0]
const prdFilePath = resolve(fileArg)

const thresholdIdx = args.indexOf('--threshold')
const rawThreshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 300
const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
  ? Math.floor(rawThreshold)
  : (() => { console.log(`警告: --threshold 值无效，使用默认值 300`); return 300 })()

if (!existsSync(prdFilePath) || !statSync(prdFilePath).isFile()) {
  console.error(`错误: 文件不存在或不是文件: ${prdFilePath}`)
  process.exit(2)
}

/**
 * 解析 markdown 文件的 YAML frontmatter
 */
function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return { frontmatter: null, body: content, fmText: '' }
  const fmText = fmMatch[0]
  const body = content.slice(fmText.length).replace(/^\r?\n/, '')
  const frontmatter = {}
  for (const line of fmText.split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      const value = kvMatch[2].trim().replace(/^["']|["']$/g, '')
      frontmatter[kvMatch[1]] = value
    }
  }
  return { frontmatter, body, fmText }
}

/**
 * 从 frontmatter 文本中提取字段并保留顺序
 */
function parseFrontmatterEntries(fmText) {
  const entries = []
  const lines = fmText.replace(/^---\r?\n/, '').replace(/\r?\n---$/, '').split(/\r?\n/)
  for (const line of lines) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      entries.push({ key: kvMatch[1], value: kvMatch[2].trim() })
    }
  }
  return entries
}

/**
 * 构建 frontmatter 文本
 */
function buildFrontmatter(entries) {
  const lines = entries.map(e => `${e.key}: ${e.value}`)
  return `---\n${lines.join('\n')}\n---`
}

function countLines(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  return normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0)
}

/**
 * 将文本转为 kebab-case
 */
function toKebabCase(text) {
  return text
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
}

/**
 * 从 prd 文件名提取 topic
 */
function extractTopic(fileName) {
  return fileName.replace(/-prd\.md$/, '').replace(/^prd-/, '')
}

/**
 * 全局章节标题（保留在主文件中，不拆分）
 */
const GLOBAL_SECTIONS = [
  '问题框架',
  '非功能需求',
  '成功标准',
  '范围边界',
  '关键决策',
  '依赖',
  '假设',
  '待定问题',
  '一致性检查',
  'AI 解析契约',
]

/**
 * 判断章节标题是否为全局章节
 */
function isGlobalSection(heading) {
  for (const g of GLOBAL_SECTIONS) {
    if (heading.includes(g)) return true
  }
  return false
}

/**
 * 按 ## 和 **[分组标题]** 切分 prd 正文
 * 返回 { globalSections: [], requirementGroups: [] }
 */
function splitPrdBody(body) {
  const lines = body.split(/\r?\n/)
  const sections = []
  let currentSection = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const h2Match = line.match(/^##\s+(.+)/)

    if (h2Match) {
      if (currentSection) sections.push(currentSection)
      currentSection = { heading: h2Match[1], headingLine: line, lines: [] }
    } else if (currentSection) {
      currentSection.lines.push(line)
    }
  }
  if (currentSection) sections.push(currentSection)

  // 分离需求章节和其他章节
  const result = { globalSections: [], requirementGroups: [] }

  for (const sec of sections) {
    if (sec.heading.includes('需求') && !isGlobalSection(sec.heading)) {
      // 在需求章节内按 **[分组标题]** 切分
      const groups = []
      let currentGroup = null

      for (const line of sec.lines) {
        const groupMatch = line.match(/^\*\*\[?(.+?)\]?\*\*\s*$/)
        if (groupMatch) {
          if (currentGroup) groups.push(currentGroup)
          currentGroup = { title: groupMatch[1], lines: [line] }
        } else if (currentGroup) {
          currentGroup.lines.push(line)
        } else {
          currentGroup = { title: '__header__', lines: [line] }
        }
      }
      if (currentGroup) groups.push(currentGroup)

      // 过滤掉 __header__（需求章节头部内容），只保留真实分组
      result.requirementGroups = groups.filter(g => g.title !== '__header__')
    } else {
      result.globalSections.push(sec)
    }
  }

  return result
}

// 主逻辑
const content = readFileSync(prdFilePath, 'utf-8')
const { frontmatter, body, fmText } = parseFrontmatter(content)
const lines = countLines(content)
const dir = dirname(prdFilePath)
const fileName = basename(prdFilePath)
const topic = frontmatter?.topic || extractTopic(fileName)

console.log('=== ae:prd 产物行数校验与拆分 ===')
console.log(`文件: ${prdFilePath}`)
console.log(`行数: ${lines}`)
console.log(`阈值: ${threshold} 行`)

if (lines <= threshold) {
  console.log('文件未超标，无需拆分。')
  process.exit(0)
}

console.log(`文件超标 ${lines - threshold} 行，开始拆分...`)

// 检查是否已经是 sharded 文件
if (frontmatter?.sharded === 'true') {
  console.log('文件已是 sharded: true 索引文件，跳过拆分。')
  process.exit(0)
}

// 切分正文
const { globalSections, requirementGroups } = splitPrdBody(body)

if (requirementGroups.length === 0) {
  console.log('未找到需求分组（**[分组标题]**），无法拆分。')
  process.exit(1)
}

console.log(`找到 ${requirementGroups.length} 个需求分组：${requirementGroups.map(g => g.title).join(', ')}`)

// 生成 prd-shard 子文件
const shardFiles = []

for (const group of requirementGroups) {
  const moduleKebab = toKebabCase(group.title)
  const shardFileName = `${topic}-${moduleKebab}-shard.md`
  const shardPath = join(dir, shardFileName)

  const shardFmEntries = [
    { key: 'type', value: 'prd-shard' },
    { key: 'parent', value: fileName },
    { key: 'module', value: moduleKebab },
  ]
  const shardFm = buildFrontmatter(shardFmEntries)
  const shardBody = group.lines.join('\n')
  const shardContent = `${shardFm}\n\n${shardBody}\n`

  writeFileSync(shardPath, shardContent, 'utf-8')
  const shardLines = countLines(shardContent)
  shardFiles.push({ file: shardFileName, module: moduleKebab, lines: shardLines })

  console.log(`  生成 ${shardFileName}: ${shardLines} 行`)
}

// 更新主文件
const fmEntries = parseFrontmatterEntries(fmText)

// 更新 sharded 为 true
const shardedIdx = fmEntries.findIndex(e => e.key === 'sharded')
if (shardedIdx >= 0) {
  fmEntries[shardedIdx].value = 'true'
} else {
  fmEntries.push({ key: 'sharded', value: 'true' })
}

// 添加 shards 索引（如果不存在）
const shardsIdx = fmEntries.findIndex(e => e.key === 'shards')
const shardsValue = `[${shardFiles.map(f => `{file: ${f.file}, module: ${f.module}}`).join(', ')}]`
if (shardsIdx >= 0) {
  fmEntries[shardsIdx].value = shardsValue
} else {
  fmEntries.push({ key: 'shards', value: shardsValue })
}

const newFm = buildFrontmatter(fmEntries)

// 构建新主文件正文
const newBodyParts = []

// 保留全局章节
for (const sec of globalSections) {
  newBodyParts.push(`${sec.headingLine}`)
  newBodyParts.push(sec.lines.join('\n'))
  newBodyParts.push('')
}

// 替换需求章节为分片引用列表
newBodyParts.push('## 需求')
newBodyParts.push('')
newBodyParts.push('> 需求已按模块分片，详见以下子文件：')
newBodyParts.push('')
for (const sf of shardFiles) {
  newBodyParts.push(`- [${sf.module}](${sf.file})`)
}
newBodyParts.push('')

const newContent = `${newFm}\n\n${newBodyParts.join('\n')}\n`
writeFileSync(prdFilePath, newContent, 'utf-8')
const newLines = countLines(newContent)

console.log('')
console.log(`主文件更新后: ${newLines} 行`)
console.log(`拆分生成 ${shardFiles.length} 个子文件`)

// 校验拆分后所有文件行数
const allFiles = [prdFilePath, ...shardFiles.map(f => join(dir, f.file))]
const violations = []
for (const fp of allFiles) {
  const fc = readFileSync(fp, 'utf-8')
  const fl = countLines(fc)
  if (fl > threshold) {
    violations.push({ file: basename(fp), lines: fl })
  }
}

if (violations.length > 0) {
  console.log('')
  console.log(`警告: 拆分后仍有 ${violations.length} 个文件超标：`)
  for (const v of violations) {
    console.log(`  ${v.file}: ${v.lines} 行`)
  }
  console.log('建议对超标的 prd-shard 子文件按需求分组进一步拆分。')
  process.exit(1)
}

console.log('所有文件通过校验。')

// 输出 JSON 结果
const jsonResult = {
  action: 'split',
  mainFile: prdFilePath,
  linesBefore: lines,
  linesAfter: newLines,
  shardFiles,
  threshold,
  passed: true,
}

console.log('---JSON---')
console.log(JSON.stringify(jsonResult, null, 2))

process.exit(0)
