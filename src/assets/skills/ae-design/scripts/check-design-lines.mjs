#!/usr/bin/env node
// ae:design 产物行数校验脚本
// 用法: node <ae-design技能目录>/scripts/check-design-lines.mjs <design目录路径> [--threshold 300]
// 退出码: 0 = 通过, 1 = 有超标文件

import { readdirSync, readFileSync, lstatSync, existsSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node <ae-design技能目录>/scripts/check-design-lines.mjs <design目录路径> [--threshold N]')
  console.log('')
  console.log('参数:')
  console.log('  <design目录路径>  ae:design 产物目录，支持绝对路径和相对路径')
  console.log('  --threshold N     行数阈值，默认 300')
  console.log('')
  console.log('退出码:')
  console.log('  0 = 所有一级拆分文件通过校验')
  console.log('  1 = 存在超标的一级拆分文件')
  console.log('')
  console.log('校验规则:')
  console.log('  - 跳过 design.md（豁免，导航索引文件）')
  console.log('  - 跳过二级子文件（frontmatter 中 parent 指向非 design.md 的文件）')
  console.log('  - 检查一级拆分文件（frontmatter 中 parent 为 design.md 的文件）行数 ≤ threshold')
  console.log('  - 跳过无 frontmatter 或无 parent 字段的文件')
  process.exit(0)
}

const dirArg = args[0]
const designDir = resolve(dirArg)

const thresholdIdx = args.indexOf('--threshold')
const rawThreshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 300
// 校验 threshold 为有效正整数，NaN 或非法值回退默认值并警告
const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
  ? Math.floor(rawThreshold)
  : (() => { console.log(`警告: --threshold 值无效，使用默认值 300`); return 300 })()

if (!existsSync(designDir) || !lstatSync(designDir).isDirectory()) {
  console.error(`错误: 目录不存在或不是目录: ${designDir}`)
  process.exit(2)
}

/**
 * 解析 markdown 文件的 YAML frontmatter
 * 返回 frontmatter 键值对象；无 frontmatter 时返回 null
 */
function parseFrontmatter(content) {
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!fmMatch) return null
  const frontmatter = {}
  for (const line of fmMatch[1].split(/\r?\n/)) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      const value = kvMatch[2].trim().replace(/^["']|["']$/g, '')
      frontmatter[kvMatch[1]] = value
    }
  }
  return frontmatter
}

/**
 * 判断文件是否为二级子文件
 * 二级子文件的 frontmatter 中 parent 指向非 design.md 的文件（如 api.md）
 */
function isSectionLevelFile(frontmatter) {
  if (!frontmatter || !frontmatter.parent) return false
  return frontmatter.parent !== 'design.md'
}

/**
 * 判断文件是否为一级拆分文件
 * 一级拆分文件的 frontmatter 中 parent 为 design.md
 */
function isDimensionLevelFile(frontmatter) {
  if (!frontmatter) return false
  return frontmatter.parent === 'design.md'
}

function countLines(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  return normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0)
}

/**
 * 递归收集目录下所有 .md 文件，返回相对于 designDir 的相对路径
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

const skippedDesign = []
const skippedSection = []
const skippedNoFrontmatter = []
const checkedFiles = []
const violations = []

for (const file of allMdFiles) {
  if (file === 'design.md') {
    skippedDesign.push(file)
    continue
  }

  const filePath = join(designDir, file)
  const content = readFileSync(filePath, 'utf-8')
  const frontmatter = parseFrontmatter(content)

  if (isSectionLevelFile(frontmatter)) {
    skippedSection.push(file)
    continue
  }

  if (!isDimensionLevelFile(frontmatter)) {
    // 无 frontmatter 或 parent 非 design.md 的非二级文件，跳过
    skippedNoFrontmatter.push(file)
    continue
  }

  const lines = countLines(content)
  checkedFiles.push({ file, lines })

  if (lines > threshold) {
    violations.push({ file, lines })
  }
}

// 输出文本摘要
console.log('=== ae:design 产物行数校验 ===')
console.log(`检查目录: ${designDir}`)
console.log(`行数阈值: ${threshold} 行`)
console.log(`豁免文件: ${skippedDesign.length} 个（design.md）`)
console.log(`跳过文件: ${skippedSection.length} 个（二级子文件，parent 指向非 design.md）`)
console.log(`跳过文件: ${skippedNoFrontmatter.length} 个（无 frontmatter 或无 parent 字段）`)
console.log(`检查文件: ${checkedFiles.length} 个`)
console.log('')

if (violations.length > 0) {
  console.log(`超标文件: ${violations.length} 个`)
  console.log('-'.repeat(60))
  for (const v of violations) {
    console.log(`  ${v.file}: ${v.lines} 行 (超出 ${v.lines - threshold} 行)`)
  }
  console.log('')
  console.log('需要重新拆分以上文件使其行数 <= ' + threshold + ' 行。')
} else {
  console.log('所有检查文件通过校验。')
}

// 输出 JSON 结构化结果
const jsonResult = {
  threshold,
  designDir,
  totalChecked: checkedFiles.length,
  totalSkipped: skippedDesign.length + skippedSection.length + skippedNoFrontmatter.length,
  skippedDesign,
  skippedSection,
  skippedNoFrontmatter,
  checkedFiles,
  violations,
  passed: violations.length === 0,
}

console.log('---JSON---')
console.log(JSON.stringify(jsonResult, null, 2))

process.exit(violations.length > 0 ? 1 : 0)
