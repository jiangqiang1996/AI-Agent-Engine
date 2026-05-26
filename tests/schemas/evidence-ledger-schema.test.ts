import { describe, expect, it } from 'vitest'

import { DOCS_AE_SUBDIRS, docsAePath } from '../../src/schemas/docs-ae-paths.js'
import {
  EvidenceRecordSchema,
  EvidenceTrustSchema,
  type EvidenceRecord,
} from '../../src/schemas/evidence-ledger-schema.js'
import { completeEvidenceRecord, verifyRecordHash } from '../../src/services/evidence-ledger-service.js'

function createRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return completeEvidenceRecord({
    id: 'validation-1',
    evidenceKind: 'validation',
    producer: {
      tool: 'ae-validation-proof',
      proofKind: 'ae-validation-proof',
    },
    trust: {
      sourceTrust: 'machine-verifiable',
      captureTrust: 'trusted-tool-output',
      writerTrust: 'trusted-tool-output',
    },
    scope: {
      workflow: 'work',
      checkpoint: 'final',
      planPath: 'ae/plans/test-plan.md',
      files: [],
    },
    worktreeFingerprint: {
      worktree: 'D:/repo',
      branch: 'main',
      head: 'abc123',
      statusSummary: '',
      degraded: false,
    },
    result: {
      status: 'passed',
      summary: '验证通过',
      blockingFindings: [],
    },
    timestamps: {
      capturedAt: '2026-05-26T00:00:00.000Z',
      writtenAt: '2026-05-26T00:00:01.000Z',
    },
    payload: { command: ['npm', 'run', 'typecheck'] },
    audit: {},
    ...overrides,
  })
}

describe('证据账本 Schema', () => {
  it('应该接受合法记录并计算稳定哈希', () => {
    const record = createRecord()
    const parsed = EvidenceRecordSchema.safeParse(record)

    expect(parsed.success).toBe(true)
    expect(verifyRecordHash(record)).toBe(true)
  })

  it('应该允许 sessionId 缺失且仅作为审计字段', () => {
    const record = createRecord({ audit: {} })
    const parsed = EvidenceRecordSchema.safeParse(record)

    expect(parsed.success).toBe(true)
    expect(record.audit.sessionId).toBeUndefined()
    expect(verifyRecordHash(record)).toBe(true)
  })

  it('应该拒绝缺少 proofKind 或 producer 的记录', () => {
    const record = createRecord()
    const withoutProofKind = {
      ...record,
      producer: { tool: record.producer.tool },
    }
    const withoutProducer = { ...record, producer: undefined }

    expect(EvidenceRecordSchema.safeParse(withoutProofKind).success).toBe(false)
    expect(EvidenceRecordSchema.safeParse(withoutProducer).success).toBe(false)
  })

  it('应该拒绝可导致 artifact 路径逃逸的证据 ID', () => {
    expect(() => createRecord({ id: '../ledger' })).toThrow()
    expect(() => createRecord({ id: 'nested/path' })).toThrow()
    expect(() => createRecord({ id: 'nested\\path' })).toThrow()
    expect(() => createRecord({ id: '..' })).toThrow()
  })

  it('应该拒绝非法信任等级', () => {
    expect(EvidenceTrustSchema.safeParse('verified').success).toBe(false)
    expect(EvidenceTrustSchema.safeParse('machine-verifiable').success).toBe(true)
  })

  it('应该通过通用 ae/evidence 路径常量生成账本目录', () => {
    expect(DOCS_AE_SUBDIRS.EVIDENCE).toBe('evidence')
    expect(docsAePath(DOCS_AE_SUBDIRS.EVIDENCE)).toBe('ae/evidence')
  })
})
