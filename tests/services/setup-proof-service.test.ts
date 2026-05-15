import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import {
  writeSetupProof,
  readSetupProof,
  isSetupCompleted,
  type SetupProof,
} from '../../src/services/setup-proof-service.js'
import { SetupProofSchema } from '../../src/schemas/setup-proof-schema.js'

describe('setup-proof-service', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `setup-proof-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  it('应该写入和读取证明文件', () => {
    const proof: SetupProof = {
      sessionId: 'session-1',
      completedAt: '2026-04-29T00:00:00Z',
      version: '1.0.0',
    }
    writeSetupProof(testDir, proof)

    const result = readSetupProof(testDir)
    expect(result).toEqual(proof)
  })

  it('证明文件应写入 .opencode/ae/setup-proof.json', () => {
    const proof: SetupProof = {
      sessionId: 'session-1',
      completedAt: '2026-04-29T00:00:00Z',
      version: '1.0.0',
    }
    writeSetupProof(testDir, proof)

    const expectedPath = join(testDir, '.opencode', 'ae', 'setup-proof.json')
    expect(readFileSync(expectedPath, 'utf8')).toBeTruthy()
  })

  it('证明文件不存在时返回 null', () => {
    const result = readSetupProof(testDir)
    expect(result).toBeNull()
  })

  it('存在合法证明时返回 true', () => {
    const proof: SetupProof = {
      sessionId: 'session-1',
      completedAt: '2026-04-29T00:00:00Z',
      version: '1.0.0',
    }
    writeSetupProof(testDir, proof)

    expect(isSetupCompleted(testDir)).toBe(true)
  })

  it('不同会话也可以复用合法证明', () => {
    const proof: SetupProof = {
      sessionId: 'session-1',
      completedAt: '2026-04-29T00:00:00Z',
      version: '1.0.0',
    }
    writeSetupProof(testDir, proof)

    expect(isSetupCompleted(testDir)).toBe(true)
  })

  it('证明文件缺失时返回 false', () => {
    expect(isSetupCompleted(testDir)).toBe(false)
  })

  it('证明文件损坏时返回 null', () => {
    const dir = join(testDir, '.opencode', 'ae')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'setup-proof.json'), 'invalid json', 'utf8')

    const result = readSetupProof(testDir)
    expect(result).toBeNull()
  })

  it('JSON 合法但缺少必需字段时返回 null', () => {
    const dir = join(testDir, '.opencode', 'ae')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'setup-proof.json'), '{"version": "1.0.0"}', 'utf8')

    const result = readSetupProof(testDir)
    expect(result).toBeNull()
  })

  it('空文件时返回 null', () => {
    const dir = join(testDir, '.opencode', 'ae')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'setup-proof.json'), '', 'utf8')

    const result = readSetupProof(testDir)
    expect(result).toBeNull()
  })

  it('SetupProofSchema 应拒绝空 sessionId', () => {
    const result = SetupProofSchema.safeParse({
      sessionId: '',
      completedAt: '2026-04-29T00:00:00Z',
      version: '1.0.0',
    })
    expect(result.success).toBe(false)
  })
})
