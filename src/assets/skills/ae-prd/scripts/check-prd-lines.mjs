#!/usr/bin/env node
// ae:prd 产物行数校验脚本
// 用法: node <ae-prd技能目录>/scripts/check-prd-lines.mjs <prd目录路径> [--threshold 300]
// 退出码: 0 = 通过, 1 = 有超标文件, 2 = 目录不存在

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node <ae-prd技能目录>/scripts/check-prd-lines.mjs <prd目录路径> [--threshold N]')
  console.log('')
  console.log('参数:')
  console.log('  <prd目录路径>  ae:prd 产物目录，支持绝对路径和相对路径')
  console.log('  --threshold N   行数阈值，默认 300')
  console.log('')
  console.log('退出码:')
  console.log('  0 = 所有检查文件通过校验')
  console.log('  1 = 存在超标的检查文件')
  console.log('  2 = 目录不存在')
  console.log('')
  console.log('校验规则:')
  console.log('  - 跳过 sharded: true 的主文件（豁免，分片索引文件）')
  console.log('  - 检查 sharded: false 的主文件（type: prd）行数 ≤ threshold')
  console.log('  - 检查分片子文件（type: prd-shard）行数 ≤ threshold')
  console.log('  - 跳过无 frontmatter 或 type 非 prd/prd-shard 的文件')
  process.exit(0)
}

const dirArg = args[0]
const prdDir = resolve(dirArg)

const thresholdIdx = args.indexOf('--threshold')
const rawThreshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 300
// 校验 threshold 为有效正整数，NaN 或非法值回退默认值并警告
const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
  ? Math.floor(rawThreshold)
  : (() => { console.log(`警告: --threshold 值无效，使用默认值 300`); return 300 })()

if (!existsSync(prdDir) || !statSync(prdDir).isDirectory()) {
  console.error(`错误: 目录不存在或不是目录: ${prdDir}`)
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
 * 判断是否为分片索引主文件（sharded: true，豁免校验）
 */
function isShardedIndexFile(frontmatter) {
  if (!frontmatter) return false
  return frontmatter.type === 'prd' && frontmatter.sharded === 'true'
}

/**
 * 判断是否为需校验的主文件（type: prd, sharded: false 或未设置）
 */
function isStandalonePrdFile(frontmatter) {
  if (!frontmatter) return false
  return frontmatter.type === 'prd' && frontmatter.sharded !== 'true'
}

/**
 * 判断是否为分片子文件（type: prd-shard）
 */
function isPrdShardFile(frontmatter) {
  if (!frontmatter) return false
  return frontmatter.type === 'prd-shard'
}

function countLines(content) {
  const normalized = content.replace(/\r\n/g, '\n')
  return normalized.split('\n').length - (normalized.endsWith('\n') ? 1 : 0)
}

// 收集所有 .md 文件
const allMdFiles = readdirSync(prdDir)
  .filter(f => f.endsWith('.md'))

const skippedShardedIndex = []
const skippedNoFrontmatter = []
const checkedFiles = []
const violations = []

for (const file of allMdFiles) {
  const filePath = join(prdDir, file)
  const content = readFileSync(filePath, 'utf-8')
  const frontmatter = parseFrontmatter(content)

  if (isShardedIndexFile(frontmatter)) {
    skippedShardedIndex.push(file)
    continue
  }

  if (!isStandalonePrdFile(frontmatter) && !isPrdShardFile(frontmatter)) {
    // 无 frontmatter 或 type 不匹配的文件，跳过
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
console.log('=== ae:prd 产物行数校验 ===')
console.log(`检查目录: ${prdDir}`)
console.log(`行数阈值: ${threshold} 行`)
console.log(`豁免文件: ${skippedShardedIndex.length} 个（sharded: true 的分片索引主文件）`)
console.log(`跳过文件: ${skippedNoFrontmatter.length} 个（无 frontmatter 或 type 非 prd/prd-shard）`)
console.log(`检查文件: ${checkedFiles.length} 个`)
console.log('')

if (violations.length > 0) {
  console.log(`超标文件: ${violations.length} 个`)
  console.log('-'.repeat(60))
  for (const v of violations) {
    console.log(`  ${v.file}: ${v.lines} 行 (超出 ${v.lines - threshold} 行)`)
  }
  console.log('')
  console.log('需要拆分以上文件使其行数 <= ' + threshold + ' 行。')
  console.log('主文件超标时考虑按模块分片（sharded: true），分片子文件超标时考虑按需求分组进一步拆分。')
} else {
  console.log('所有检查文件通过校验。')
}

// 输出 JSON 结构化结果
const jsonResult = {
  threshold,
  prdDir,
  totalChecked: checkedFiles.length,
  totalSkipped: skippedShardedIndex.length + skippedNoFrontmatter.length,
  skippedShardedIndex,
  skippedNoFrontmatter,
  checkedFiles,
  violations,
  passed: violations.length === 0,
}

console.log('---JSON---')
console.log(JSON.stringify(jsonResult, null, 2))

process.exit(violations.length > 0 ? 1 : 0)
