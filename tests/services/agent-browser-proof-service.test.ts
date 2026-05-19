import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, it, beforeEach, afterEach } from 'vitest'

import {
  writeAgentBrowserProof,
  readAgentBrowserProof,
  isAgentBrowserProofCompleted,
} from '../../src/services/agent-browser-proof-service.js'
import { AgentBrowserProofSchema, type AgentBrowserProof } from '../../src/schemas/agent-browser-proof-schema.js'

describe('agent-browser-proof-service', () => {
  let testDir: string

  beforeEach(() => {
    testDir = join(tmpdir(), `agent-browser-proof-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  function createProof(): AgentBrowserProof {
    return {
      sessionId: 'session-1',
      completedAt: '2026-04-29T00:00:00Z',
      schemaVersion: 1,
      worktreeFingerprint: 'fingerprint-1',
      agentBrowserVersion: 'agent-browser 1.0.0',
      validationResults: [{
        command: 'agent-browser --version',
        exitCode: 0,
        outputHash: 'hash-1',
        executedAt: '2026-04-29T00:00:00Z',
      }],
      proofKind: 'agent-browser-environment',
    }
  }

  it('应该写入和读取 agent-browser 环境证明文件', () => {
    const proof = createProof()
    writeAgentBrowserProof(testDir, proof)

    const result = readAgentBrowserProof(testDir)
    expect(result).toEqual(proof)
  })

  it('证明文件应写入 ae/agent-browser-proof.json', () => {
    writeAgentBrowserProof(testDir, createProof())

    const expectedPath = join(testDir, 'ae', 'agent-browser-proof.json')
    expect(readFileSync(expectedPath, 'utf8')).toBeTruthy()
  })

  it('存在合法证明且版本复验一致时返回 true', () => {
    writeAgentBrowserProof(testDir, createProof())

    expect(isAgentBrowserProofCompleted(testDir, () => 'agent-browser 1.0.0')).toBe(true)
  })

  it('版本复验不一致时返回 false', () => {
    writeAgentBrowserProof(testDir, createProof())

    expect(isAgentBrowserProofCompleted(testDir, () => 'agent-browser 2.0.0')).toBe(false)
  })

  it('提供当前工作区指纹且与证明不一致时返回 false', () => {
    writeAgentBrowserProof(testDir, createProof())

    expect(isAgentBrowserProofCompleted(testDir, () => 'agent-browser 1.0.0', 'fingerprint-2')).toBe(false)
  })

  it('提供当前工作区指纹且与证明一致时返回 true', () => {
    writeAgentBrowserProof(testDir, createProof())

    expect(isAgentBrowserProofCompleted(testDir, () => 'agent-browser 1.0.0', 'fingerprint-1')).toBe(true)
  })

  it('证明文件损坏时返回 null', () => {
    const dir = join(testDir, 'ae')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-browser-proof.json'), 'invalid json', 'utf8')

    expect(readAgentBrowserProof(testDir)).toBeNull()
  })

  it('AgentBrowserProofSchema 应拒绝缺少验证结果的证明', () => {
    const result = AgentBrowserProofSchema.safeParse({
      ...createProof(),
      validationResults: [],
    })
    expect(result.success).toBe(false)
  })

  it('AgentBrowserProofSchema 应拒绝缺少新证明必填字段的证明', () => {
    const requiredFields = ['schemaVersion', 'worktreeFingerprint', 'agentBrowserVersion', 'proofKind'] as const

    for (const field of requiredFields) {
      const proof = { ...createProof() }
      delete proof[field]

      expect(AgentBrowserProofSchema.safeParse(proof).success).toBe(false)
    }
  })
})
