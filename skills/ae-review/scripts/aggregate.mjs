#!/usr/bin/env node
/**
 * 角色结果聚合器（零依赖）
 *
 * 把多个角色（审查者 / 开发者 / 测试执行者）的执行结果，按策略确定性聚合为
 * 统一结果对象。
 *
 * 用法：
 *   node scripts/aggregate.mjs --strategy union --input results.json
 *   cat results.json | node scripts/aggregate.mjs --strategy union
 *   node scripts/aggregate.mjs --strategy union --json '[{...}]'   # 直接给数组
 *
 * 输入（JSON）：
 * {
 *   "results": [
 *     { "status": "success|partial|failed",
 *       "output": "文本输出",
 *       "evidence": ["证据1"],
 *       "agentName": "可选，角色名",
 *       "findings": [ { "severity": "P1", "title": "标题", "evidence": "可选" } ] }
 *   ],
 *   "dispatchedAgents": ["角色A"],
 *   "skippedAgents": ["角色B"],
 *   "skipReasons": { "角色B": "原因" }
 * }
 *
 * 策略：
 *   union   合并所有发现，同标题保留最高严重级别（审查域）
 *   merge   合并输出与证据（开发域）
 *   best-of 取第一个成功结果
 *   reduce  统计汇总
 *
 * 输出：JSON 到 stdout。
 */

import { readFileSync } from 'node:fs'

const SEVERITY_ORDER = {
  P0: 4, P1: 3, P2: 2, P3: 1,
  critical: 4, high: 3, medium: 2, low: 1,
}

const STRATEGIES = new Set(['union', 'merge', 'best-of', 'reduce'])

/* ------------------------------------------------------------------ *
 * 发现提取与去重
 * ------------------------------------------------------------------ */

/**
 * 从输出文本中正则兜底提取结构化发现。
 * 支持形如：
 *   - 严重级别：P1 / 标题：xxx
 *   - **严重级别**: P1
 */
function extractFindingsFromText(text) {
  const findings = []
  if (typeof text !== 'string' || text.length === 0) {
    return findings
  }
  const blocks = text.split(/\n(?=\s*[-*]?\s*(?:严重级别|severity)\s*[：:])/i)
  for (const block of blocks) {
    const severityMatch = block.match(/严重级别[：:]\s*([A-Za-z0-9_]+)/i)
    const titleMatch = block.match(/标题[：:]\s*(.+)/)
    if (severityMatch && titleMatch) {
      findings.push({ severity: severityMatch[1], title: titleMatch[1].trim() })
    }
  }
  return findings
}

function deduplicateFindings(findings) {
  const best = new Map()
  for (const finding of findings) {
    const key = String(finding.title ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
    const existing = best.get(key)
    const currentRank = SEVERITY_ORDER[finding.severity] ?? 0
    const existingRank = existing ? (SEVERITY_ORDER[existing.severity] ?? 0) : -1
    if (!existing || currentRank > existingRank) {
      best.set(key, finding)
    }
  }
  return [...best.values()]
}

function collectFindings(results, structuredFindings) {
  const usable = structuredFindings && structuredFindings.length === results.length
    ? structuredFindings
    : undefined
  const all = []
  for (let i = 0; i < results.length; i += 1) {
    const preParsed = usable?.[i]
    if (preParsed && preParsed.length > 0) {
      all.push(...preParsed)
    } else {
      all.push(...extractFindingsFromText(results[i].output))
    }
  }
  return deduplicateFindings(all)
}

/* ------------------------------------------------------------------ *
 * 聚合策略
 * ------------------------------------------------------------------ */

function aggregateUnion(results, structuredFindings) {
  const findings = collectFindings(results, structuredFindings)
  const evidence = []
  for (const result of results) {
    for (const item of result.evidence ?? []) {
      if (!evidence.includes(item)) {
        evidence.push(item)
      }
    }
  }
  const hasFailed = results.some((r) => r.status === 'failed')
  const hasPartial = results.some((r) => r.status === 'partial')
  return {
    status: hasFailed ? 'failed' : hasPartial ? 'partial' : 'success',
    summary: `合并 ${results.length} 个角色结果，发现 ${findings.length} 条问题`,
    evidence,
    artifacts: [],
    findings: findings.length > 0 ? findings : undefined,
  }
}

function aggregateMerge(results, structuredFindings) {
  const evidence = []
  const summaries = []
  let hasPartial = false
  let hasFailed = false
  for (const result of results) {
    if (result.status === 'partial') hasPartial = true
    if (result.status === 'failed') hasFailed = true
    summaries.push(String(result.output ?? '').substring(0, 200))
    for (const item of result.evidence ?? []) {
      evidence.push(item)
    }
  }
  const findings = collectFindings(results, structuredFindings)
  return {
    status: hasFailed ? 'failed' : hasPartial ? 'partial' : 'success',
    summary: summaries.join('\n\n'),
    evidence: [...new Set(evidence)],
    artifacts: [],
    findings: findings.length > 0 ? findings : undefined,
  }
}

function aggregateBestOf(results, structuredFindings) {
  const successResults = results.filter((r) => r.status === 'success')
  const best = successResults[0] ?? results[0]
  if (!best) {
    return { status: 'failed', summary: '无可用结果', evidence: [], artifacts: [] }
  }
  const bestIndex = results.indexOf(best)
  const usable = structuredFindings && structuredFindings.length === results.length
    ? structuredFindings
    : undefined
  const preParsed = usable?.[bestIndex]
  const findings = preParsed && preParsed.length > 0
    ? preParsed
    : extractFindingsFromText(best.output)
  return {
    status: best.status,
    summary: best.output,
    evidence: best.evidence ?? [],
    artifacts: [],
    findings: findings.length > 0 ? deduplicateFindings(findings) : undefined,
  }
}

function aggregateReduce(results, structuredFindings) {
  const successCount = results.filter((r) => r.status === 'success').length
  const partialCount = results.filter((r) => r.status === 'partial').length
  const failedCount = results.filter((r) => r.status === 'failed').length
  const findings = collectFindings(results, structuredFindings)
  return {
    status: failedCount > 0 ? 'failed' : partialCount > 0 ? 'partial' : 'success',
    summary: `总计 ${results.length} 个角色: ${successCount} 成功, ${partialCount} 部分, ${failedCount} 失败`,
    evidence: results.flatMap((r) => r.evidence ?? []),
    artifacts: [],
    findings: findings.length > 0 ? findings : undefined,
  }
}

export function aggregateResults(strategy, results, structuredFindings) {
  switch (strategy) {
    case 'merge':
      return aggregateMerge(results, structuredFindings)
    case 'best-of':
      return aggregateBestOf(results, structuredFindings)
    case 'reduce':
      return aggregateReduce(results, structuredFindings)
    case 'union':
    default:
      return aggregateUnion(results, structuredFindings)
  }
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const options = { strategy: 'union', input: null, json: null }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--strategy') {
      options.strategy = argv[i + 1]
      i += 1
    } else if (item === '--input') {
      options.input = argv[i + 1]
      i += 1
    } else if (item === '--json') {
      options.json = argv[i + 1]
      i += 1
    } else if (item === '--help' || item === '-h') {
      options.help = true
    }
  }
  return options
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.help) {
    process.stdout.write([
      '用法: node aggregate.mjs --strategy <union|merge|best-of|reduce> [--input <file> | --json <数组>]',
      '未指定 --input/--json 时从 stdin 读取 JSON。',
      '',
    ].join('\n'))
    return 0
  }

  if (!STRATEGIES.has(options.strategy)) {
    process.stderr.write(`无效策略: ${options.strategy}（可用: ${[...STRATEGIES].join(', ')}）\n`)
    return 2
  }

  let raw
  if (options.json) {
    raw = options.json
  } else if (options.input) {
    try {
      raw = readFileSync(options.input, 'utf8')
    } catch (error) {
      process.stderr.write(`读取输入文件失败: ${error.message}\n`)
      return 1
    }
  } else {
    raw = readStdin()
  }

  if (!raw || raw.trim() === '') {
    process.stderr.write('未提供输入。请用 --input <file>、--json <数组> 或通过 stdin 传入 JSON。\n')
    return 1
  }

  let payload
  try {
    payload = JSON.parse(raw)
  } catch (error) {
    process.stderr.write(`输入不是合法 JSON: ${error.message}\n`)
    return 1
  }

  const results = Array.isArray(payload) ? payload : payload.results
  if (!Array.isArray(results) || results.length === 0) {
    process.stderr.write('输入必须包含非空的 results 数组\n')
    return 1
  }

  const structuredFindings = results.map((r) => (Array.isArray(r.findings) && r.findings.length > 0 ? r.findings : []))
  const normalized = results.map((r) => ({
    status: r.status ?? 'success',
    output: r.output ?? '',
    evidence: Array.isArray(r.evidence) ? r.evidence : [],
  }))

  const aggregated = aggregateResults(options.strategy, normalized, structuredFindings)
  const meta = Array.isArray(payload) ? {} : payload

  const output = {
    ...aggregated,
    dispatchManifest: {
      dispatched: Array.isArray(meta.dispatchedAgents) ? meta.dispatchedAgents : [],
      skipped: Array.isArray(meta.skippedAgents) ? meta.skippedAgents : [],
      skipReasons: meta.skipReasons && typeof meta.skipReasons === 'object' ? meta.skipReasons : {},
    },
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
  return 0
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('aggregate.mjs')
  : false

if (invokedDirectly) {
  process.exitCode = main()
}
