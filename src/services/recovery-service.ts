import type { RuntimeAssetManifest } from './runtime-asset-manifest.js'
import { listArtifacts } from './artifact-store.js'
import type { RecoveryResult } from '../schemas/recovery-schema.js'
import { ArtifactFrontmatterSchema } from '../schemas/artifact-schema.js'

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
    case 'document-review':
    case 'lfg':
      return 'ae:brainstorm'
    case 'plan':
      return 'ae:brainstorm'
    case 'plan-review':
    case 'work':
    case 'review':
      return 'ae:plan'
  }
}

function preferredArtifactTypes(phase: RecoveryResult['phase']): ArtifactKind[] {
  switch (phase) {
    case 'brainstorm':
      return []
    case 'document-review':
    case 'plan':
      return ['brainstorm']
    case 'plan-review':
      return ['plan']
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
    case 'document-review':
      return 'ae:document-review'
    case 'plan':
      return 'ae:plan'
    case 'plan-review':
      return 'ae:plan-review'
    case 'work':
      return 'ae:work'
    case 'review':
      return 'ae:review'
    case 'brainstorm':
      return 'ae:brainstorm'
    case 'lfg':
      switch (artifactType) {
        case 'review':
          return 'ae:review'
        case 'work':
          return 'ae:work'
        case 'plan':
          return 'ae:work'
        case 'brainstorm':
          return 'ae:document-review'
      }
  }
}

function resumePhaseForArtifact(phase: RecoveryResult['phase'], artifactType: ArtifactKind): RecoveryResult['phase'] {
  if (phase !== 'lfg') {
    return phase
  }

  switch (artifactType) {
    case 'review':
      return 'review'
    case 'work':
      return 'work'
    case 'plan':
      return 'work'
    case 'brainstorm':
      return 'document-review'
  }
}

function hasValidMetadata(artifact: {
  type: ArtifactKind
  frontmatter: Record<string, string>
}): boolean {
  if (artifact.type === 'brainstorm') {
    return Boolean(artifact.frontmatter.date && artifact.frontmatter.topic)
  }

  if (artifact.type === 'plan') {
    return Boolean(
      artifact.frontmatter.title &&
        artifact.frontmatter.type &&
        artifact.frontmatter.status &&
        artifact.frontmatter.date,
    )
  }

  return ArtifactFrontmatterSchema.safeParse({
    type: artifact.type,
    status: artifact.frontmatter.status,
    origin: artifact.frontmatter.origin,
    originFingerprint: artifact.frontmatter.originFingerprint,
    supersededBy: artifact.frontmatter.supersededBy,
  }).success
}

export function resolveRecovery(
  manifest: RuntimeAssetManifest,
  phase: RecoveryResult['phase'],
  options: {
    expectedOriginFingerprint?: string
  } = {},
): RecoveryResult {
  let sawFingerprintMismatch = false

  if (phase === 'brainstorm') {
    return {
      resolution: 'needs-upstream',
      phase,
      resumePhase: 'brainstorm',
      nextSkill: 'ae:brainstorm',
      fallbackSkill: 'ae:brainstorm',
      reason: '头脑风暴阶段应从新需求开始或显式指定已有文档。',
      candidates: [],
    }
  }

  for (const artifactType of preferredArtifactTypes(phase)) {
    let artifacts

    try {
      artifacts = listArtifacts(manifest, artifactType)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return invalidResult(phase, `读取恢复产物失败：${message}`)
    }

    if (artifacts.length === 0) {
      continue
    }

    const activeArtifacts = artifacts.filter((artifact) => !artifact.frontmatter.supersededBy)
    if (activeArtifacts.length === 0) {
      continue
    }

    const filteredArtifacts = options.expectedOriginFingerprint
      ? activeArtifacts.filter((artifact) => {
          const fingerprint = artifact.frontmatter.originFingerprint
          return fingerprint === options.expectedOriginFingerprint
        })
      : activeArtifacts

    if (options.expectedOriginFingerprint && filteredArtifacts.length === 0) {
      sawFingerprintMismatch = true
      continue
    }

    if (filteredArtifacts.length === 0) {
      continue
    }

    const invalid = filteredArtifacts.find((artifact) => artifact.body.trim().length === 0)
    if (invalid) {
      return invalidResult(phase, `产物为空：${invalid.path}`)
    }

    const invalidMetadata = filteredArtifacts.find((artifact) => !hasValidMetadata(artifact))
    if (invalidMetadata) {
      return invalidResult(phase, `frontmatter 无效：${invalidMetadata.path}`)
    }

    if (filteredArtifacts.length > 1) {
      return {
        resolution: 'needs-selection',
        phase,
        resumePhase: resumePhaseForArtifact(phase, artifactType),
        nextSkill: nextSkillForArtifact(phase, artifactType),
        artifactType,
        reason: '找到多个候选产物，需要显式选择。',
        candidates: filteredArtifacts.map((artifact) => artifact.path),
      }
    }

    if (filteredArtifacts.length === 1) {
      return {
        resolution: 'resolved',
        phase,
        resumePhase: resumePhaseForArtifact(phase, artifactType),
        nextSkill: nextSkillForArtifact(phase, artifactType),
        artifactType,
        path: filteredArtifacts[0]?.path,
        reason: '已找到唯一候选产物。',
        candidates: [],
      }
    }
  }

  if (sawFingerprintMismatch) {
    return invalidResult(phase, '存在产物，但上游指纹不匹配，需回到上游修正阶段。')
  }

  return {
    resolution: 'needs-upstream',
    phase,
    resumePhase: phase,
    nextSkill: fallbackSkillForPhase(phase),
    fallbackSkill: fallbackSkillForPhase(phase),
    reason: '没有找到可继续的产物。',
    candidates: [],
  }
}
