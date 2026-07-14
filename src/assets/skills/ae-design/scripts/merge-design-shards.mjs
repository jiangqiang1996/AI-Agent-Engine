#!/usr/bin/env node
// ae:design 二级子文件合并脚本
// 用法: node <ae-design技能目录>/scripts/merge-design-shards.mjs <design目录路径> [--threshold 300]
// 退出码: 0 = 成功, 1 = 合并后校验失败, 2 = 目录不存在

import { readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync, lstatSync } from 'node:fs'
import { resolve, join, basename, relative } from 'node:path'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node <ae-design技能目录>/scripts/merge-design-shards.mjs <design目录路径> [--threshold N]')
  console.log('')
  console.log('参数:')
  console.log('  <design目录路径>  ae:design 产物目录，支持绝对路径和相对路径')
  console.log('  --threshold N      行数阈值，默认 300')
  console.log('')
  console.log('退出码:')
  console.log('  0 = 合并成功或无需合并')
  console.log('  1 = 合并后校验失败')
  console.log('  2 = 目录不存在')
  console.log('')
  console.log('合并逻辑:')
  console.log('  - 找出所有 sub_split: true 的维度文件（引用清单）')
  console.log('  - 收集其所有二级子文件（parent 匹配）')
  console.log('  - 计算合并后行数 = 父文件 frontmatter + 各子文件正文拼接')
  console.log('  - 合并后 ≤ threshold → 合并回父文件，删除子文件')
  console.log('  - 合并后 > threshold → 保持拆分状态')
  process.exit(0)
}

const dirArg = args[0]
const designDir = resolve(dirArg)

const thresholdIdx = args.indexOf('--threshold')
const rawThreshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 300
const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
  ? Math.floor(rawThreshold)
  : (() => { console.log(`警告: --threshold 值无效，使用默认值 300`); return 300 })()

if (!existsSync(designDir) || !lstatSync(designDir).isDirectory()) {
  console.error(`错误: 目录不存在或不是目录: ${designDir}`)
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
 * 递归收集目录下所有 .md 文件，返回相对于 baseDir 的相对路径（使用 / 分隔符）
 */
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

// 收集所有 .md 文件（递归子目录）
const allMdFiles = collectMdFiles(designDir, designDir)

// 找出所有 sub_split: true 的维度文件
const splitDimensions = []
const allFiles = {}

for (const file of allMdFiles) {
  const filePath = join(designDir, file)
  const content = readFileSync(filePath, 'utf-8')
  const { frontmatter, body } = parseFrontmatter(content)
  allFiles[file] = { content, frontmatter, body, lines: countLines(content) }

  if (frontmatter?.sub_split === 'true' && frontmatter?.parent === 'design.md') {
    splitDimensions.push(file)
  }
}

console.log('=== ae:design 二级子文件合并 ===')
console.log(`目录: ${designDir}`)
console.log(`阈值: ${threshold} 行`)
console.log(`已二级拆分的维度文件: ${splitDimensions.length} 个`)

if (splitDimensions.length === 0) {
  console.log('无需合并的维度文件。')
  console.log('---JSON---')
  console.log(JSON.stringify({ merged: [], skipped: [], threshold, passed: true }, null, 2))
  process.exit(0)
}

const merged = []
const skipped = []

for (const dimFile of splitDimensions) {
  const dimPath = join(designDir, dimFile)
  const dimContent = readFileSync(dimPath, 'utf-8')
  const { frontmatter: dimFm, body: dimBody, fmText: dimFmText } = parseFrontmatter(dimContent)

  // 找出该维度的所有二级子文件（同目录下 parent 匹配 basename）
  const dimDir = dimFile.includes('/') ? dimFile.slice(0, dimFile.lastIndexOf('/')) : ''
  const dimBasename = basename(dimFile)
  const subFiles = []
  for (const file of allMdFiles) {
    if (file === dimFile) continue
    const fileInfo = allFiles[file]
    if (fileInfo.frontmatter?.parent === dimBasename) {
      const fileDir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
      if (fileDir === dimDir) {
        subFiles.push(file)
      }
    }
  }

  if (subFiles.length === 0) {
    console.log(`  ${dimFile}: 无二级子文件，跳过`)
    skipped.push({ file: dimFile, reason: 'no_sub_files' })
    continue
  }

  // 计算合并后内容
  // 父文件 frontmatter（sub_split 改为 false）+ 各子文件正文拼接
  const fmEntries = parseFrontmatterEntries(dimFmText)
  const subSplitIdx = fmEntries.findIndex(e => e.key === 'sub_split')
  if (subSplitIdx >= 0) {
    fmEntries[subSplitIdx].value = 'false'
  } else {
    fmEntries.push({ key: 'sub_split', value: 'false' })
  }
  const mergedFm = buildFrontmatter(fmEntries)

  // 拼接各子文件正文（按文件名排序保持顺序）
  const sortedSubFiles = subFiles.sort()
  const bodyParts = []
  // 提取维度标题（# 开头的第一行）
  const dimTitleMatch = dimBody.match(/^#\s+(.+)/)
  if (dimTitleMatch) {
    bodyParts.push(`# ${dimTitleMatch[1]}`)
    bodyParts.push('')
  }

  for (const sf of sortedSubFiles) {
    const sfPath = join(designDir, sf)
    const sfContent = readFileSync(sfPath, 'utf-8')
    const { body: sfBody } = parseFrontmatter(sfContent)
    bodyParts.push(sfBody.trim())
    bodyParts.push('')
  }

  const mergedContent = `${mergedFm}\n\n${bodyParts.join('\n')}\n`
  const mergedLines = countLines(mergedContent)

  console.log(`  ${dimFile}: ${subFiles.length} 个子文件，合并后 ${mergedLines} 行`)

  if (mergedLines <= threshold) {
    // 执行合并
    writeFileSync(dimPath, mergedContent, 'utf-8')

    // 删除二级子文件
    for (const sf of sortedSubFiles) {
      unlinkSync(join(designDir, sf))
      console.log(`    删除 ${sf}`)
    }

    merged.push({
      into: dimFile,
      absorbed: sortedSubFiles,
      linesAfter: mergedLines,
    })
    console.log(`    合并成功 (${mergedLines} 行 ≤ ${threshold})`)
  } else {
    skipped.push({
      file: dimFile,
      reason: `merged_would_exceed_threshold (${mergedLines} > ${threshold})`,
    })
    console.log(`    保持拆分 (${mergedLines} 行 > ${threshold})`)
  }
}

console.log('')
console.log(`合并: ${merged.length} 个维度`)
console.log(`跳过: ${skipped.length} 个维度`)

// 输出 JSON 结果
const jsonResult = {
  threshold,
  designDir,
  merged,
  skipped,
  passed: true,
}

console.log('---JSON---')
console.log(JSON.stringify(jsonResult, null, 2))

process.exit(0)
