#!/usr/bin/env node
// ae:design 校验与合并流水线脚本
// 用法: node <ae-design技能目录>/scripts/pipeline-design-shards.mjs <design目录路径> [--threshold 300]
// 退出码: 0 = 成功, 1 = 校验失败, 2 = 目录不存在

import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, lstatSync } from 'node:fs'

const args = process.argv.slice(2)

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log('用法: node <ae-design技能目录>/scripts/pipeline-design-shards.mjs <design目录路径> [--threshold N]')
  console.log('')
  console.log('参数:')
  console.log('  <design目录路径>  ae:design 产物目录，支持绝对路径和相对路径')
  console.log('  --threshold N      行数阈值，默认 300')
  console.log('')
  console.log('退出码:')
  console.log('  0 = 校验和合并成功')
  console.log('  1 = 校验失败')
  console.log('  2 = 目录不存在')
  console.log('')
  console.log('流水线步骤:')
  console.log('  1. 校验：所有一级维度文件行数 ≤ threshold')
  console.log('  2. 合并：二级子文件合并后 ≤ threshold → 合并回父文件')
  console.log('  3. 再次校验：合并后所有一级维度文件行数 ≤ threshold')
  process.exit(0)
}

const dirArg = args[0]
const designDir = resolve(dirArg)

if (!existsSync(designDir) || !lstatSync(designDir).isDirectory()) {
  console.error(`错误: 目录不存在或不是目录: ${designDir}`)
  process.exit(2)
}

const thresholdIdx = args.indexOf('--threshold')
const rawThreshold = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 300
const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
  ? Math.floor(rawThreshold)
  : 300

const scriptDir = dirname(fileURLToPath(import.meta.url))
const checkScript = join(scriptDir, 'check-design-lines.mjs')
const mergeScript = join(scriptDir, 'merge-design-shards.mjs')

console.log('=== ae:design 校验与合并流水线 ===')
console.log(`目录: ${designDir}`)
console.log(`阈值: ${threshold} 行`)
console.log('')

// 步骤 1：校验
console.log('--- 步骤 1: 校验一级维度文件行数 ---')
let checkPassed = false
let checkOutput = ''
try {
  checkOutput = execFileSync('node', [checkScript, designDir, '--threshold', String(threshold)], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  console.log(checkOutput)
  checkPassed = true
} catch (err) {
  checkOutput = err.stdout?.toString() || ''
  console.log(checkOutput)
  console.log(err.stderr?.toString() || '')
  // 校验失败不立即退出，继续合并步骤
}

console.log('')

// 步骤 2：合并
console.log('--- 步骤 2: 合并二级子文件 ---')
let mergeOutput = ''
let mergePassed = false
try {
  mergeOutput = execFileSync('node', [mergeScript, designDir, '--threshold', String(threshold)], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  console.log(mergeOutput)
  mergePassed = true
} catch (err) {
  mergeOutput = err.stdout?.toString() || ''
  console.log(mergeOutput)
  console.log(err.stderr?.toString() || '')
}

console.log('')

// 步骤 3：合并后再次校验
console.log('--- 步骤 3: 合并后校验 ---')
let finalCheckPassed = false
let finalCheckOutput = ''
try {
  finalCheckOutput = execFileSync('node', [checkScript, designDir, '--threshold', String(threshold)], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  console.log(finalCheckOutput)
  finalCheckPassed = true
} catch (err) {
  finalCheckOutput = err.stdout?.toString() || ''
  console.log(finalCheckOutput)
  console.log(err.stderr?.toString() || '')
}

console.log('')

// 汇总
const passed = finalCheckPassed
console.log('=== 流水线结果 ===')
console.log(`初始校验: ${checkPassed ? '通过' : '失败'}`)
console.log(`合并: ${mergePassed ? '成功' : '失败'}`)
console.log(`最终校验: ${finalCheckPassed ? '通过' : '失败'}`)
console.log(`总体: ${passed ? '通过' : '失败'}`)

// 输出 JSON 结果
const jsonResult = {
  threshold,
  designDir,
  initialCheckPassed: checkPassed,
  mergePassed,
  finalCheckPassed,
  passed,
}

console.log('---JSON---')
console.log(JSON.stringify(jsonResult, null, 2))

process.exit(passed ? 0 : 1)
