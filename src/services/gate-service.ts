import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Effect } from 'effect'

import { isInsideRoot, toPosixPath, toRepoRelativePath } from '../utils/path-utils.js'

export type GateWorkflow = 'lfg' | 'work'
export type GateCheckpoint = 'start' | 'before_plan' | 'before_work' | 'before_review' | 'final'
export type GateReviewStatus = 'passed' | 'failed' | 'not_run' | 'not_applicable'

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

function addArtifactBlockers(input: GateInput, blockers: string[], warnings: string[], result: GateResult): void {
  if (input.workflow === 'lfg' && input.checkpoint !== 'start') {
    if (!input.requirementsPath && !result.evidence.latestArtifacts.requirements) {
      warnings.push('未提供需求文档路径，也未发现最近需求文档；需求清晰时可接受，但必须在 notes 中说明。')
    }
  }

  if (['before_work', 'before_review', 'final'].includes(input.checkpoint) && input.workflow === 'lfg') {
    if (!input.planPath) {
      blockers.push('缺少计划路径，无法证明执行前已完成计划阶段。')
    } else if (result.evidence.planExists === undefined) {
      blockers.push('计划路径无效，无法证明执行前已完成计划阶段。')
    } else if (!result.evidence.planExists) {
      blockers.push(`计划文件不存在：${result.evidence.planPath ?? '未知计划路径'}`)
    }
  }

  if (input.workflow === 'work' && input.planPath && result.evidence.planExists === undefined) {
    blockers.push('计划路径无效，无法证明执行前已完成计划阶段。')
  } else if (input.workflow === 'work' && input.planPath && !result.evidence.planExists) {
    blockers.push(`计划文件不存在：${result.evidence.planPath ?? '未知计划路径'}`)
  }

  if (input.workflow === 'work' && input.checkpoint === 'final' && !input.planPath) {
    warnings.push('本次 ae:work 未提供计划路径；仅适用于简单裸提示词或已在 notes 中说明的任务。')
    if (!input.notes) {
      blockers.push('ae:work 未提供计划路径时必须在 notes 中说明任务为何无需计划。')
    }
  }
}

function addCheckpointBlockers(input: GateInput, blockers: string[], result: GateResult): void {
  if (input.workflow === 'lfg' && input.checkpoint === 'before_review' && result.evidence.validationCommands.length === 0) {
    blockers.push('进入代码审查前缺少验证命令记录，不能证明实现已验证。')
  }
}

function addFinalBlockers(input: GateInput, blockers: string[], result: GateResult): void {
  if (input.checkpoint !== 'final') {
    return
  }

  const hasCodeEvidence = result.evidence.changedFiles.length > 0 || Boolean(input.noCodeChangeReason)
  if (!hasCodeEvidence) {
    blockers.push('没有检测到代码变更，也未提供 no_code_change_reason，不能证明工作已执行。')
  }

  if (result.evidence.validationCommands.length === 0) {
    blockers.push('缺少验证命令记录，不能证明没有漏验证。')
  }

  if (!input.gitOperations) {
    blockers.push('缺少 git_operations 记录；没有 Git 写操作时也必须显式传空数组。')
  }

  if (input.workflow === 'lfg' && result.evidence.reviewStatus !== 'passed') {
    blockers.push('LFG 最终门禁要求代码审查通过，当前 review_status 不是 passed。')
  }

  if (input.workflow === 'work' && result.evidence.reviewStatus === 'failed') {
    blockers.push('ae:work 最终门禁检测到审查失败，不能交付。')
  }

  if (containsGitWriteOperation(result.evidence.gitOperations) && !result.evidence.userAuthorizedGitWrite) {
    blockers.push('检测到 Git 写操作记录，但未声明用户已授权。')
  }
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
  }

  addArtifactBlockers(input, blockers, warnings, result)
  addCheckpointBlockers(input, blockers, result)
  addFinalBlockers(input, blockers, result)

  result.status = blockers.length > 0 ? 'block' : 'pass'

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
