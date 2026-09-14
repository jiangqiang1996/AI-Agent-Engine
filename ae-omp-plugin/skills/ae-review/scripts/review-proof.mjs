#!/usr/bin/env node
/**
 * review-proof.mjs — 写入 ae-review 的结构化审查证明。
 *
 * 从 AE 的 ae-review-proof 工具移植为技能内嵌脚本：
 * - 保留校验：run-id 白名单、passed 禁含阻断级发现、git 工作区指纹采集、
 *   source_review_output 与当前指纹逐项一致性校验、sha256 哈希
 * - 防伪降级：不做会话历史校验（脚本无特权会话访问），靠 git 指纹一致性
 *   + SKILL.md 流程约束（source_review_output 必须来自本会话真实审查输出）
 *
 * 用法：
 *   node review-proof.mjs --run-id <id> --status passed|failed --summary "..." \
 *        --source-output-file <path> [--findings-file <json>] \
 *        [--target-coverage-file <json>] [--repo <abs>]
 *
 * 成功：stdout {ok:true, path, reviewOutputHash}，退出码 0
 * 失败：stdout {ok:false, reason}，退出码 1
 *
 * source_review_output 必须包含可解析的审查证据行（JSON 或标签文本）：
 *   review_status / worktree / branch / head / status_summary
 * 模板见 references/review-output-template.md。
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'
import { promisify } from 'node:util'
import process from 'node:process'

const execFileAsync = promisify(execFile)

const REVIEW_RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/
const BLOCKING_SEVERITY_PATTERN = /^(p0|p1|p2|critical|high|medium)$/i
const GIT_TIMEOUT_MS = 15_000
const HASH_ALGORITHM = 'sha256'

// ---------- 输出 ----------
function fail(reason) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason }, null, 2)}\n`)
  process.exit(1)
}

// ---------- git 指纹 ----------
function toPosixPath(p) {
  return p.replace(/\\/g, '/')
}

// 与 AE 原实现一致：win32 下路径统一小写后比对
function normalizePathForEvidence(p) {
  const normalized = toPosixPath(p)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

async function runGit(repoRoot, args) {
  const { stdout } = await execFileAsync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
    // win32 控制台编码兜底
    env: { ...process.env, LC_ALL: 'C.UTF-8' },
  })
  return stdout.trim()
}

function parseBranchFromStatus(statusOutput) {
  const branchLine = statusOutput.split('\n').find((line) => line.startsWith('## '))
  if (!branchLine) return undefined
  const branch = branchLine.slice(3).split('...')[0]?.trim()
  return branch && branch !== 'HEAD (no branch)' ? branch : undefined
}

const REVIEW_RUNTIME_PREFIXES = ['ae/evidence/', 'ae/reviews/', 'ae/handoffs/', 'ae/screenshots/']

function isReviewRuntimePath(filePath) {
  const normalized = toPosixPath(filePath)
  return REVIEW_RUNTIME_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

// 与 AE 原实现一致：去掉 ## 分支行、空行与审查运行时路径（ae/evidence|reviews|handoffs|screenshots）
function normalizeStatusSummaryForEvidence(statusSummary) {
  return statusSummary
    .split('\n')
    .filter((line) => !line.startsWith('## '))
    .filter((line) => line.trim())
    .filter((line) => {
      const porcelainPayload = line.length > 2 ? line.slice(3) : line.trim()
      return !isReviewRuntimePath(porcelainPayload.trim())
    })
    .map((line) => line.trim())
    .join('\n')
}

async function collectCurrentWorktreeFingerprint(repoRoot) {
  try {
    const worktreePath = normalizePathForEvidence(await runGit(repoRoot, ['rev-parse', '--show-toplevel']))
    const head = await runGit(repoRoot, ['rev-parse', 'HEAD'])
    const statusOutput = await runGit(repoRoot, ['status', '--porcelain', '--branch'])
    const branch = parseBranchFromStatus(statusOutput)
      ?? await runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
    return {
      worktreePath,
      branch,
      head,
      statusSummary: normalizeStatusSummaryForEvidence(statusOutput),
      available: true,
    }
  } catch (error) {
    return {
      worktreePath: normalizePathForEvidence(repoRoot),
      available: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ---------- source_review_output 解析 ----------
function normalizeReviewStatusSummary(summary) {
  const normalized = summary.trim().toLowerCase()
  if (normalized === 'clean' || normalized === 'no changes' || normalized === 'no output') {
    return ''
  }
  // 模板以单行 `; ` 连接 porcelain 条目；与指纹侧的多行文本归一为同一形态
  return normalizeStatusSummaryForEvidence(summary.split(';').join('\n'))
}

function extractLabeledTextField(output, labels) {
  const escapedLabels = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const labelPattern = escapedLabels.join('|')
  const match = output.match(new RegExp(
    `(?:^|\n)\\s*(?:[-*]\\s*)?(?:\\*\\*)?(?:${labelPattern})(?:\\*\\*)?\\s*[:：]\\s*(?:\\*\\*)?\\s*(.+)`,
    'i',
  ))
  return match?.[1]?.replace(/^\*\*\s*/, '').replace(/\s*\*\*$/, '').trim()
}

function hasBlockingFindingInText(output) {
  return /^\s*(?:#{1,6}\s*)?(?:(?:[-*]|\d+[.)])\s*)?(?:\*\*)?\[?(?:P[0-2]|critical|high|medium)\]?(?:\b|\s|[-—:：])/im.test(output)
}

function extractJsonObject(output) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  return output.slice(start, end + 1)
}

function hasBlockingFindingInUnknown(findings) {
  if (!Array.isArray(findings)) return false
  return findings.some((finding) => {
    if (!finding || typeof finding !== 'object') return false
    const severity = finding.severity
    return typeof severity === 'string' && BLOCKING_SEVERITY_PATTERN.test(severity)
  })
}

function parseReviewOutputEvidence(output) {
  const jsonText = extractJsonObject(output)
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText)
      const rawStatus = parsed.reviewStatus ?? parsed.review_status ?? parsed.status ?? parsed.conclusion
      const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : undefined
      if (['passed', 'pass', 'failed', 'fail'].includes(normalizedStatus)) {
        return {
          status: normalizedStatus === 'passed' || normalizedStatus === 'pass' ? 'passed' : 'failed',
          worktree: typeof parsed.worktree === 'string' ? normalizePathForEvidence(parsed.worktree) : undefined,
          branch: typeof parsed.branch === 'string' ? parsed.branch : undefined,
          head: typeof parsed.head === 'string' ? parsed.head : typeof parsed.HEAD === 'string' ? parsed.HEAD : undefined,
          statusSummary: typeof parsed.statusSummary === 'string'
            ? normalizeReviewStatusSummary(parsed.statusSummary)
            : undefined,
          hasBlockingFinding: hasBlockingFindingInUnknown(parsed.findings),
        }
      }
    } catch {
      // 文本形态继续
    }
  }

  const rawStatus = extractLabeledTextField(output, ['reviewStatus', 'review_status', 'Review Status', 'status', 'Status'])
  const normalizedStatus = rawStatus?.toLowerCase()
  if (!['passed', 'pass', 'failed', 'fail'].includes(normalizedStatus)) return undefined

  const worktree = extractLabeledTextField(output, ['worktree', 'Worktree'])
  const branch = extractLabeledTextField(output, ['branch', 'Branch'])
  const head = extractLabeledTextField(output, ['head', 'HEAD'])
  const statusSummary = extractLabeledTextField(output, ['statusSummary', 'status_summary', 'Status Summary'])

  return {
    status: normalizedStatus === 'passed' || normalizedStatus === 'pass' ? 'passed' : 'failed',
    worktree: worktree ? normalizePathForEvidence(worktree) : undefined,
    branch,
    head,
    statusSummary: statusSummary === undefined ? undefined : normalizeReviewStatusSummary(statusSummary),
    hasBlockingFinding: hasBlockingFindingInText(output),
  }
}

function hashReviewOutput(content) {
  return createHash(HASH_ALGORITHM).update(content, 'utf8').digest('hex')
}

// ---------- CLI ----------
function parseArgs(argv) {
  const out = {}
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    switch (arg) {
      case '--run-id': out.runId = next(); break
      case '--status': out.status = next(); break
      case '--summary': out.summary = next(); break
      case '--source-output-file': out.sourceOutputFile = next(); break
      case '--findings-file': out.findingsFile = next(); break
      case '--target-coverage-file': out.targetCoverageFile = next(); break
      case '--repo': out.repo = next(); break
      default: fail(`未知参数: ${arg}`)
    }
  }
  return out
}

function readJsonFile(p, what) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch (error) {
    fail(`${what} 读取或解析失败（${p}）：${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main() {
  const args = parseArgs(process.argv)

  // ① run-id 校验
  if (typeof args.runId !== 'string' || !REVIEW_RUN_ID_PATTERN.test(args.runId)
    || args.runId === '.' || args.runId === '..') {
    fail('审查运行 ID 只能包含字母、数字、点、下划线和短横线，且不能为 . 或 ..')
  }
  if (args.status !== 'passed' && args.status !== 'failed') {
    fail('--status 必须是 passed 或 failed')
  }
  if (typeof args.summary !== 'string' || args.summary.trim().length === 0) {
    fail('--summary 不能为空')
  }
  if (typeof args.sourceOutputFile !== 'string') {
    fail('--source-output-file 必填：当前会话真实审查输出的完整文本文件')
  }

  let sourceReviewOutput
  try {
    sourceReviewOutput = readFileSync(args.sourceOutputFile, 'utf8')
  } catch (error) {
    fail(`source 输出文件读取失败：${error instanceof Error ? error.message : String(error)}`)
  }
  if (sourceReviewOutput.trim().length === 0) fail('source 输出文件为空')

  // ② passed 禁含阻断级 findings
  const findings = args.findingsFile ? readJsonFile(args.findingsFile, 'findings 文件') : []
  if (args.status === 'passed' && hasBlockingFindingInUnknown(findings)) {
    fail('review_status 为 passed 时不能包含 P0/P1/P2/critical/high/medium 级别发现')
  }

  // ③ git 工作区指纹
  const repoRoot = args.repo ? resolvePath(args.repo) : process.cwd()
  const fingerprint = await collectCurrentWorktreeFingerprint(repoRoot)
  if (!fingerprint.available || !fingerprint.branch || !fingerprint.head) {
    fail(`当前工作区指纹不可用：${fingerprint.error ?? '未知错误'}`)
  }

  // ④ source_review_output 与当前指纹逐项一致
  const parsedOutput = parseReviewOutputEvidence(sourceReviewOutput)
  if (!parsedOutput
    || parsedOutput.status !== args.status
    || parsedOutput.worktree !== fingerprint.worktreePath
    || parsedOutput.branch !== fingerprint.branch
    || parsedOutput.head !== fingerprint.head
    || parsedOutput.statusSummary !== fingerprint.statusSummary
    || (args.status === 'passed' && parsedOutput.hasBlockingFinding)) {
    fail('source_review_output 必须包含与当前 worktree 指纹和 --status 匹配的真实结构化审查输出（review_status/worktree/branch/head/status_summary 逐项一致；见 references/review-output-template.md）')
  }

  // ⑤ sha256 + 写 metadata.json
  const reviewOutputHash = hashReviewOutput(sourceReviewOutput)
  const targetCoverage = args.targetCoverageFile
    ? readJsonFile(args.targetCoverageFile, 'targetCoverage 文件')
    : undefined

  const metadata = {
    generatedBy: 'ae-review',
    proofKind: 'ae-review-proof',
    reviewRunIdOrMessageRef: args.runId,
    sourceReviewRef: args.runId,
    worktree: fingerprint.worktreePath,
    branch: fingerprint.branch,
    head: fingerprint.head,
    statusSummary: fingerprint.statusSummary,
    reviewStatus: args.status,
    hasBlockingFinding: parsedOutput.hasBlockingFinding,
    ...(targetCoverage ? { targetCoverage } : {}),
    reviewOutputHash,
  }

  const relativePath = join('ae', 'reviews', args.runId, 'metadata.json')
  const absolutePath = join(fingerprint.worktreePath, relativePath)
  try {
    mkdirSync(join(fingerprint.worktreePath, 'ae', 'reviews', args.runId), { recursive: true })
    writeFileSync(absolutePath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
  } catch (error) {
    fail(`写入审查证明失败：${error instanceof Error ? error.message : String(error)}`)
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    path: toPosixPath(relativePath),
    reviewOutputHash,
    metadata,
  }, null, 2)}\n`)
}

main().catch((error) => {
  fail(`执行失败：${error instanceof Error ? error.message : String(error)}`)
})
