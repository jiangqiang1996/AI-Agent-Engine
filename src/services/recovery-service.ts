import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Effect } from 'effect'

import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { listArtifacts } from './artifact-store.js'
import type { RecoveryResult } from '../schemas/recovery-schema.js'
import { ArtifactFrontmatterSchema } from '../schemas/artifact-schema.js'
import { SKILL } from '../schemas/ae-asset-schema.js'
import { parseFrontmatter } from '../utils/frontmatter.js'

type ArtifactKind = 'brainstorm' | 'plan' | 'work' | 'review'

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
    case 'brainstorm':
    case 'lfg':
      return SKILL.BRAINSTORM
    case 'plan':
      return SKILL.BRAINSTORM
    case 'work':
    case 'review':
      return SKILL.PLAN
  }
}

function preferredArtifactTypes(phase: RecoveryResult['phase']): ArtifactKind[] {
  switch (phase) {
    case 'brainstorm':
      return []
    case 'plan':
      return ['brainstorm']
    case 'work':
      return ['work', 'plan']
    case 'review':
      return ['review', 'work', 'plan']
    case 'lfg':
      return ['review', 'work', 'plan', 'brainstorm']
  }
}

function nextSkillForArtifact(phase: RecoveryResult['phase'], artifactType: ArtifactKind): string {
  switch (phase) {
    case 'plan':
      return SKILL.PLAN
    case 'work':
      return SKILL.WORK
    case 'review':
      if (artifactType === 'plan' || artifactType === 'brainstorm') {
        return SKILL.DOCUMENT_REVIEW
      }
      return SKILL.REVIEW
    case 'brainstorm':
      return SKILL.BRAINSTORM
    case 'lfg':
      switch (artifactType) {
        case 'review':
          return SKILL.REVIEW
        case 'work':
          return SKILL.WORK
        case 'plan':
          return SKILL.DOCUMENT_REVIEW
        case 'brainstorm':
          return SKILL.DOCUMENT_REVIEW
      }
  }
}

function resumePhaseForArtifact(
  phase: RecoveryResult['phase'],
  artifactType: ArtifactKind,
): RecoveryResult['phase'] {
  if (phase !== 'lfg') {
    return phase
  }
  switch (artifactType) {
    case 'review':
      return 'review'
    case 'work':
      return 'work'
    case 'plan':
      return 'review'
    case 'brainstorm':
      return 'review'
  }
}

function hasValidMetadata(artifact: {
  type: ArtifactKind
  frontmatter: Record<string, string>
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

function fingerprintFromFrontmatter(frontmatter: Record<string, string>): string | undefined {
  if (!frontmatter.date) {
    return undefined
  }
  if (frontmatter.topic) {
    return `${frontmatter.date}-${kebabCase(frontmatter.topic)}`
  }
  if (frontmatter.title) {
    return `${frontmatter.date}-${kebabCase(frontmatter.title)}`
  }
  return undefined
}

function validateOriginFingerprint(
  manifest: RuntimeAssetManifest,
  artifact: { path: string; frontmatter: Record<string, string> },
): string | undefined {
  if (!artifact.frontmatter.origin && !artifact.frontmatter.originFingerprint) {
    return undefined
  }
  if (!artifact.frontmatter.origin) {
    return `originFingerprint 无法校验：${displayPath(manifest, artifact.path)} 缺少 origin 字段`
  }
  if (!artifact.frontmatter.originFingerprint) {
    return `originFingerprint 无法校验：${displayPath(manifest, artifact.path)} 缺少 originFingerprint 字段`
  }

  const originPath = join(manifest.repoRoot, artifact.frontmatter.origin)

  let originFrontmatter: Record<string, string>
  try {
    originFrontmatter = Effect.runSync(
      Effect.try({
        try: () => parseFrontmatter(readFileSync(originPath, 'utf8')).data,
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }),
    )
  } catch {
    return `originFingerprint 无法校验：读取上游产物失败 ${artifact.frontmatter.origin}（文件不存在或不可读）`
  }

  const expected = fingerprintFromFrontmatter(originFrontmatter)
  if (!expected) {
    return `originFingerprint 无法校验：上游产物缺少 date+topic/title ${artifact.frontmatter.origin}`
  }
  if (artifact.frontmatter.originFingerprint !== expected) {
    return `originFingerprint 不匹配：${displayPath(manifest, artifact.path)} 期望 '${expected}'，实际 '${artifact.frontmatter.originFingerprint}'`
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

  if (phase === 'brainstorm') {
    return {
      resolution: 'needs-upstream',
      phase,
      resumePhase: 'brainstorm',
      nextSkill: SKILL.BRAINSTORM,
      fallbackSkill: SKILL.BRAINSTORM,
      reason: '头脑风暴阶段应从新需求开始或显式指定已有文档。',
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

    const activeArtifacts = artifacts.filter((artifact) => !artifact.frontmatter.supersededBy)
    if (activeArtifacts.length === 0) {
      continue
    }

    let candidateArtifacts = activeArtifacts
    if (options.expectedOriginFingerprint) {
      const matchingArtifacts = activeArtifacts.filter(
        (artifact) => artifact.frontmatter.originFingerprint === options.expectedOriginFingerprint,
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
      return {
        resolution: 'resolved',
        phase,
        resumePhase: resumePhaseForArtifact(phase, artifactType),
        nextSkill: nextSkillForArtifact(phase, artifactType),
        artifactType,
        path: candidateArtifacts[0] ? displayPath(manifest, candidateArtifacts[0].path) : undefined,
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
