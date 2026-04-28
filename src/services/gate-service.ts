import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Effect } from 'effect'

import { isInsideRoot, toPosixPath, toRepoRelativePath } from '../utils/path-utils.js'

export type GateWorkflow = 'lfg' | 'work'
export type GateCheckpoint = 'start' | 'before_plan' | 'before_work' | 'before_review' | 'final'
export type GateReviewStatus = 'passed' | 'failed' | 'not_run' | 'not_applicable'
export type GateEvidenceSource =
  | 'observable_workspace'
  | 'tool_output'
  | 'tool_input_declared'
  | 'user_confirmation'
  | 'not_provided'

export interface GateInput {
  workflow: GateWorkflow
  checkpoint: GateCheckpoint
  requirementsPath?: string
  planPath?: string
  validationCommands?: string[]
  reviewStatus?: GateReviewStatus
  browserTestStatus?: GateReviewStatus
  gitOperations?: string[]
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

function listLatestMarkdown(repoRoot: string, dir: string): string | undefined {
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
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })

    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map(toPosixPath)
  } catch {
    return []
  }
}

function containsGitWriteOperation(operations: string[]): boolean {
  return operations.some((operation) => {
    const tokens = operation.toLowerCase().trim().split(/\s+/).filter(Boolean)
    const gitIndex = tokens.indexOf('git')
    if (gitIndex === -1) {
      return false
    }

    const subcommand = tokens.slice(gitIndex + 1).find((token) => !token.startsWith('-') && token !== '.')
    if (!subcommand) {
      return false
    }

    const writeSubcommands = new Set([
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
      'update-ref',
    ])

    return writeSubcommands.has(subcommand) || [
      '--no-verify',
      '--amend',
    ].some((token) => tokens.includes(token))
  })
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

function getGitAuthorizationSource(userAuthorizedGitWrite: boolean, inputProvided: boolean): GateEvidenceSource {
  if (!inputProvided) {
    return 'not_provided'
  }

  void userAuthorizedGitWrite
  return 'tool_input_declared'
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

function addFinalBlockers(
  input: GateInput,
  blockers: string[],
  missingEvidence: string[],
  nextSteps: string[],
  warnings: string[],
  result: GateResult,
): void {
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

  if (!input.gitOperations) {
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

  if (input.noCodeChangeReason) {
    warnings.push('no_code_change_reason 属于声明证据；它可以解释为何没有代码变更，但不能替代可观察的实现或验证结果。')
  }

  if (containsGitWriteOperation(result.evidence.gitOperations)) {
    if (!result.evidence.userAuthorizedGitWrite) {
      blockers.push('检测到 Git 写操作记录，但缺少可引用的用户授权证据。')
      addMissingEvidence(missingEvidence, 'Git 写操作授权证据')
      addNextStep(nextSteps, '在执行 Git 写操作前获取用户明确授权；当前阶段如无结构化授权证据，请撤销本次 Git 写操作或改为不执行写操作。')
    } else {
      blockers.push('user_authorized_git_write 仅是工具输入声明，当前门禁不能单独据此放行 Git 写操作。')
      addMissingEvidence(missingEvidence, '可引用的 Git 授权证据')
      addNextStep(nextSteps, '当前版本尚不接受仅靠 user_authorized_git_write 放行 Git 写操作；请避免在首阶段依赖 Git 写操作通过门禁。')
    }
  }
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
      gitOperations: input.gitOperations ? 'tool_input_declared' : 'not_provided',
      gitAuthorization: getGitAuthorizationSource(
        input.userAuthorizedGitWrite ?? false,
        input.userAuthorizedGitWrite !== undefined,
      ),
    },
    evidence: {
      requirementsPath: requirementsPath.normalizedPath,
      requirementsExists: requirementsPath.exists,
      planPath: planPath.normalizedPath,
      planExists: planPath.exists,
      changedFiles: collectChangedFiles(repoRoot),
      validationCommands: normalizeCommands(input.validationCommands),
      reviewStatus: input.reviewStatus ?? 'not_run',
      browserTestStatus: input.browserTestStatus ?? 'not_applicable',
      gitOperations: input.gitOperations ?? [],
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
  addFinalBlockers(input, blockers, missingEvidence, nextSteps, warnings, result)

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
