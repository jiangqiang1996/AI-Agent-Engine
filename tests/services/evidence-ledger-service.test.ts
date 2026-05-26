import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  completeEvidenceRecord,
  getEvidenceLedgerPaths,
  hashEvidencePayload,
  readEvidenceLedger,
  rebuildEvidenceIndex,
  verifyRecordHash,
  writeEvidenceRecord,
} from '../../src/services/evidence-ledger-service.js'
import type { EvidenceRecord } from '../../src/schemas/evidence-ledger-schema.js'

const tempRoots: string[] = []
const symlinkUnsupported = Symbol('symlinkUnsupported')

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-evidence-'))
  tempRoots.push(root)
  return root
}

function createSymlinkOrSkip(target: string, path: string, type: 'dir' | 'file'): typeof symlinkUnsupported | undefined {
  try {
    symlinkSync(target, path, type)
    return undefined
  } catch (error) {
    const code = (error as { code?: unknown }).code
    if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES')) {
      return symlinkUnsupported
    }
    throw error
  }
}

function createRecordInput(id = 'validation-1'): Parameters<typeof writeEvidenceRecord>[1] {
  return {
    id,
    evidenceKind: 'validation',
    producer: {
      tool: 'ae-validation-proof',
      proofKind: 'ae-validation-proof',
      version: '1',
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
      intent: 'typecheck',
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
      exitCode: 0,
      blockingFindings: [],
    },
    timestamps: {
      capturedAt: '2026-05-26T00:00:00.000Z',
      writtenAt: '2026-05-26T00:00:01.000Z',
    },
    payload: {
      command: ['npm', 'run', 'typecheck'],
    },
    audit: {},
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('证据账本服务', () => {
  it('应该写入 artifact、追加 ledger 并重建 index', () => {
    const root = createRoot()
    const result = writeEvidenceRecord(root, createRecordInput())
    const paths = getEvidenceLedgerPaths(root)

    expect(result.artifactPath).toBe('ae/evidence/artifacts/validation/validation-1.json')
    expect(existsSync(join(root, result.artifactPath))).toBe(true)
    expect(existsSync(paths.ledger)).toBe(true)
    expect(existsSync(paths.index)).toBe(true)

    const readResult = readEvidenceLedger(root)
    expect(readResult.state).toBe('passed')
    expect(readResult.diagnostics).toEqual([])
    expect(readResult.records.map((record) => record.id)).toEqual(['validation-1'])
  })

  it('应该在 index 缺失时从 ledger 重建', () => {
    const root = createRoot()
    writeEvidenceRecord(root, createRecordInput())
    rmSync(getEvidenceLedgerPaths(root).index, { force: true })

    const index = rebuildEvidenceIndex(root)

    expect(index.records).toHaveLength(1)
    expect(existsSync(getEvidenceLedgerPaths(root).index)).toBe(true)
  })

  it('应该在 ledger 不存在时返回 missing', () => {
    const root = createRoot()
    const result = readEvidenceLedger(root)

    expect(result.state).toBe('missing')
    expect(result.records).toEqual([])
    expect(result.diagnostics).toContain('ledger.jsonl 不存在。')
  })

  it('应该识别 artifact 篡改并返回不可复验诊断', () => {
    const root = createRoot()
    const result = writeEvidenceRecord(root, createRecordInput())
    const artifactPath = join(root, result.artifactPath)
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as EvidenceRecord
    const tamperedArtifact = { ...artifact, result: { ...artifact.result, status: 'failed' } }
    writeFileSync(artifactPath, `${JSON.stringify(tamperedArtifact, null, 2)}\n`, 'utf8')

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('artifactHash 不匹配：validation-1')
  })

  it('应该识别 JSONL 损坏和链断裂', () => {
    const root = createRoot()
    writeEvidenceRecord(root, createRecordInput('validation-1'))
    const second = writeEvidenceRecord(root, createRecordInput('validation-2'))
    const paths = getEvidenceLedgerPaths(root)
    const lines = readFileSync(paths.ledger, 'utf8').trim().split('\n')
    const secondEvent = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>
    secondEvent.previousRecordHash = 'broken'
    writeFileSync(paths.ledger, `${lines[0]}\n${JSON.stringify(secondEvent)}\nnot-json\n`, 'utf8')

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('ledger 链断裂：validation-2')
    expect(readResult.diagnostics).toContain('ledger 第 3 行不是合法事件。')
  })

  it('应该识别 artifact 内部 previousRecordHash 与 ledger 事件不一致', () => {
    const root = createRoot()
    writeEvidenceRecord(root, createRecordInput('validation-1'))
    const second = writeEvidenceRecord(root, createRecordInput('validation-2'))
    const paths = getEvidenceLedgerPaths(root)
    const artifactPath = join(root, second.artifactPath)
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as EvidenceRecord
    const tamperedArtifact = completeEvidenceRecord({
      ...artifact,
      hashes: { previousRecordHash: 'different-previous-hash' },
    })
    writeFileSync(artifactPath, `${JSON.stringify(tamperedArtifact, null, 2)}\n`, 'utf8')
    const lines = readFileSync(paths.ledger, 'utf8').trim().split('\n')
    const secondEvent = {
      ...second.event,
      artifactHash: hashEvidencePayload(readFileSync(artifactPath, 'utf8')),
      recordHash: tamperedArtifact.hashes.recordHash,
    }
    writeFileSync(paths.ledger, `${lines[0]}\n${JSON.stringify(secondEvent)}\n`, 'utf8')

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('previousRecordHash 不匹配：validation-2')
  })

  it('应该识别 recordHash 不匹配', () => {
    const root = createRoot()
    const result = writeEvidenceRecord(root, createRecordInput())
    const paths = getEvidenceLedgerPaths(root)
    const artifactPath = join(root, result.artifactPath)
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as EvidenceRecord
    artifact.hashes.recordHash = 'broken'
    writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
    const artifactHash = hashEvidencePayload(readFileSync(artifactPath, 'utf8'))
    const event = { ...result.event, artifactHash }
    writeFileSync(paths.ledger, `${JSON.stringify(event)}\n`, 'utf8')

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('recordHash 不匹配：validation-1')
  })

  it('应该拒绝 artifact 路径跨出 artifacts 域', () => {
    const root = createRoot()
    const result = writeEvidenceRecord(root, createRecordInput())
    const paths = getEvidenceLedgerPaths(root)
    const artifactPath = join(root, 'ae', 'evidence2', 'validation-1.json')
    mkdirSync(join(root, 'ae', 'evidence2'), { recursive: true })
    writeFileSync(artifactPath, `${JSON.stringify(result.record, null, 2)}\n`, 'utf8')
    const event = {
      ...result.event,
      artifactPath: 'ae/evidence2/validation-1.json',
      artifactHash: hashEvidencePayload(readFileSync(artifactPath, 'utf8')),
    }
    writeFileSync(paths.ledger, `${JSON.stringify(event)}\n`, 'utf8')
    rmSync(join(root, result.artifactPath), { force: true })

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('artifact 路径越界或跨域：validation-1')
  })

  it('应该拒绝 artifact 路径通过父目录片段跨 evidence kind', () => {
    const root = createRoot()
    const result = writeEvidenceRecord(root, createRecordInput())
    const paths = getEvidenceLedgerPaths(root)
    const reviewDir = join(root, 'ae', 'evidence', 'artifacts', 'review')
    mkdirSync(reviewDir, { recursive: true })
    writeFileSync(join(reviewDir, 'validation-1.json'), `${JSON.stringify(result.record, null, 2)}\n`, 'utf8')
    const event = {
      ...result.event,
      artifactPath: 'ae/evidence/artifacts/validation/../review/validation-1.json',
      artifactHash: hashEvidencePayload(readFileSync(join(reviewDir, 'validation-1.json'), 'utf8')),
    }
    writeFileSync(paths.ledger, `${JSON.stringify(event)}\n`, 'utf8')
    rmSync(join(root, result.artifactPath), { force: true })

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('artifact 路径越界或跨域：validation-1')
  })

  it('应该拒绝可导致 artifact 路径逃逸的证据 ID', () => {
    const root = createRoot()

    expect(() => writeEvidenceRecord(root, createRecordInput('../ledger'))).toThrow()
    expect(() => writeEvidenceRecord(root, createRecordInput('nested/path'))).toThrow()
    expect(() => writeEvidenceRecord(root, createRecordInput('nested\\path'))).toThrow()
  })

  it('应该拒绝通过符号链接写入或读取 artifact', () => {
    const root = createRoot()
    const outside = createRoot()
    mkdirSync(join(root, 'ae', 'evidence', 'artifacts'), { recursive: true })
    const dirSymlink = createSymlinkOrSkip(outside, join(root, 'ae', 'evidence', 'artifacts', 'validation'), 'dir')
    if (dirSymlink === symlinkUnsupported) {
      return
    }

    expect(() => writeEvidenceRecord(root, createRecordInput())).toThrow('artifact 目录不能包含符号链接')

    rmSync(join(root, 'ae', 'evidence', 'artifacts', 'validation'), { force: true })
    const result = writeEvidenceRecord(root, createRecordInput())
    const paths = getEvidenceLedgerPaths(root)
    const artifact = readFileSync(join(root, result.artifactPath), 'utf8')
    rmSync(join(root, result.artifactPath), { force: true })
    writeFileSync(join(outside, 'validation-1.json'), artifact, 'utf8')
    const fileSymlink = createSymlinkOrSkip(join(outside, 'validation-1.json'), join(root, result.artifactPath), 'file')
    if (fileSymlink === symlinkUnsupported) {
      return
    }

    const readResult = readEvidenceLedger(root)

    expect(existsSync(paths.ledger)).toBe(true)
    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('artifact 路径越界或跨域：validation-1')
  })

  it('应该在创建 evidence 目录前拒绝上层符号链接', () => {
    const root = createRoot()
    const outside = createRoot()
    mkdirSync(join(root, 'ae'), { recursive: true })
    const symlink = createSymlinkOrSkip(outside, join(root, 'ae', 'evidence'), 'dir')
    if (symlink === symlinkUnsupported) {
      return
    }

    expect(() => writeEvidenceRecord(root, createRecordInput())).toThrow('evidence 根目录不能包含符号链接')
    expect(existsSync(join(outside, 'artifacts'))).toBe(false)
  })

  it('应该拒绝通过符号链接 ledger 文件读写仓库外内容', () => {
    const root = createRoot()
    const outside = createRoot()
    mkdirSync(join(root, 'ae', 'evidence'), { recursive: true })
    const outsideLedger = join(outside, 'ledger.jsonl')
    writeFileSync(outsideLedger, 'outside-content\n', 'utf8')
    const symlink = createSymlinkOrSkip(outsideLedger, join(root, 'ae', 'evidence', 'ledger.jsonl'), 'file')
    if (symlink === symlinkUnsupported) {
      return
    }

    expect(readEvidenceLedger(root)).toEqual({
      records: [],
      diagnostics: ['ledger 文件不能包含符号链接：ae/evidence/ledger.jsonl'],
      state: 'unverifiable',
    })
    expect(() => writeEvidenceRecord(root, createRecordInput())).toThrow('ledger 文件不能包含符号链接')
    expect(readFileSync(outsideLedger, 'utf8')).toBe('outside-content\n')
  })

  it('应该拒绝通过符号链接 index 文件写入仓库外内容', () => {
    const root = createRoot()
    const outside = createRoot()
    writeEvidenceRecord(root, createRecordInput())
    const outsideIndex = join(outside, 'index.json')
    writeFileSync(outsideIndex, 'outside-index\n', 'utf8')
    rmSync(join(root, 'ae', 'evidence', 'index.json'), { force: true })
    const symlink = createSymlinkOrSkip(outsideIndex, join(root, 'ae', 'evidence', 'index.json'), 'file')
    if (symlink === symlinkUnsupported) {
      return
    }

    expect(() => rebuildEvidenceIndex(root)).toThrow('index 文件不能包含符号链接')
    expect(() => writeEvidenceRecord(root, createRecordInput('validation-2'))).toThrow('index 文件不能包含符号链接')
    expect(readFileSync(outsideIndex, 'utf8')).toBe('outside-index\n')
  })

  it('应该在追加写入时忽略外部传入的 previousRecordHash', () => {
    const root = createRoot()
    const first = writeEvidenceRecord(root, createRecordInput('validation-1'))
    const second = writeEvidenceRecord(root, {
      ...createRecordInput('validation-2'),
      hashes: { previousRecordHash: 'external-broken-hash' },
    })

    const readResult = readEvidenceLedger(root)

    expect(second.record.hashes.previousRecordHash).toBe(first.record.hashes.recordHash)
    expect(readResult.state).toBe('passed')
    expect(readResult.records.map((record) => record.id)).toEqual(['validation-1', 'validation-2'])
  })

  it('应该识别孤儿 artifact', () => {
    const root = createRoot()
    writeEvidenceRecord(root, createRecordInput())
    const orphanDir = join(root, 'ae', 'evidence', 'artifacts', 'review')
    mkdirSync(orphanDir, { recursive: true })
    writeFileSync(join(orphanDir, 'orphan.json'), '{}\n', 'utf8')

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('孤儿 artifact：ae/evidence/artifacts/review/orphan.json')
  })

  it('应该拒绝扫描符号链接 artifact 根目录', () => {
    const root = createRoot()
    const outside = createRoot()
    writeEvidenceRecord(root, createRecordInput())
    rmSync(join(root, 'ae', 'evidence', 'artifacts'), { recursive: true, force: true })
    writeFileSync(join(outside, 'outside.json'), '{}\n', 'utf8')
    const symlink = createSymlinkOrSkip(outside, join(root, 'ae', 'evidence', 'artifacts'), 'dir')
    if (symlink === symlinkUnsupported) {
      return
    }

    const readResult = readEvidenceLedger(root)

    expect(readResult.state).toBe('unverifiable')
    expect(readResult.diagnostics).toContain('artifact 路径越界或跨域：validation-1')
    expect(readResult.diagnostics).toContain('artifact 目录不能包含符号链接：ae/evidence/artifacts')
    expect(readResult.diagnostics).not.toContain('孤儿 artifact：ae/evidence/artifacts/outside.json')
  })

  it('应该计算稳定 payload 哈希并校验 recordHash 不匹配', () => {
    const left = hashEvidencePayload({ b: 2, a: 1 })
    const right = hashEvidencePayload({ a: 1, b: 2 })
    const record = completeEvidenceRecord(createRecordInput())

    expect(left).toBe(right)
    expect(verifyRecordHash(record)).toBe(true)
    expect(verifyRecordHash({ ...record, hashes: { ...record.hashes, recordHash: 'bad' } })).toBe(false)
  })
})
