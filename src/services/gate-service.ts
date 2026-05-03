import { existsSync, mkdirSync, readFileSync, realpathSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Effect } from 'effect'

import { isInsideRoot, toPosixPath, toRepoRelativePath } from '../utils/path-utils.js'

export type GateWorkflow = 'lfg' | 'work'
export type GateCheckpoint = 'start' | 'before_plan' | 'before_work' | 'before_review' | 'final'
export type GateReviewStatus = 'passed' | 'failed' | 'not_run' | 'not_applicable'
export type EvidenceTrust = 'verified' | 'declaration_only'
export type WorktreeDecision = 'created' | 'rejected' | 'cancelled' | 'transferred' | 'not_applicable'
export type GateEvidenceSource =
  | 'observable_workspace'
  | 'tool_output'
  | 'tool_input_declared'
  | 'user_confirmation'
  | 'not_provided'

export interface GitAuthorizationEvidence {
  authorizationSource: string
  authorizationSummary: string
  authorizationTrust: EvidenceTrust
  coveredCommandArgs: string[]
  sourceSessionId: string
  operationWorktree: string
  targetWorktree: string
  branch: string
  head: string
  authorizedAtOrMessageRef: string
  finalCommandArgs: string[]
}

export type ReviewEvidence =
  | {
      type: 'tool_output'
      reviewTrust: EvidenceTrust
      reviewRunIdOrMessageRef: string
      worktree: string
      branch: string
      head: string
      statusSummary: string
      summary: string
    }
  | {
      type: 'report_path'
      reviewTrust: EvidenceTrust
      path: string
      reviewRunIdOrMessageRef: string
      worktree: string
      branch: string
      head: string
      statusSummary: string
    }
  | { type: 'not_run_reason'; reason: string }
  | { type: 'declared'; summary: string; reviewTrust: 'declaration_only' }

export interface WorktreeFingerprint {
  worktreePath: string
  branch?: string
  head?: string
  statusSummary?: string
  available: boolean
  error?: string
}

export interface GateInput {
  workflow: GateWorkflow
  checkpoint: GateCheckpoint
  requirementsPath?: string
  planPath?: string
  validationCommands?: string[]
  reviewStatus?: GateReviewStatus
  browserTestStatus?: GateReviewStatus
  gitOperations?: string[]
  gitOperationArgs?: string[][]
  gitAuthorizationEvidence?: GitAuthorizationEvidence[]
  reviewEvidence?: ReviewEvidence
  worktreeDecision?: WorktreeDecision
  currentSessionId?: string
  trustedAuthorizationRefs?: string[]
  trustedReviewRefs?: string[]
  trustedReviewOutputs?: Record<string, string>
  userAuthorizedGitWrite?: boolean
  noCodeChangeReason?: string
  notes?: string
  writeProof?: boolean
}

export interface GateResult {
  status: 'pass' | 'block'
  workflow: GateWorkflow
  checkpoint: GateCheckpoint
  blockers: string[]
  warnings: string[]
  missingEvidence: string[]
  nextSteps: string[]
  evidenceSources: {
    requirements: GateEvidenceSource
    plan: GateEvidenceSource
    workExecution: GateEvidenceSource
    validation: GateEvidenceSource
    review: GateEvidenceSource
    browserTest: GateEvidenceSource
    gitOperations: GateEvidenceSource
    gitAuthorization: GateEvidenceSource
  }
  evidence: {
    requirementsPath?: string
    requirementsExists?: boolean
    planPath?: string
    planExists?: boolean
    changedFiles: string[]
    validationCommands: string[]
    reviewStatus: GateReviewStatus
    browserTestStatus: GateReviewStatus
    gitOperations: string[]
    gitOperationArgs: string[][]
    gitAuthorizationEvidence: GitAuthorizationEvidence[]
    reviewEvidence?: ReviewEvidence
    worktreeDecision?: WorktreeDecision
    currentWorktreeFingerprint: WorktreeFingerprint
    userAuthorizedGitWrite: boolean
    noCodeChangeReason?: string
    latestArtifacts: {
      requirements?: string
      plan?: string
    }
  }
  summary: string
  proofPath?: string
}

interface GitOperation {
  args: string[]
  display: string
  write: boolean
  parseReliable: boolean
  subcommand?: string
  targetArgs: string[]
  hasGitDirectoryOverride: boolean
  worktreeAction?: string
  worktreeTargetPath?: string
}

interface WorktreeOperationParseResult {
  action?: string
  targetPath?: string
  reliable: boolean
}

const WRITE_SUBCOMMANDS = new Set([
  'add',
  'commit',
  'push',
  'reset',
  'checkout',
  'switch',
  'rebase',
  'merge',
  'restore',
  'clean',
  'stash',
  'cherry-pick',
  'revert',
  'pull',
  'tag',
  'branch',
  'config',
  'maintenance',
  'mv',
  'notes',
  'remote',
  'replace',
  'rm',
  'submodule',
  'update-ref',
])

const WORKTREE_WRITE_SUBCOMMANDS = new Set(['add', 'remove', 'move', 'prune', 'repair', 'lock', 'unlock'])
const WORKTREE_OPTIONS_WITH_VALUE = new Set(['-b', '-B', '--orphan', '--reason'])
const WORKTREE_BOOLEAN_OPTIONS = new Set([
  '--detach',
  '--lock',
  '--guess-remote',
  '--no-guess-remote',
  '--checkout',
  '--no-checkout',
])

function normalizePathForEvidence(path: string): string {
  const normalized = toPosixPath(resolve(path))
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isRuntimeEvidencePath(filePath: string): boolean {
  const normalized = toPosixPath(filePath)
  return normalized.startsWith('docs/ae/gates/')
    || normalized.startsWith('docs/ae/review/')
    || normalized.startsWith('docs/ae/reviews/')
}

const GIT_EXEC_TIMEOUT = 30_000

function runGit(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: GIT_EXEC_TIMEOUT,
  }).trim()
}

/**
 * 采集当前 worktree 指纹。
 * 门禁依赖该指纹防止跨分支、跨 worktree 或过期证据复用。
 */
export function collectCurrentWorktreeFingerprint(repoRoot: string): WorktreeFingerprint {
  try {
    const worktreePath = normalizePathForEvidence(realpathSync(repoRoot))
    const head = runGit(repoRoot, ['rev-parse', 'HEAD'])
    const statusOutput = runGit(repoRoot, ['status', '--porcelain', '--branch'])
    const branch = parseBranchFromStatus(statusOutput) ?? runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])
    const statusSummary = statusOutput
      .split('\n')
      .filter((line) => !line.startsWith('## '))
      .filter((line) => line.trim())
      .filter((line) => !isRuntimeEvidencePath(line.slice(3).trim()))
      .map((line) => line.trim())
      .join('\n')

    return { worktreePath, branch, head, statusSummary, available: true }
  } catch (error) {
    return {
      worktreePath: normalizePathForEvidence(repoRoot),
      available: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function listLatestMarkdown(repoRoot: string, dir: string): string | undefined {
  try {
    const absDir = join(repoRoot, dir)
    if (!existsSync(absDir)) {
      return undefined
    }

    const files = readdirSync(absDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => join(absDir, file))
      .filter((file) => statSync(file).isFile())
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)

    const latest = files[0]
    return latest ? toRepoRelativePath(repoRoot, latest) : undefined
  } catch {
    return undefined
  }
}

function resolveOptionalPath(repoRoot: string, filePath?: string): string | undefined {
  if (!filePath) {
    return undefined
  }

  return resolve(repoRoot, filePath)
}

interface PathEvidence {
  normalizedPath?: string
  exists?: boolean
  error?: string
}

function validateArtifactPath(repoRoot: string, filePath: string | undefined): PathEvidence {
  const resolved = resolveOptionalPath(repoRoot, filePath)
  if (!filePath || !resolved) {
    return {}
  }

  if (isAbsolute(filePath) || !isInsideRoot(repoRoot, resolved)) {
    return { error: '路径必须是仓库相对路径且位于当前工作区内。' }
  }

  const normalizedPath = toRepoRelativePath(repoRoot, resolved)
  return { normalizedPath, exists: existsSync(resolved) }
}

function collectChangedFiles(repoRoot: string): string[] {
  try {
    return parseChangedFiles(runGit(repoRoot, ['status', '--porcelain']))
  } catch {
    return []
  }
}

function parseBranchFromStatus(statusOutput: string): string | undefined {
  const branchLine = statusOutput.split('\n').find((line) => line.startsWith('## '))
  if (!branchLine) {
    return undefined
  }

  const branch = branchLine.slice(3).split('...')[0]?.trim()
  if (!branch || branch.startsWith('HEAD ')) {
    return undefined
  }

  return branch
}

function parseChangedFiles(statusSummary: string): string[] {
  return statusSummary
    .split('\n')
    .filter((line) => line.trim())
    .map(parseChangedFilePath)
    .filter(Boolean)
    .filter((file) => !isRuntimeEvidencePath(file))
    .map(toPosixPath)
}

function parseChangedFilePath(statusLine: string): string {
  if (statusLine.length >= 3 && statusLine[2] === ' ') {
    return statusLine.slice(3).trim()
  }

  if (statusLine.length >= 2 && statusLine[1] === ' ') {
    return statusLine.slice(2).trim()
  }

  return statusLine.trim()
}

function parseLegacyGitOperation(command: string): GitOperation | undefined {
  const trimmed = command.trim()
  if (!trimmed) {
    return undefined
  }

  const reliable = !/["']/.test(trimmed)
  return parseGitOperation(trimmed.split(/\s+/).filter(Boolean), trimmed, reliable, false)
}

function containsEmbeddedGitWrite(args: string[]): boolean {
  const writePattern = Array.from(WRITE_SUBCOMMANDS)
    .map((command) => command.replaceAll('-', '[ -]'))
    .join('|')
  const worktreePattern = Array.from(WORKTREE_WRITE_SUBCOMMANDS).join('|')
  const gitGlobalOption = String.raw`(?:\s+(?:-C|-c|--git-dir|--work-tree)\s+\S+|\s+(?:-c\S+|--git-dir=\S+|--work-tree=\S+|--no-pager))*`
  const pattern = new RegExp(`\\bgit\\b${gitGlobalOption}\\s+(?:${writePattern}|worktree\\s+(?:${worktreePattern}))\\b`, 'i')
  const text = args.join(' ')
  return args.some((arg) => pattern.test(arg) || /\bgit\b.*(?:alias\.|!git\s+)/i.test(arg))
    || pattern.test(text)
    || /\bgit\b.*(?:alias\.|!git\s+)/i.test(text)
}

function hasGitDirectoryOverride(args: string[]): boolean {
  return args.some((token) => {
    const lower = token.toLowerCase()
    return token === '-C'
      || lower === '--git-dir'
      || lower === '--work-tree'
      || lower.startsWith('--git-dir=')
      || lower.startsWith('--work-tree=')
  })
}

function skipGlobalGitOptions(args: string[], start: number): number {
  let index = start
  while (index < args.length) {
    const token = args[index]?.toLowerCase()
    if (!token) {
      break
    }

    const original = args[index]
    if (original === '-C' || token === '-c' || token === '--git-dir' || token === '--work-tree') {
      index += 2
      continue
    }

    if (token.startsWith('-c') && token.length > 2) {
      index += 1
      continue
    }

    if (token.startsWith('--git-dir=') || token.startsWith('--work-tree=')) {
      index += 1
      continue
    }

    if (token.startsWith('-')) {
      index += 1
      continue
    }

    break
  }

  return index
}

function parseWorktreeAddTarget(candidates: string[]): Pick<WorktreeOperationParseResult, 'targetPath' | 'reliable'> {
  let index = 0
  while (index < candidates.length) {
    const token = candidates[index]
    if (!token) {
      return { reliable: false }
    }

    const optionKey = token.startsWith('--') ? token.toLowerCase() : token
    if (WORKTREE_OPTIONS_WITH_VALUE.has(optionKey)) {
      if (!candidates[index + 1]) {
        return { reliable: false }
      }
      index += 2
      continue
    }

    if (WORKTREE_BOOLEAN_OPTIONS.has(optionKey)) {
      index += 1
      continue
    }

    if (token === '--') {
      const targetPath = candidates[index + 1]
      return targetPath && !targetPath.startsWith('-')
        ? { targetPath, reliable: isWorktreeAddTailReliable(candidates.slice(index + 2)) }
        : { reliable: false }
    }

    if (token.startsWith('-')) {
      return { reliable: false }
    }

    return { targetPath: token, reliable: isWorktreeAddTailReliable(candidates.slice(index + 1)) }
  }

  return { reliable: false }
}

function isWorktreeAddTailReliable(tail: string[]): boolean {
  if (tail.length === 0) {
    return true
  }

  return tail.length === 1 && !!tail[0] && !tail[0].startsWith('-') && tail[0] !== '--'
}

function parseWorktreeOperation(targetArgs: string[]): WorktreeOperationParseResult {
  let index = 0
  while (index < targetArgs.length) {
    const token = targetArgs[index]
    if (!token || token === '--') {
      return { reliable: false }
    }

    if (token.startsWith('-')) {
      return { reliable: false }
    }

    const action = token.toLowerCase()
    if (action !== 'add') {
      return { action, reliable: true }
    }

    const parsedTarget = parseWorktreeAddTarget(targetArgs.slice(index + 1))
    return { action, ...parsedTarget }
  }

  return { reliable: true }
}

function parseGitOperation(
  args: string[],
  display = args.join(' '),
  parseReliable = true,
  assumeGitCommand = true,
): GitOperation | undefined {
  if (args[0]?.toLowerCase() !== 'git' && containsEmbeddedGitWrite(args)) {
    return {
      args,
      display,
      write: true,
      parseReliable: false,
      targetArgs: [],
      hasGitDirectoryOverride: hasGitDirectoryOverride(args),
    }
  }

  const normalizedArgs = assumeGitCommand && args[0]?.toLowerCase() !== 'git' ? ['git', ...args] : args
  const gitIndex = normalizedArgs.findIndex((token) => token.toLowerCase() === 'git')
  if (gitIndex === -1) {
    return undefined
  }

  const subcommandIndex = skipGlobalGitOptions(normalizedArgs, gitIndex + 1)
  const subcommand = normalizedArgs[subcommandIndex]?.toLowerCase()
  if (!subcommand) {
    return undefined
  }

  const lowerArgs = normalizedArgs.map((arg) => arg.toLowerCase())
  const targetArgs = normalizedArgs.slice(subcommandIndex + 1)
  const hasAliasOverride = lowerArgs.some((arg) => arg.startsWith('alias.') || arg.startsWith('-calias.'))
  const directoryOverride = hasGitDirectoryOverride(normalizedArgs.slice(gitIndex + 1, subcommandIndex))
  let write = hasAliasOverride
    || WRITE_SUBCOMMANDS.has(subcommand)
    || lowerArgs.includes('--no-verify')
    || lowerArgs.includes('--amend')

  let worktreeAction: string | undefined
  let worktreeTargetPath: string | undefined
  if (subcommand === 'worktree') {
    const worktreeOperation = parseWorktreeOperation(targetArgs)
    worktreeAction = worktreeOperation.action
    write = worktreeAction ? WORKTREE_WRITE_SUBCOMMANDS.has(worktreeAction) : true
    parseReliable = parseReliable && worktreeOperation.reliable
    worktreeTargetPath = worktreeOperation.targetPath
  }

  return {
    args: normalizedArgs,
    display,
    write,
    parseReliable,
    subcommand,
    targetArgs,
    hasGitDirectoryOverride: directoryOverride,
    worktreeAction,
    worktreeTargetPath,
  }
}

function getGitOperations(input: GateInput, normalizedOperations: string[]): GitOperation[] {
  const structured = (input.gitOperationArgs ?? [])
    .map((args) => parseGitOperation(args.filter(Boolean)))
    .filter((operation): operation is GitOperation => Boolean(operation))
  const legacy = normalizedOperations
    .map(parseLegacyGitOperation)
    .filter((operation): operation is GitOperation => Boolean(operation))

  const operations = [...structured]
  for (const legacyOperation of legacy) {
    if (!operations.some((operation) => sameCommandArgs(operation.args, legacyOperation.args))) {
      operations.push(legacyOperation)
    }
  }

  return operations
}

function normalizeCommandArgs(args: string[]): string[] {
  return args.map((arg) => arg.trim()).filter(Boolean)
}

function sameCommandArgs(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeCommandArgs(left)
  const normalizedRight = normalizeCommandArgs(right)
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index])
}

function isMatchingWorktreePath(actual: string | undefined, expected: string): boolean {
  if (!actual) {
    return false
  }

  return normalizePathForEvidence(actual) === normalizePathForEvidence(expected)
}

function isAllowedWorktreeTarget(operationWorktree: string, targetWorktree: string): boolean {
  const allowedParent = normalizePathForEvidence(resolve(operationWorktree, '..', 'worktrees'))
  const normalizedTarget = normalizePathForEvidence(targetWorktree)
  const prefix = `${allowedParent}/`
  if (!normalizedTarget.startsWith(prefix)) {
    return false
  }

  const childName = normalizedTarget.slice(prefix.length)
  return Boolean(childName) && !childName.includes('/')
}

function isAuthorizationVerified(
  evidence: GitAuthorizationEvidence,
  currentFingerprint: WorktreeFingerprint,
  trustedAuthorizationRefs: string[],
): boolean {
  return Boolean(
    evidence.authorizationTrust === 'verified'
      && evidence.authorizationSource === 'user_confirmation'
      && evidence.authorizationSource
      && evidence.authorizationSummary
      && evidence.sourceSessionId
      && evidence.authorizedAtOrMessageRef
      && trustedAuthorizationRefs.includes(evidence.authorizedAtOrMessageRef)
      && evidence.operationWorktree
      && evidence.targetWorktree
      && evidence.branch
      && evidence.head
      && evidence.coveredCommandArgs.length > 0
      && evidence.finalCommandArgs.length > 0
      && currentFingerprint.available,
  )
}

function authorizationCoversOperation(
  operation: GitOperation,
  evidence: GitAuthorizationEvidence,
  currentFingerprint: WorktreeFingerprint,
  currentSessionId?: string,
  trustedAuthorizationRefs: string[] = [],
): boolean {
  if (!operation.parseReliable || !isAuthorizationVerified(evidence, currentFingerprint, trustedAuthorizationRefs)) {
    return false
  }

  if (!sameCommandArgs(operation.args, evidence.finalCommandArgs)) {
    return false
  }

  if (!sameCommandArgs(evidence.coveredCommandArgs, evidence.finalCommandArgs)) {
    return false
  }

  if (hasUnsafeGitDirectoryOverride(operation, currentFingerprint)) {
    return false
  }

  const evidenceOperation = parseGitOperation(evidence.finalCommandArgs)
  if (!evidenceOperation?.write || evidenceOperation.subcommand !== operation.subcommand) {
    return false
  }

  if (operation.subcommand === 'worktree') {
    if (operation.worktreeTargetPath) {
      const expectedTarget = normalizePathForEvidence(resolve(evidence.operationWorktree, operation.worktreeTargetPath))
      if (!isMatchingWorktreePath(expectedTarget, evidence.targetWorktree)) {
        return false
      }
    }

    if (operation.worktreeAction === 'add') {
      if (!operation.worktreeTargetPath) {
        return false
      }

      if (!isAllowedWorktreeTarget(evidence.operationWorktree, evidence.targetWorktree)) {
        return false
      }

      return isMatchingWorktreePath(currentFingerprint.worktreePath, evidence.targetWorktree)
        && !isMatchingWorktreePath(currentFingerprint.worktreePath, evidence.operationWorktree)
        && currentFingerprint.branch === evidence.branch
    }

    if (currentSessionId && evidence.sourceSessionId !== currentSessionId) {
      return false
    }

    return isMatchingWorktreePath(currentFingerprint.worktreePath, evidence.operationWorktree)
      && currentFingerprint.branch === evidence.branch
      && currentFingerprint.head === evidence.head
  }

  if (currentSessionId && evidence.sourceSessionId !== currentSessionId) {
    return false
  }

  return isMatchingWorktreePath(currentFingerprint.worktreePath, evidence.operationWorktree)
    && isMatchingWorktreePath(currentFingerprint.worktreePath, evidence.targetWorktree)
    && currentFingerprint.branch === evidence.branch
    && currentFingerprint.head === evidence.head
}

function hasUnsafeGitDirectoryOverride(operation: GitOperation, currentFingerprint: WorktreeFingerprint): boolean {
  const gitIndex = operation.args.findIndex((token) => token.toLowerCase() === 'git')
  if (gitIndex === -1) {
    return false
  }

  const subcommandIndex = skipGlobalGitOptions(operation.args, gitIndex + 1)
  for (let index = gitIndex + 1; index < subcommandIndex; index += 1) {
    const token = operation.args[index]
    const lower = token?.toLowerCase()
    if (!token || !lower) {
      continue
    }

    if (lower === '--git-dir' || lower === '--work-tree' || lower.startsWith('--git-dir=') || lower.startsWith('--work-tree=')) {
      return true
    }

    if (token === '-C') {
      const target = operation.args[index + 1]
      if (!target || !isMatchingWorktreePath(resolve(currentFingerprint.worktreePath, target), currentFingerprint.worktreePath)) {
        return true
      }
      index += 1
    }
  }

  return false
}

function containsGitWriteOperation(operations: GitOperation[]): boolean {
  return operations.some((operation) => operation.write)
}

function normalizeCommands(commands: string[] | undefined): string[] {
  return (commands ?? []).map((command) => command.trim()).filter(Boolean)
}

function getArtifactSource(normalizedPath?: string, exists?: boolean): GateEvidenceSource {
  if (!normalizedPath) {
    return 'not_provided'
  }

  return exists ? 'observable_workspace' : 'tool_input_declared'
}

function getWorkExecutionSource(changedFiles: string[], noCodeChangeReason?: string): GateEvidenceSource {
  if (changedFiles.length > 0) {
    return 'observable_workspace'
  }

  if (noCodeChangeReason) {
    return 'tool_input_declared'
  }

  return 'not_provided'
}

function getValidationSource(validationCommands: string[]): GateEvidenceSource {
  return validationCommands.length > 0 ? 'tool_input_declared' : 'not_provided'
}

function getReviewSource(reviewStatus: GateReviewStatus): GateEvidenceSource {
  return reviewStatus === 'not_run' ? 'not_provided' : 'tool_input_declared'
}

function getOptionalStatusSource(status: GateReviewStatus | undefined): GateEvidenceSource {
  return status === undefined ? 'not_provided' : 'tool_input_declared'
}

function getGitAuthorizationSource(
  userAuthorizedGitWrite: boolean,
  inputProvided: boolean,
  evidence: GitAuthorizationEvidence[],
  trustedAuthorizationRefs: string[],
): GateEvidenceSource {
  if (evidence.some((item) => item.authorizationTrust === 'verified' && trustedAuthorizationRefs.includes(item.authorizedAtOrMessageRef))) {
    return 'user_confirmation'
  }

  if (!inputProvided && evidence.length === 0) {
    return 'not_provided'
  }

  void userAuthorizedGitWrite
  return 'tool_input_declared'
}

function addReviewEvidenceBlockers(
  repoRoot: string,
  input: GateInput,
  blockers: string[],
  missingEvidence: string[],
  nextSteps: string[],
  result: GateResult,
): void {
  const reviewStatus = result.evidence.reviewStatus
  const reviewEvidence = result.evidence.reviewEvidence

  if (reviewStatus === 'not_run') {
    if (reviewEvidence?.type !== 'not_run_reason') {
      blockers.push('review_status 为 not_run 时必须提供未运行原因。')
      addMissingEvidence(missingEvidence, '审查未运行原因')
      addNextStep(nextSteps, '补充 review_evidence: { type: "not_run_reason", reason: "..." }，说明为何未运行审查。')
    }
    return
  }

  if (reviewStatus === 'not_applicable') {
    if (result.evidence.changedFiles.length > 0) {
      blockers.push('当前存在工作区变更，review_status 不能标记为 not_applicable。')
      addMissingEvidence(missingEvidence, '审查状态或未运行原因')
      addNextStep(nextSteps, '对当前变更运行审查；如确实无法审查，使用 review_status: not_run 并提供 not_run_reason。')
    }
    return
  }

  if (!reviewEvidence || reviewEvidence.type === 'declared' || reviewEvidence.type === 'not_run_reason') {
    blockers.push('review_status 为 passed/failed 时必须提供可验证的审查来源证据。')
    addMissingEvidence(missingEvidence, '可验证的审查来源证据')
    addNextStep(nextSteps, '补充 review_evidence，包含审查运行来源、当前 worktree、branch、HEAD 和状态摘要。')
    return
  }

  const fingerprint = result.evidence.currentWorktreeFingerprint
  if (!fingerprint.available) {
    blockers.push('当前工作区指纹不可用，不能证明审查状态属于当前 worktree。')
    addMissingEvidence(missingEvidence, '当前工作区指纹')
    return
  }

  if (reviewEvidence.type === 'tool_output') {
    if (reviewEvidence.reviewTrust !== 'verified') {
      blockers.push('审查来源证据必须是 verified，声明型审查不能作为最终门禁依据。')
      addMissingEvidence(missingEvidence, 'verified 审查来源证据')
      return
    }

    const output = input.trustedReviewOutputs?.[reviewEvidence.reviewRunIdOrMessageRef]
    if (!input.trustedReviewRefs?.includes(reviewEvidence.reviewRunIdOrMessageRef)
      || !output
      || !reviewOutputMatchesEvidence(output, reviewEvidence, reviewStatus)) {
      blockers.push('审查工具输出未绑定当前 review_evidence 指纹，不能作为可验证审查来源证据。')
      addMissingEvidence(missingEvidence, '匹配当前工作区指纹的真实审查工具输出')
      addNextStep(nextSteps, '使用本会话中的 ae:review 或审查子代理输出作为 review_evidence，并确保输出包含当前 worktree、branch、HEAD 和 statusSummary。')
      return
    }
  }

  if (reviewEvidence.type === 'report_path') {
    if (reviewEvidence.reviewTrust !== 'verified') {
      blockers.push('审查来源证据必须是 verified，声明型审查不能作为最终门禁依据。')
      addMissingEvidence(missingEvidence, 'verified 审查来源证据')
      return
    }

    const reportPath = validateArtifactPath(repoRoot, reviewEvidence.path)
    if (reportPath.error || !reportPath.exists) {
      blockers.push('审查报告路径无效或不存在，不能作为可验证审查来源证据。')
      addMissingEvidence(missingEvidence, '存在的审查报告路径')
      addNextStep(nextSteps, '补充 docs/ae/review/<run-id>/metadata.json 形式的审查元数据路径。')
      return
    }

    if (!isReviewMetadataPath(reviewEvidence.path)) {
      blockers.push('审查报告路径必须指向 docs/ae/review/<run-id>/metadata.json。')
      addMissingEvidence(missingEvidence, '结构化审查元数据路径')
      addNextStep(nextSteps, '使用 ae:review 生成结构化审查元数据，再将 metadata.json 作为 review_evidence.path。')
      return
    }

    const reportAbsPath = resolve(repoRoot, reviewEvidence.path)
    let content: string
    try {
      content = readFileSync(reportAbsPath, 'utf8')
    } catch {
      blockers.push('审查报告路径无效或不可读取，不能作为可验证审查来源证据。')
      addMissingEvidence(missingEvidence, '可读取的审查报告路径')
      addNextStep(nextSteps, '确认 review_evidence.path 指向当前工作区内可读取的审查报告。')
      return
    }
    if (!reviewReportMatchesEvidence(
      content,
      reviewEvidence,
      reviewStatus,
      input.trustedReviewRefs ?? [],
      input.trustedReviewOutputs ?? {},
    )) {
      blockers.push('审查报告内容未绑定当前 review_evidence 指纹，不能作为可验证审查来源证据。')
      addMissingEvidence(missingEvidence, '包含匹配指纹元数据的审查报告')
      addNextStep(nextSteps, '使用 ae:review 生成包含 run id、worktree、branch、HEAD 和 statusSummary 的审查报告。')
      return
    }
  }

  if (
    !reviewEvidence.reviewRunIdOrMessageRef
      || !isMatchingWorktreePath(fingerprint.worktreePath, reviewEvidence.worktree)
      || fingerprint.branch !== reviewEvidence.branch
      || fingerprint.head !== reviewEvidence.head
      || (fingerprint.statusSummary ?? '') !== reviewEvidence.statusSummary
  ) {
    blockers.push('审查来源证据与当前 worktree 指纹不匹配，不能复用为通过审查。')
    addMissingEvidence(missingEvidence, '匹配当前工作区指纹的审查证据')
  }

  if (input.reviewStatus === 'passed') {
    result.evidenceSources.review = 'observable_workspace'
  }
}

function reviewReportMatchesEvidence(
  content: string,
  evidence: Extract<ReviewEvidence, { type: 'report_path' }>,
  expectedStatus: GateReviewStatus,
  trustedReviewRefs: string[],
  trustedReviewOutputs: Record<string, string>,
): boolean {
  try {
    const metadata = JSON.parse(content) as Record<string, unknown>
    const output = trustedReviewOutputs[evidence.reviewRunIdOrMessageRef]
    const outputHash = output ? hashReviewOutput(output) : undefined
    return metadata.generatedBy === 'ae:review'
      && metadata.reviewRunIdOrMessageRef === evidence.reviewRunIdOrMessageRef
      && trustedReviewRefs.includes(evidence.reviewRunIdOrMessageRef)
      && typeof outputHash === 'string'
      && outputHash.length > 0
      && metadata.reviewOutputHash === outputHash
      && reviewOutputMatchesEvidence(output, evidence, expectedStatus)
      && metadata.worktree === normalizePathForEvidence(evidence.worktree)
      && metadata.branch === evidence.branch
      && metadata.head === evidence.head
      && metadata.statusSummary === evidence.statusSummary
      && metadata.reviewStatus === expectedStatus
  } catch {
    return false
  }
}

function reviewOutputMatchesEvidence(
  output: string,
  evidence: Extract<ReviewEvidence, { type: 'report_path' | 'tool_output' }>,
  expectedStatus: GateReviewStatus,
): boolean {
  const parsed = parseStructuredReviewOutput(output)
  if (!parsed
    || parsed.worktree !== normalizePathForEvidence(evidence.worktree)
    || parsed.branch !== evidence.branch
    || parsed.head !== evidence.head
    || parsed.statusSummary !== evidence.statusSummary) {
    return false
  }

  if (expectedStatus === 'passed') {
    return parsed.status === 'passed' && !parsed.hasHighOrMediumFinding
  }

  if (expectedStatus === 'failed') {
    return parsed.status === 'failed' || parsed.hasHighOrMediumFinding
  }

  return true
}

function outputContainsPassedStatus(output: string): boolean {
  const parsed = parseStructuredReviewOutput(output)
  return parsed !== undefined
    && parsed.status === 'passed'
    && !parsed.hasHighOrMediumFinding
}

function outputContainsFailedStatus(output: string): boolean {
  const parsed = parseStructuredReviewOutput(output)
  return parsed !== undefined
    && (parsed.status === 'failed' || parsed.hasHighOrMediumFinding)
}

export function hashReviewOutput(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function parseStructuredReviewOutput(output: string): {
  status: 'passed' | 'failed'
  worktree?: string
  branch?: string
  head?: string
  statusSummary?: string
  hasHighOrMediumFinding: boolean
} | undefined {
  const jsonText = extractJsonObject(output)
  if (!jsonText) {
    return undefined
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>
    const rawStatus = parsed.reviewStatus ?? parsed.status ?? parsed.conclusion
    const normalizedStatus = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : undefined
    if (normalizedStatus !== 'passed' && normalizedStatus !== 'pass'
      && normalizedStatus !== 'failed' && normalizedStatus !== 'fail') {
      return undefined
    }

    return {
      status: normalizedStatus === 'passed' || normalizedStatus === 'pass' ? 'passed' : 'failed',
      worktree: typeof parsed.worktree === 'string' ? normalizePathForEvidence(parsed.worktree) : undefined,
      branch: typeof parsed.branch === 'string' ? parsed.branch : undefined,
      head: typeof parsed.head === 'string' ? parsed.head : undefined,
      statusSummary: typeof parsed.statusSummary === 'string' ? parsed.statusSummary : undefined,
      hasHighOrMediumFinding: hasBlockingFinding(parsed.findings),
    }
  } catch {
    return undefined
  }
}

function extractJsonObject(output: string): string | undefined {
  const taskResultMatch = /<task_result>\s*([\s\S]*?)\s*<\/task_result>/.exec(output)
  const candidate = taskResultMatch?.[1] ?? output
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return undefined
  }
  return candidate.slice(start, end + 1)
}

function hasBlockingFinding(findings: unknown): boolean {
  if (!Array.isArray(findings)) {
    return false
  }

  return findings.some((finding) => {
    if (!finding || typeof finding !== 'object') {
      return false
    }
    const severity = (finding as { severity?: unknown }).severity
    return typeof severity === 'string' && /^(critical|high|medium)$/i.test(severity)
  })
}

function isReviewMetadataPath(path: string): boolean {
  return /^docs\/ae\/review\/[^/]+\/metadata\.json$/.test(toPosixPath(path))
}

function addMissingEvidence(missingEvidence: string[], item: string): void {
  if (!missingEvidence.includes(item)) {
    missingEvidence.push(item)
  }
}

function addNextStep(nextSteps: string[], step: string): void {
  if (!nextSteps.includes(step)) {
    nextSteps.push(step)
  }
}

function addArtifactBlockers(
  input: GateInput,
  blockers: string[],
  missingEvidence: string[],
  nextSteps: string[],
  warnings: string[],
  result: GateResult,
): void {
  if (input.workflow === 'lfg' && input.checkpoint !== 'start') {
    if (!input.requirementsPath && !result.evidence.latestArtifacts.requirements) {
      warnings.push('未提供需求文档路径，也未发现最近需求文档；需求清晰时可接受，但必须在 notes 中说明。')
    }
  }

  if (['before_work', 'before_review', 'final'].includes(input.checkpoint) && input.workflow === 'lfg') {
    if (!input.planPath) {
      blockers.push('缺少计划路径，无法证明执行前已完成计划阶段。')
      addMissingEvidence(missingEvidence, '计划路径')
      addNextStep(nextSteps, '补充 plan_path，指向本次执行对应的计划文档。')
    } else if (result.evidence.planExists === undefined) {
      blockers.push('计划路径无效，无法证明执行前已完成计划阶段。')
      addMissingEvidence(missingEvidence, '有效的计划文档路径')
      addNextStep(nextSteps, '改用仓库相对路径传入 plan_path，并确保路径位于当前工作区内。')
    } else if (!result.evidence.planExists) {
      blockers.push(`计划文件不存在：${result.evidence.planPath ?? '未知计划路径'}`)
      addMissingEvidence(missingEvidence, '存在的计划文档')
      addNextStep(nextSteps, '先生成或修正计划文档，再重新执行门禁。')
    }
  }

  if (input.workflow === 'work' && input.planPath && result.evidence.planExists === undefined) {
    blockers.push('计划路径无效，无法证明执行前已完成计划阶段。')
    addMissingEvidence(missingEvidence, '有效的计划文档路径')
    addNextStep(nextSteps, '改用仓库相对路径传入 plan_path，并确保路径位于当前工作区内。')
  } else if (input.workflow === 'work' && input.planPath && !result.evidence.planExists) {
    blockers.push(`计划文件不存在：${result.evidence.planPath ?? '未知计划路径'}`)
    addMissingEvidence(missingEvidence, '存在的计划文档')
    addNextStep(nextSteps, '先生成或修正计划文档，再重新执行门禁。')
  }

  if (input.workflow === 'work' && input.checkpoint === 'final' && !input.planPath) {
    warnings.push('本次 ae:work 未提供计划路径；仅适用于简单裸提示词或已在 notes 中说明的任务。')
    if (!input.notes) {
      blockers.push('ae:work 未提供计划路径时必须在 notes 中说明任务为何无需计划。')
      addMissingEvidence(missingEvidence, '无需计划的说明')
      addNextStep(nextSteps, '在 notes 中说明为何该任务属于无需计划的轻量工作。')
    }
  }
}

function addCheckpointBlockers(
  input: GateInput,
  blockers: string[],
  missingEvidence: string[],
  nextSteps: string[],
  result: GateResult,
): void {
  if (input.workflow === 'lfg' && input.checkpoint === 'before_review' && result.evidence.validationCommands.length === 0) {
    blockers.push('进入代码审查前缺少验证命令记录，不能证明实现已验证。')
    addMissingEvidence(missingEvidence, '验证命令记录')
    addNextStep(nextSteps, '先运行至少一条与本次实现相关的验证命令，再传入 validation_commands。')
  }
}

function addGitAuthorizationBlockers(
  input: GateInput,
  gitOperations: GitOperation[],
  blockers: string[],
  missingEvidence: string[],
  nextSteps: string[],
  result: GateResult,
): void {
  const writeOperations = gitOperations.filter((operation) => operation.write)
  if (!containsGitWriteOperation(gitOperations)) {
    return
  }

  const uncovered = writeOperations.filter((operation) => !result.evidence.gitAuthorizationEvidence.some((evidence) => (
    authorizationCoversOperation(
      operation,
      evidence,
      result.evidence.currentWorktreeFingerprint,
      input.currentSessionId,
      input.trustedAuthorizationRefs ?? [],
    )
  )))

  if (uncovered.length === 0) {
    result.evidenceSources.gitAuthorization = 'user_confirmation'
  } else if (!result.evidence.userAuthorizedGitWrite && result.evidence.gitAuthorizationEvidence.length === 0) {
    blockers.push('检测到 Git 写操作记录，但缺少可引用的用户授权证据。')
    addMissingEvidence(missingEvidence, 'Git 写操作授权证据')
    addNextStep(nextSteps, '在执行 Git 写操作前获取用户明确授权；当前阶段如无结构化授权证据，请撤销本次 Git 写操作或改为不执行写操作。')
  } else if (result.evidence.gitAuthorizationEvidence.length === 0) {
    blockers.push('user_authorized_git_write 仅是工具输入声明，当前门禁不能单独据此放行 Git 写操作。')
    addMissingEvidence(missingEvidence, '可引用的 Git 授权证据')
    addNextStep(nextSteps, '当前版本尚不接受仅靠 user_authorized_git_write 放行 Git 写操作；请避免在首阶段依赖 Git 写操作通过门禁。')
  } else {
    blockers.push('Git 写操作授权证据未覆盖实际执行的命令范围或当前 worktree。')
    addMissingEvidence(missingEvidence, '覆盖实际 Git 写命令的结构化授权证据')
    addNextStep(nextSteps, '确认 git_operation_args 与 git_authorization_evidence.final_command_args 完全一致，并绑定当前 worktree。')
  }
}

function addFinalBlockers(
  repoRoot: string,
  input: GateInput,
  gitOperations: GitOperation[],
  blockers: string[],
  missingEvidence: string[],
  nextSteps: string[],
  warnings: string[],
  result: GateResult,
): void {
  addGitAuthorizationBlockers(input, gitOperations, blockers, missingEvidence, nextSteps, result)

  if (input.checkpoint !== 'final') {
    return
  }

  const hasCodeEvidence = result.evidence.changedFiles.length > 0 || Boolean(input.noCodeChangeReason)
  if (!hasCodeEvidence) {
    blockers.push('没有检测到代码变更，也未提供 no_code_change_reason，不能证明工作已执行。')
    addMissingEvidence(missingEvidence, '代码变更证据或 no_code_change_reason')
    addNextStep(nextSteps, '补充代码变更，或在 no_code_change_reason 中说明为何本次没有代码变更。')
  }

  if (result.evidence.validationCommands.length === 0) {
    blockers.push('缺少验证命令记录，不能证明没有漏验证。')
    addMissingEvidence(missingEvidence, '验证命令记录')
    addNextStep(nextSteps, '补充本次实际运行的验证命令；没有可运行验证时，在最终交付中明确降级为未验证。')
  } else {
    warnings.push('validation_commands 当前只记录代理声明的命令列表；除非附带可引用执行结果，否则不能单独证明验证已成功执行。')
  }

  if (!input.gitOperations && !input.gitOperationArgs) {
    blockers.push('缺少 git_operations 记录；没有 Git 写操作时也必须显式传空数组。')
    addMissingEvidence(missingEvidence, 'git_operations 记录')
    addNextStep(nextSteps, '补充 git_operations；若没有 Git 写操作，请显式传入空数组。')
  }

  if (input.workflow === 'lfg' && result.evidence.reviewStatus !== 'passed') {
    blockers.push('LFG 最终门禁要求代码审查通过，当前 review_status 不是 passed。')
  }

  if (input.workflow === 'work' && result.evidence.reviewStatus === 'failed') {
    blockers.push('ae:work 最终门禁检测到审查失败，不能交付。')
  }

  const requiresWorktreeDecision = input.workflow === 'work' || input.workflow === 'lfg'

  if (requiresWorktreeDecision && !result.evidence.worktreeDecision) {
    blockers.push('缺少 worktree_decision，不能证明实现前已完成 worktree 决策。')
    addMissingEvidence(missingEvidence, 'worktree_decision')
    addNextStep(nextSteps, '补充 worktree_decision，记录本次选择 created、rejected、transferred、cancelled 或 not_applicable。')
  } else if (requiresWorktreeDecision && ['transferred', 'cancelled'].includes(result.evidence.worktreeDecision ?? '')) {
    blockers.push('worktree_decision 为 transferred/cancelled 时不能作为功能交付最终门禁通过。')
    addNextStep(nextSteps, '在目标 worktree 重新执行 ae:work 并运行最终门禁，或将取消状态作为非交付结果记录。')
  } else if (
    requiresWorktreeDecision
      && result.evidence.worktreeDecision === 'not_applicable'
      && result.evidence.currentWorktreeFingerprint.available
  ) {
    blockers.push('当前目录是 Git worktree，worktree_decision 不能标记为 not_applicable。')
    addMissingEvidence(missingEvidence, '实际 worktree 决策')
    addNextStep(nextSteps, '在 Git worktree 中记录 created 或 rejected，只有 Git 不可用或不支持 worktree 时才使用 not_applicable。')
  }

  if (input.noCodeChangeReason) {
    warnings.push('no_code_change_reason 属于声明证据；它可以解释为何没有代码变更，但不能替代可观察的实现或验证结果。')
  }

  addReviewEvidenceBlockers(repoRoot, input, blockers, missingEvidence, nextSteps, result)
}

function buildSummary(result: GateResult): string {
  const changedFileCount = result.evidence.changedFiles.length
  const blockers = result.blockers.length
  const warnings = result.warnings.length
  const statusText = result.status === 'pass' ? '通过' : '阻断'

  return [
    `门禁${statusText}：${result.workflow}/${result.checkpoint}`,
    `阻断项 ${blockers} 个`,
    `警告 ${warnings} 个`,
    `工作区变更 ${changedFileCount} 个文件`,
    result.missingEvidence.length > 0 ? `缺失证据：${result.missingEvidence.join('、')}` : '缺失证据：无',
  ].join('；')
}

function writeProof(repoRoot: string, result: GateResult, notes?: string): string {
  const dir = join(repoRoot, 'docs', 'ae', 'gates')
  mkdirSync(dir, { recursive: true })

  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const fileName = `${timestamp}-${result.workflow}-${result.checkpoint}.json`
  const target = join(dir, fileName)
  writeFileSync(target, `${JSON.stringify({ ...result, notes }, null, 2)}\n`, 'utf8')
  return toRepoRelativePath(repoRoot, target)
}

function runGateSync(repoRoot: string, input: GateInput): GateResult {
  const blockers: string[] = []
  const missingEvidence: string[] = []
  const nextSteps: string[] = []
  const warnings: string[] = []
  const requirementsPath = validateArtifactPath(repoRoot, input.requirementsPath)
  const planPath = validateArtifactPath(repoRoot, input.planPath)
  const currentWorktreeFingerprint = collectCurrentWorktreeFingerprint(repoRoot)
  const gitOperations = normalizeCommands(input.gitOperations)
  const parsedGitOperations = getGitOperations(input, gitOperations)

  if (requirementsPath.error) {
    blockers.push(`需求文档${requirementsPath.error}`)
  }

  if (planPath.error) {
    blockers.push(`计划文档${planPath.error}`)
  }

  const result: GateResult = {
    status: 'pass',
    workflow: input.workflow,
    checkpoint: input.checkpoint,
    blockers,
    warnings,
    missingEvidence,
    nextSteps,
    evidenceSources: {
      requirements: getArtifactSource(requirementsPath.normalizedPath, requirementsPath.exists),
      plan: getArtifactSource(planPath.normalizedPath, planPath.exists),
      workExecution: 'not_provided',
      validation: 'not_provided',
      review: 'not_provided',
      browserTest: 'not_provided',
      gitOperations: input.gitOperations || input.gitOperationArgs ? 'tool_input_declared' : 'not_provided',
      gitAuthorization: getGitAuthorizationSource(
        input.userAuthorizedGitWrite ?? false,
        input.userAuthorizedGitWrite !== undefined,
        input.gitAuthorizationEvidence ?? [],
        input.trustedAuthorizationRefs ?? [],
      ),
    },
    evidence: {
      requirementsPath: requirementsPath.normalizedPath,
      requirementsExists: requirementsPath.exists,
      planPath: planPath.normalizedPath,
      planExists: planPath.exists,
      changedFiles: currentWorktreeFingerprint.available
        ? parseChangedFiles(currentWorktreeFingerprint.statusSummary ?? '')
        : collectChangedFiles(repoRoot),
      validationCommands: normalizeCommands(input.validationCommands),
      reviewStatus: input.reviewStatus ?? 'not_run',
      browserTestStatus: input.browserTestStatus ?? 'not_applicable',
      gitOperations,
      gitOperationArgs: input.gitOperationArgs ?? [],
      gitAuthorizationEvidence: input.gitAuthorizationEvidence ?? [],
      reviewEvidence: input.reviewEvidence,
      worktreeDecision: input.worktreeDecision,
      currentWorktreeFingerprint,
      userAuthorizedGitWrite: input.userAuthorizedGitWrite ?? false,
      noCodeChangeReason: input.noCodeChangeReason,
      latestArtifacts: {
        requirements: listLatestMarkdown(repoRoot, 'docs/ae/brainstorms'),
        plan: listLatestMarkdown(repoRoot, 'docs/ae/plans'),
      },
    },
    summary: '',
  }

  result.evidenceSources.workExecution = getWorkExecutionSource(
    result.evidence.changedFiles,
    result.evidence.noCodeChangeReason,
  )
  result.evidenceSources.validation = getValidationSource(result.evidence.validationCommands)
  result.evidenceSources.review = getReviewSource(result.evidence.reviewStatus)
  result.evidenceSources.browserTest = getOptionalStatusSource(input.browserTestStatus)

  addArtifactBlockers(input, blockers, missingEvidence, nextSteps, warnings, result)
  addCheckpointBlockers(input, blockers, missingEvidence, nextSteps, result)
  addFinalBlockers(repoRoot, input, parsedGitOperations, blockers, missingEvidence, nextSteps, warnings, result)

  result.status = blockers.length > 0 ? 'block' : 'pass'
  result.summary = buildSummary(result)

  if (input.writeProof ?? input.checkpoint === 'final') {
    result.proofPath = writeProof(repoRoot, result, input.notes)
  }

  return result
}

export function runGate(repoRoot: string, input: GateInput): Effect.Effect<GateResult, Error> {
  return Effect.try({
    try: () => runGateSync(repoRoot, input),
    catch: (error) => error instanceof Error ? error : new Error(String(error)),
  })
}
