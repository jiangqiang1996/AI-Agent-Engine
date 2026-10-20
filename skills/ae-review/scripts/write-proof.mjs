#!/usr/bin/env node
/**
 * 审查证明写入器（零依赖）
 *
 * 把一次审查的真实输出固化为可核验的证明文件：
 *   ae/review/<review-run-id>/metadata.json
 *
 * 证明内容包含审查输出的 SHA-256、与当前 Git 工作区的指纹比对结果、
 * 阻断级发现检查结果。
 *
 * 用法：
 *   node scripts/write-proof.mjs --run-id <id> --status passed|failed \
 *        --output-file <审查输出文件> [--summary <摘要>] [--source-ref <引用>] \
 *        [--branch <分支>] [--head <commit>] [--worktree <路径>]
 *
 * 也可从 stdin 读取审查输出：
 *   node scripts/write-proof.mjs --run-id <id> --status passed < review-output.md
 *
 * 输出：JSON 到 stdout，包含 metadata.json 路径与各项校验结果。
 *
 * 说明：与宿主会话历史的一致性校验在本脚本中不可用（该能力依赖宿主 API），
 * 因此证明的"来源可信"由调用方（编排层）负责断言，本脚本只保证：
 *   1. 输出哈希可复算
 *   2. 分支/commit 与当前工作区一致
 *   3. 存在阻断级发现时不允许标记为 passed
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const HASH_ALGORITHM = 'sha256'
const BLOCKING_SEVERITIES = ['p0', 'p1', 'p2', 'critical', 'high', 'medium']

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

function extractLabeledTextField(text, labels) {
  const wanted = labels.map((label) => String(label).toLowerCase())
  for (const rawLine of String(text).split('\n')) {
    let line = rawLine.trim()
    if (!line) {
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      line = line.slice(2).trim()
    }
    while (line.startsWith('**')) {
      line = line.slice(2)
    }
    while (line.endsWith('**')) {
      line = line.slice(0, -2)
    }

    let key = null
    let value = null
    for (const separator of ['：', ':']) {
      const index = line.indexOf(separator)
      if (index > 0) {
        key = line.slice(0, index).trim()
        value = line.slice(index + 1).trim()
        break
      }
    }
    if (key === null) {
      continue
    }
    if (wanted.includes(key.toLowerCase())) {
      return value
    }
  }
  return undefined
}

function normalizePathForEvidence(filePath) {
  return String(filePath).replace(/\\/g, '/')
}

function collectFindingsFromText(output) {
  const findings = []
  const blocks = output.split(/\n(?=\s*[-*]?\s*(?:严重级别|severity)\s*[：:])/i)
  for (const block of blocks) {
    const severityMatch = block.match(/严重级别[：:]\s*([A-Za-z0-9_]+)/i)
    const titleMatch = block.match(/标题[：:]\s*(.+)/)
    if (severityMatch && titleMatch) {
      findings.push({ severity: severityMatch[1], title: titleMatch[1].trim() })
    }
  }
  return findings
}

function hasBlockingFindingInText(output) {
  for (const finding of collectFindingsFromText(output)) {
    if (BLOCKING_SEVERITIES.includes(String(finding.severity).toLowerCase())) {
      return true
    }
  }
  return false
}

function parseReviewOutput(output) {
  let parsed
  try {
    const jsonMatch = output.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0])
    }
  } catch {
    parsed = undefined
  }

  const source = parsed && typeof parsed === 'object' ? parsed : output
  const rawStatus = typeof source === 'object'
    ? source.reviewStatus ?? source.review_status ?? source.status
    : extractLabeledTextField(output, ['reviewStatus', 'review_status', 'Review Status', 'status', 'Status'])
  const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : undefined

  if (!['passed', 'pass', 'failed', 'fail'].includes(normalizedStatus ?? '')) {
    return undefined
  }

  const worktree = typeof source === 'object'
    ? source.worktree
    : extractLabeledTextField(output, ['worktree', 'Worktree'])
  const branch = typeof source === 'object'
    ? source.branch
    : extractLabeledTextField(output, ['branch', 'Branch'])
  const head = typeof source === 'object'
    ? source.head
    : extractLabeledTextField(output, ['head', 'HEAD'])

  return {
    status: normalizedStatus === 'passed' || normalizedStatus === 'pass' ? 'passed' : 'failed',
    worktree: worktree ? normalizePathForEvidence(worktree) : undefined,
    branch,
    head,
    hasBlockingFinding: hasBlockingFindingInText(output),
    findings: collectFindingsFromText(output),
  }
}

/* ------------------------------------------------------------------ *
 * Git 指纹
 * ------------------------------------------------------------------ */

function gitFingerprint(cwd) {
  const read = (args) => {
    try {
      return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return undefined
    }
  }
  const root = read(['rev-parse', '--show-toplevel'])
  if (!root) {
    return null
  }
  return {
    root: normalizePathForEvidence(root),
    branch: read(['rev-parse', '--abbrev-ref', 'HEAD']),
    head: read(['rev-parse', 'HEAD']),
  }
}

/* ------------------------------------------------------------------ *
 * 主体
 * ------------------------------------------------------------------ */

export function writeReviewProof(options) {
  const cwd = options.cwd ?? process.cwd()
  const runId = String(options.runId ?? '').trim()
  if (!runId) {
    throw new Error('缺少 --run-id')
  }
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(`review-run-id 含非法字符: ${runId}`)
  }

  const output = options.output ?? ''
  if (!output.trim()) {
    throw new Error('审查输出为空，无法生成证明')
  }

  const requestedStatus = options.status === 'passed' ? 'passed' : 'failed'
  const parsed = parseReviewOutput(output)
  const fingerprint = gitFingerprint(cwd)

  const findings = parsed?.findings ?? []
  const hasBlockingFinding = parsed?.hasBlockingFinding ?? hasBlockingFindingInText(output)

  const checks = []
  const mismatch = []

  if (parsed?.branch && fingerprint?.branch && parsed.branch !== fingerprint.branch) {
    mismatch.push(`branch 不一致（审查时 ${parsed.branch}，当前 ${fingerprint.branch}）`)
  }
  if (parsed?.head && fingerprint?.head && parsed.head !== fingerprint.head) {
    mismatch.push(`head 不一致（审查时 ${parsed.head}，当前 ${fingerprint.head}）`)
  }
  if (parsed?.worktree && fingerprint?.root) {
    const normalizedParsed = normalizePathForEvidence(parsed.worktree).replace(/\/$/, '')
    const normalizedRoot = fingerprint.root.replace(/\/$/, '')
    if (normalizedParsed !== normalizedRoot) {
      mismatch.push(`worktree 不一致（审查时 ${parsed.worktree}，当前 ${fingerprint.root}）`)
    }
  }

  checks.push({
    name: 'worktree-fingerprint',
    passed: mismatch.length === 0,
    detail: mismatch.length === 0 ? '分支/commit/工作区与当前一致' : mismatch.join('；'),
  })

  checks.push({
    name: 'blocking-findings',
    passed: !hasBlockingFinding,
    detail: hasBlockingFinding
      ? '存在阻断级发现（P0/P1/P2/critical/high/medium），不允许标记为 passed'
      : '未检出阻断级发现',
  })

  if (requestedStatus === 'passed' && hasBlockingFinding) {
    checks[checks.length - 1].passed = false
  }

  const finalStatus = requestedStatus === 'passed' && !hasBlockingFinding && mismatch.length === 0
    ? 'passed'
    : 'failed'

  const metadata = {
    generatedBy: 'ae-review/scripts/write-proof.mjs',
    reviewRunId: runId,
    sourceReviewRef: options.sourceRef ?? null,
    generatedAt: new Date().toISOString(),
    worktree: fingerprint?.root ?? options.worktree ?? null,
    branch: fingerprint?.branch ?? options.branch ?? null,
    head: fingerprint?.head ?? options.head ?? null,
    reviewStatus: finalStatus,
    requestedStatus,
    statusSummary: options.summary ?? null,
    reviewOutputHash: createHash(HASH_ALGORITHM).update(output, 'utf8').digest('hex'),
    reviewOutputLength: output.length,
    findings,
    checks,
  }

  const targetDir = join(resolve(cwd), 'ae', 'review', runId)
  mkdirSync(targetDir, { recursive: true })
  const metadataPath = join(targetDir, 'metadata.json')
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')

  return { metadataPath, metadata }
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  const argv = process.argv.slice(2)
  const options = {}

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => {
      const value = argv[i + 1]
      i += 1
      return value
    }
    if (item === '--run-id') options.runId = next()
    else if (item === '--status') options.status = next()
    else if (item === '--summary') options.summary = next()
    else if (item === '--source-ref') options.sourceRef = next()
    else if (item === '--branch') options.branch = next()
    else if (item === '--head') options.head = next()
    else if (item === '--worktree') options.worktree = next()
    else if (item === '--output-file') options.outputFile = next()
    else if (item === '--help' || item === '-h') {
      process.stdout.write([
        '用法: node write-proof.mjs --run-id <id> --status passed|failed --output-file <文件>',
        '   或: node write-proof.mjs --run-id <id> --status passed < 审查输出文件',
        '',
      ].join('\n'))
      return 0
    }
  }

  let output = ''
  if (options.outputFile) {
    if (!existsSync(options.outputFile)) {
      process.stderr.write(`审查输出文件不存在: ${options.outputFile}\n`)
      return 1
    }
    output = readFileSync(options.outputFile, 'utf8')
  } else {
    output = readStdin()
  }

  try {
    const result = writeReviewProof({ ...options, output })
    process.stdout.write(`${JSON.stringify({
      metadataPath: result.metadataPath,
      reviewStatus: result.metadata.reviewStatus,
      requestedStatus: result.metadata.requestedStatus,
      checks: result.metadata.checks,
    }, null, 2)}\n`)
    return result.metadata.reviewStatus === 'passed' ? 0 : 1
  } catch (error) {
    process.stderr.write(`生成审查证明失败: ${error?.message ?? error}\n`)
    return 1
  }
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('write-proof.mjs')
  : false

if (invokedDirectly) {
  process.exitCode = main()
}
