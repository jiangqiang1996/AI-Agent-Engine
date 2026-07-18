#!/usr/bin/env node
// ae:prd 递归兜底拆分脚本
// 用法: node <ae-prd技能目录>/scripts/enforce-shard-limit.mjs <prd目录路径> [--threshold 300]
// 退出码: 0 = 通过或拆分成功, 1 = 拆分后仍超标, 2 = 目录不存在

import { readdirSync, readFileSync, writeFileSync, existsSync, lstatSync, mkdirSync, unlinkSync } from 'node:fs'
import { resolve, dirname, basename, join, relative } from 'node:path'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node <ae-prd技能目录>/scripts/enforce-shard-limit.mjs <prd目录路径> [--threshold N]')
  console.log('')
  console.log('参数:')
  console.log('  <prd目录路径>  ae:prd 产物目录，支持绝对路径和相对路径')
  console.log('  --threshold N   行数阈值，默认 300')
  console.log('')
  console.log('退出码:')
  console.log('  0 = 所有文件通过或拆分成功')
  console.log('  1 = 拆分后仍有文件超标')
  console.log('  2 = 目录不存在')
  console.log('')
  console.log('兜底逻辑:')
  console.log('  - 扫描目录下所有 .md 文件（prd.md 索引文件豁免）')
  console.log('  - 超标文件按降级链递归切分：### → #### → 段落空行 → 硬切')
  console.log('  - 每个切出片段注入 heading_chain frontmatter')
  console.log('  - 更新 prd.md 索引表')
  process.exit(0)
}

const dirArg = args[0]
const prdDir = resolve(dirArg)

const thresholdIdx = args.indexOf('--threshold')
const rawThreshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 300
const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
  ? Math.floor(rawThreshold)
  : (() => { console.log(`警告: --threshold 值无效，使用默认值 300`); return 300 })()

if (!existsSync(prdDir) || !lstatSync(prdDir).isDirectory()) {
  console.error(`错误: 目录不存在或不是目录: ${prdDir}`)
  process.exit(2)
}

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

function buildFrontmatter(entries) {
  const lines = entries.map(e => `${e.key}: ${e.value}`)
  return `---\n${lines.join('\n')}\n---`
}

function countLines(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  return normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0)
}

function toKebabCase(text) {
  const result = text
    .replace(/[^\w\s\u4e00-\u9fa5]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
  return result || 'section'
}

function collectMdFiles(dir, baseDir) {
  const results = []
  const entries = readdirSync(dir)
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    const stat = lstatSync(fullPath)
    if (stat.isDirectory()) {
      results.push(...collectMdFiles(fullPath, baseDir))
    } else if (entry.endsWith('.md')) {
      results.push(relative(baseDir, fullPath).replace(/\\/g, '/'))
    }
  }
  return results
}

/**
 * 按 markdown 标题切分文件内容
 * 返回 [{ heading, headingLine, lines, level }] 或 null（无标题可切）
 */
function splitByHeadings(body, minLevel) {
  const lines = body.split(/\r?\n/)
  const sections = []
  let currentSection = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      if (level >= minLevel) {
        if (currentSection) sections.push(currentSection)
        currentSection = { heading: headingMatch[2], headingLine: line, lines: [], level }
        continue
      }
    }
    if (currentSection) {
      currentSection.lines.push(line)
    } else {
      currentSection = { heading: '__pre__', headingLine: '', lines: [line], level: 0 }
    }
  }
  if (currentSection) sections.push(currentSection)

  const realSections = sections.filter(s => s.heading !== '__pre__')
  if (realSections.length < 2) return null
  return sections
}

/**
 * 按段落空行切分
 */
function splitByParagraphs(body, maxLines) {
  const lines = body.split(/\r?\n/)
  const chunks = []
  let currentChunk = []

  for (const line of lines) {
    currentChunk.push(line)
    if (line.trim() === '' && currentChunk.length >= maxLines * 0.6) {
      chunks.push(currentChunk)
      currentChunk = []
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk)

  if (chunks.length < 2) {
    // 无法按段落切，硬切（预留 frontmatter 空间）
    const chunkSize = Math.max(maxLines - 10, Math.floor(maxLines * 0.8))
    const hardChunks = []
    for (let i = 0; i < lines.length; i += chunkSize) {
      hardChunks.push(lines.slice(i, i + chunkSize))
    }
    return hardChunks
  }

  return chunks
}

/**
 * 递归拆分超标文件
 */
function enforceFile(filePath, threshold, headingChain, depth) {
  const content = readFileSync(filePath, 'utf-8')
  const lines = countLines(content)

  if (lines <= threshold) return { file: filePath, lines, split: false }

  const { frontmatter, body, fmText } = parseFrontmatter(content)
  const fileDir = dirname(filePath)
  const fileBase = basename(filePath, '.md')

  // 提取现有 heading_chain
  const existingChain = frontmatter?.heading_chain || headingChain || ''

  console.log(`  ${relative(prdDir, filePath)}: ${lines} 行 > ${threshold}，开始递归拆分...`)

  // 降级链：尝试 ### → #### → 段落 → 硬切
  const minLevel = depth === 0 ? 3 : Math.min(depth + 3, 6)
  const sections = splitByHeadings(body, minLevel)

  if (sections && sections.length >= 2) {
    // 按标题切分
    const splitFiles = []
    let preContent = ''
    let fileIdx = 0

    // 收集前置内容
    const preSection = sections.find(s => s.heading === '__pre__')
    if (preSection && sections.length > 1) {
      preContent = preSection.lines.join('\n').trim()
    }

    for (const sec of sections) {
      if (sec.heading === '__pre__') continue

      fileIdx++
      const secKebab = toKebabCase(sec.heading) || `section-${fileIdx}`
      let splitFileName = `${fileBase}-${secKebab}.md`
      let splitPath = join(fileDir, splitFileName)

      // 文件名冲突检测
      let nameSuffix = 1
      while (existsSync(splitPath) && nameSuffix < 100) {
        splitFileName = `${fileBase}-${secKebab}-${nameSuffix}.md`
        splitPath = join(fileDir, splitFileName)
        nameSuffix++
      }

      const secChain = existingChain ? `${existingChain} > ${sec.heading}` : sec.heading

      const fmEntries = [
        { key: 'type', value: 'prd-shard' },
        { key: 'section', value: secKebab },
        { key: 'parent', value: basename(filePath) },
        { key: 'module', value: secKebab },
        { key: 'heading_chain', value: `"${secChain}"` },
      ]
      const splitFm = buildFrontmatter(fmEntries)
      // 前置内容合并到第一个真实章节
      const splitBody = preContent && fileIdx === 1
        ? `${sec.headingLine}\n${preContent}\n\n${sec.lines.join('\n')}`
        : `${sec.headingLine}\n${sec.lines.join('\n')}`
      const splitContent = `${splitFm}\n\n${splitBody}\n`

      writeFileSync(splitPath, splitContent, 'utf-8')
      const splitLines = countLines(splitContent)

      // 递归检查切出的文件是否仍超标
      if (splitLines > threshold && depth < 4) {
        const subResult = enforceFile(splitPath, threshold, secChain, depth + 1)
        splitFiles.push(subResult)
      } else {
        splitFiles.push({ file: splitPath, lines: splitLines, split: true })
      }
    }

    // 删除原文件（已被拆分替代）
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }

    return { file: filePath, lines, split: true, children: splitFiles }
  }

  // 无标题可切，按段落/硬切
  console.log(`    无标题可切，按段落拆分...`)
  const chunks = splitByParagraphs(body, threshold)
  const splitFiles = []

  for (let i = 0; i < chunks.length; i++) {
    const chunkFileName = `${fileBase}-part${i + 1}.md`
    const chunkPath = join(fileDir, chunkFileName)
    const chunkChain = `${existingChain} (Part ${i + 1})`

    const fmEntries = [
      { key: 'type', value: 'prd-shard' },
      { key: 'section', value: `part${i + 1}` },
      { key: 'parent', value: basename(filePath) },
      { key: 'module', value: `part${i + 1}` },
      { key: 'heading_chain', value: `"${chunkChain}"` },
    ]
    const chunkFm = buildFrontmatter(fmEntries)
    const chunkContent = `${chunkFm}\n\n${chunks[i].join('\n')}\n`

    writeFileSync(chunkPath, chunkContent, 'utf-8')
    const chunkLines = countLines(chunkContent)

    // 递归检查切出的文件是否仍超标
    if (chunkLines > threshold && depth < 4) {
      const subResult = enforceFile(chunkPath, threshold, chunkChain, depth + 1)
      splitFiles.push(subResult)
    } else {
      splitFiles.push({ file: chunkPath, lines: chunkLines, split: true })
    }
  }

  // 删除原文件
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }

  return { file: filePath, lines, split: true, children: splitFiles }
}

/**
 * 更新 prd.md 索引表
 */
function updateIndex(prdDir, threshold) {
  const prdMdPath = join(prdDir, 'prd.md')
  if (!existsSync(prdMdPath)) return

  const allMdFiles = collectMdFiles(prdDir, prdDir)
  const sectionFiles = []

  for (const file of allMdFiles) {
    if (file === 'prd.md') continue
    const filePath = join(prdDir, file)
    const content = readFileSync(filePath, 'utf-8')
    const { frontmatter, body } = parseFrontmatter(content)
    const lines = countLines(content)

    const section = frontmatter?.section || basename(file, '.md')
    const headingChain = frontmatter?.heading_chain || section

    // 提取摘要：正文第一行非空非标题文本
    let summary = ''
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        summary = trimmed.slice(0, 60)
        break
      }
    }

    // 提取稳定 ID
    const idMatches = body.match(/\b([RNQD]\d+)\b/g) || []
    const stableIds = [...new Set(idMatches)].join(', ')

    sectionFiles.push({ file, section, lines, summary, stableIds, headingChain })
  }

  // 读取现有 prd.md frontmatter
  const prdContent = readFileSync(prdMdPath, 'utf-8')
  const { frontmatter, fmText } = parseFrontmatter(prdContent)

  // 构建索引表
  const indexLines = [
    '| 文件 | 章节 | 行数 | 摘要 | 稳定 ID |',
    '|------|------|------|------|---------|',
  ]

  for (const sf of sectionFiles) {
    const ids = sf.stableIds || '—'
    const summary = sf.summary || '—'
    indexLines.push(`| [${sf.file}](${sf.file}) | ${sf.headingChain} | ${sf.lines} | ${summary} | ${ids} |`)
  }

  // 构建新 prd.md
  const fmEntries = parseFrontmatterEntries(fmText)
  const shardedIdx = fmEntries.findIndex(e => e.key === 'sharded')
  if (shardedIdx >= 0) {
    fmEntries[shardedIdx].value = 'true'
  } else {
    fmEntries.push({ key: 'sharded', value: 'true' })
  }
  const newFm = buildFrontmatter(fmEntries)

  // 提取标题
  const { body: prdBody } = parseFrontmatter(prdContent)
  const titleMatch = prdBody.match(/^#\s+(.+)/m)
  const title = titleMatch ? titleMatch[0] : '# 需求文档'

  const newContent = `${newFm}\n\n${title}\n\n## 索引\n\n${indexLines.join('\n')}\n`
  writeFileSync(prdMdPath, newContent, 'utf-8')
  console.log(`prd.md 索引已更新（${sectionFiles.length} 个子文件）`)
}

// 主逻辑
console.log('=== ae:prd 递归兜底拆分 ===')
console.log(`目录: ${prdDir}`)
console.log(`阈值: ${threshold} 行`)
console.log('')

const allMdFiles = collectMdFiles(prdDir, prdDir)
const violations = []
const splitResults = []

for (const file of allMdFiles) {
  if (file === 'prd.md') continue

  const filePath = join(prdDir, file)
  const content = readFileSync(filePath, 'utf-8')
  const lines = countLines(content)

  if (lines > threshold) {
    const { frontmatter } = parseFrontmatter(content)
    const headingChain = frontmatter?.heading_chain || file
    const result = enforceFile(filePath, threshold, headingChain, 0)
    splitResults.push(result)
  }
}

// 更新索引
if (splitResults.length > 0) {
  console.log('')
  console.log('更新 prd.md 索引...')
  updateIndex(prdDir, threshold)
}

// 最终校验
console.log('')
console.log('--- 最终校验 ---')
const finalFiles = collectMdFiles(prdDir, prdDir)
let allPassed = true

for (const file of finalFiles) {
  if (file === 'prd.md') continue
  const filePath = join(prdDir, file)
  const content = readFileSync(filePath, 'utf-8')
  const lines = countLines(content)
  if (lines > threshold) {
    violations.push({ file, lines })
    allPassed = false
  }
}

if (violations.length > 0) {
  console.log(`警告: 拆分后仍有 ${violations.length} 个文件超标：`)
  for (const v of violations) {
    console.log(`  ${v.file}: ${v.lines} 行`)
  }
  process.exit(1)
}

console.log(`所有文件通过校验（${finalFiles.length - 1} 个子文件）。`)

const jsonResult = {
  action: 'enforce',
  prdDir,
  threshold,
  splitCount: splitResults.length,
  passed: allPassed,
}

console.log('---JSON---')
console.log(JSON.stringify(jsonResult, null, 2))
process.exit(0)
