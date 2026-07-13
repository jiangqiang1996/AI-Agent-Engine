import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Effect } from 'effect'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { listArtifacts } from './artifact-store.js'
import type { RecoveryResult } from '../schemas/recovery-schema.js'
import { ArtifactFrontmatterSchema, type ArtifactKind } from '../schemas/artifact-schema.js'
import { SKILL } from '../schemas/ae-asset-schema.js'
import { getFrontmatterString, parseFrontmatter, type FrontmatterData } from '../utils/frontmatter.js'

type RecoverableArtifactKind = NonNullable<RecoveryResult['artifactType']>

function invalidResult(phase: RecoveryResult['phase'], reason: string): RecoveryResult {
  return {
    resolution: 'invalid-artifact',
    phase,
    reason,
    candidates: [],
  }
}

function fallbackSkillForPhase(phase: RecoveryResult['phase']): string {
  switch (phase) {
    case 'prd':
      return SKILL.PRD
    case 'design':
      return SKILL.DESIGN
    case 'work':
    case 'review':
      return SKILL.DESIGN
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

function preferredArtifactTypes(phase: RecoveryResult['phase']): RecoverableArtifactKind[] {
  switch (phase) {
    case 'prd':
      return []
    case 'design':
      return ['prd']
    case 'work':
      return ['work', 'design']
    case 'review':
      return ['review', 'work', 'design', 'prd']
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

function nextSkillForArtifact(phase: RecoveryResult['phase'], artifactType: RecoverableArtifactKind): string {
  switch (phase) {
    case 'prd':
      return SKILL.PRD
    case 'design':
      return SKILL.DESIGN
    case 'work':
      return SKILL.WORK
    case 'review':
      return SKILL.REVIEW
    default: {
      const _exhaustive: never = phase
      return _exhaustive
    }
  }
}

function nextArgumentsForArtifact(
  phase: RecoveryResult['phase'],
  artifactType: RecoverableArtifactKind,
  path?: string,
): string | undefined {
  if (phase === 'review' && (artifactType === 'design' || artifactType === 'prd')) {
    if (!path) {
      return undefined
    }
    return `domain=document ${path}`
  }
  return undefined
}

function nextCommandForArtifact(
  phase: RecoveryResult['phase'],
  artifactType: RecoverableArtifactKind,
  path?: string,
): string | undefined {
  const nextSkill = nextSkillForArtifact(phase, artifactType)
  const nextArguments = nextArgumentsForArtifact(phase, artifactType, path)
  return nextArguments ? `${nextSkill} ${nextArguments}` : nextSkill
}

function resumePhaseForArtifact(
  phase: RecoveryResult['phase'],
  _artifactType: RecoverableArtifactKind,
): RecoveryResult['phase'] {
  return phase
}

function hasValidMetadata(artifact: {
  type: ArtifactKind
  frontmatter: FrontmatterData
}): boolean {
  const result = ArtifactFrontmatterSchema.safeParse(artifact.frontmatter)
  return result.success && result.data.type === artifact.type
}

function displayPath(manifest: RuntimeAssetManifest, path: string): string {
  return relative(manifest.repoRoot, path).replace(/\\/g, '/')
}

function kebabCase(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function fingerprintFromFrontmatter(frontmatter: FrontmatterData): string | undefined {
  const date = getFrontmatterString(frontmatter, 'date')
  const topic = getFrontmatterString(frontmatter, 'topic')
  const title = getFrontmatterString(frontmatter, 'title')

  if (!date) {
    return undefined
  }
  if (topic) {
    return `${date}-${kebabCase(topic)}`
  }
  if (title) {
    return `${date}-${kebabCase(title)}`
  }
  return undefined
}

function validateOriginFingerprint(
  manifest: RuntimeAssetManifest,
  artifact: { path: string; frontmatter: FrontmatterData },
): string | undefined {
  const origin = getFrontmatterString(artifact.frontmatter, 'origin')
  const originFingerprint = getFrontmatterString(artifact.frontmatter, 'originFingerprint')

  // originFingerprint 只有在成对出现时才有校验意义；缺任一字段都提示人工介入。
  if (!origin && !originFingerprint) {
    return undefined
  }
  if (!origin) {
    return `originFingerprint 无法校验：${displayPath(manifest, artifact.path)} 缺少 origin 字段`
  }
  if (!originFingerprint) {
    return `originFingerprint 无法校验：${displayPath(manifest, artifact.path)} 缺少 originFingerprint 字段`
  }

  const originPath = join(manifest.repoRoot, origin)

  let originFrontmatter: FrontmatterData
  try {
    originFrontmatter = Effect.runSync(
      Effect.try({
        try: () => parseFrontmatter(readFileSync(originPath, 'utf8')).data,
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }),
    )
  } catch {
    return `originFingerprint 无法校验：读取上游产物失败 ${origin}（文件不存在或不可读）`
  }

  const expected = fingerprintFromFrontmatter(originFrontmatter)
  if (!expected) {
    return `originFingerprint 无法校验：上游产物缺少 date+topic/title ${origin}`
  }
  // 指纹由上游产物的稳定元数据派生，用于识别同名或过期产物导致的误恢复。
  if (originFingerprint !== expected) {
    return `originFingerprint 不匹配：${displayPath(manifest, artifact.path)} 期望 '${expected}'，实际 '${originFingerprint}'`
  }
  return undefined
}

/**
 * 解析 AE 阶段恢复建议。
 * 根据阶段选择候选产物，校验 frontmatter 与上游指纹，并返回下一步技能与候选路径。
 */
export function resolveRecovery(
  manifest: RuntimeAssetManifest,
  phase: RecoveryResult['phase'],
  options: {
    expectedOriginFingerprint?: string
  } = {},
): RecoveryResult {
  const warnings: string[] = []

  if (phase === 'prd') {
    return {
      resolution: 'needs-upstream',
      phase,
      resumePhase: 'prd',
      nextSkill: SKILL.PRD,
      fallbackSkill: SKILL.PRD,
      reason: 'PRD 阶段应从新需求开始或显式指定已有文档。',
      candidates: [],
    }
  }

  for (const artifactType of preferredArtifactTypes(phase)) {
    let artifacts

    try {
      artifacts = Effect.runSync(
        Effect.try({
          try: () => listArtifacts(manifest, artifactType),
          catch: (error) => error instanceof Error ? error : new Error(String(error)),
        }),
      )
    } catch {
      return invalidResult(phase, `读取 ${artifactType} 恢复产物失败：目录不存在或不可读`)
    }

    if (artifacts.length === 0) {
      continue
    }

    const invalidMetadata = artifacts.find((artifact) => !hasValidMetadata(artifact))
    if (invalidMetadata) {
      return invalidResult(phase, `frontmatter 无效：${displayPath(manifest, invalidMetadata.path)}`)
    }

    const activeArtifacts = artifacts.filter((artifact) => !getFrontmatterString(artifact.frontmatter, 'supersededBy'))
    if (activeArtifacts.length === 0) {
      continue
    }

    let candidateArtifacts = activeArtifacts
    if (options.expectedOriginFingerprint) {
      // 调用方给出期望上游指纹时优先精确匹配；找不到匹配项仍保留候选并返回警告，避免误判为完全不可恢复。
      const matchingArtifacts = activeArtifacts.filter(
        (artifact) => getFrontmatterString(artifact.frontmatter, 'originFingerprint') === options.expectedOriginFingerprint,
      )

      if (matchingArtifacts.length > 0) {
        candidateArtifacts = matchingArtifacts
      } else {
        warnings.push(
          `originFingerprint 不匹配：期望 '${options.expectedOriginFingerprint}'，但候选产物均不匹配，恢复结果可能指向错误的产物`,
        )
      }
    }

    const invalid = candidateArtifacts.find((artifact) => artifact.body.trim().length === 0)
    if (invalid) {
      return invalidResult(phase, `产物为空：${displayPath(manifest, invalid.path)}`)
    }

    for (const artifact of candidateArtifacts) {
      const warning = validateOriginFingerprint(manifest, artifact)
      if (warning) {
        warnings.push(warning)
      }
    }

    if (candidateArtifacts.length > 1) {
      return {
        resolution: 'needs-selection',
        phase,
        resumePhase: resumePhaseForArtifact(phase, artifactType),
        nextSkill: nextSkillForArtifact(phase, artifactType),
        artifactType,
        reason: '找到多个候选产物，需要显式选择。',
        candidates: candidateArtifacts.map((artifact) => displayPath(manifest, artifact.path)),
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    }

    if (candidateArtifacts.length === 1) {
      const path = candidateArtifacts[0] ? displayPath(manifest, candidateArtifacts[0].path) : undefined
      return {
        resolution: 'resolved',
        phase,
        resumePhase: resumePhaseForArtifact(phase, artifactType),
        nextSkill: nextSkillForArtifact(phase, artifactType),
        nextArguments: nextArgumentsForArtifact(phase, artifactType, path),
        nextCommand: nextCommandForArtifact(phase, artifactType, path),
        artifactType,
        path,
        reason: '已找到唯一候选产物。',
        candidates: [],
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    }
  }

  return {
    resolution: 'needs-upstream',
    phase,
    resumePhase: phase,
    nextSkill: fallbackSkillForPhase(phase),
    fallbackSkill: fallbackSkillForPhase(phase),
    reason: warnings.length > 0
      ? '没有找到可继续的产物。' + warnings.join('；')
      : '没有找到可继续的产物。',
    candidates: [],
    warnings: warnings.length > 0 ? warnings : undefined,
  }
}
