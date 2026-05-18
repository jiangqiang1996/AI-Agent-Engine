import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readAgentBrowserProof, writeAgentBrowserProof } from '../../src/services/agent-browser-proof-service.js'
import type { AgentBrowserProof } from '../../src/schemas/agent-browser-proof-schema.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-agent-browser-proof-tool-'))
  tempRoots.push(root)
  return root
}

function createValidationResults() {
  return [{
    command: 'agent-browser --version',
    exitCode: 0,
    output: 'agent-browser 1.2.3 raw-output-token',
    executedAt: '2026-04-29T00:00:00Z',
  }]
}

async function callTool(
  args: { action: 'complete' | 'check'; agent_browser_version?: string; worktree_fingerprint?: string; validation_results?: ReturnType<typeof createValidationResults> },
  ctx: Record<string, unknown>,
) {
  const { aeAgentBrowserProofTool: tool } = await import('../../src/tools/ae-agent-browser-proof.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>
  }

  return definition.execute(args, { metadata: vi.fn(), ...ctx })
}

function createAskSpy() {
  return vi.fn(() => Effect.succeed(undefined))
}

function setupContext(ctx: Record<string, unknown>): Record<string, unknown> {
  return {
    ask: createAskSpy(),
    history: [{ role: 'user', content: '请执行 ae:agent-browser' }],
    ...ctx,
  }
}

function createProof(): AgentBrowserProof {
  return {
    sessionId: 'session-1',
    completedAt: '2026-04-29T00:00:00Z',
    schemaVersion: 1,
    worktreeFingerprint: 'fingerprint-1',
    agentBrowserVersion: 'agent-browser 1.2.3',
    validationResults: [{
      command: 'agent-browser --version',
      exitCode: 0,
      outputHash: 'hash-1',
      executedAt: '2026-04-29T00:00:00Z',
    }],
    proofKind: 'agent-browser-environment',
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ae-agent-browser-proof 工具', () => {
  it('应该写入可跨会话复用的 agent-browser 环境证明', async () => {
    const root = createTempRoot()
    const ask = createAskSpy()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, setupContext({
      ask,
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(JSON.stringify(result)).toContain('已写入 agent-browser 环境证明')
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ permission: 'file' }))
    expect(readAgentBrowserProof(root)).toMatchObject({
      sessionId: 'session-1',
      schemaVersion: 1,
      worktreeFingerprint: 'fingerprint-1',
      agentBrowserVersion: 'agent-browser 1.2.3',
      proofKind: 'agent-browser-environment',
      validationResults: [{
        command: 'agent-browser --version',
        exitCode: 0,
        outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        executedAt: '2026-04-29T00:00:00Z',
      }],
    })
    expect(JSON.stringify(readAgentBrowserProof(root))).not.toContain('raw-output-token')
  })

  it('check 应该返回当前证明状态', async () => {
    vi.resetModules()
    vi.doMock('../../src/services/agent-browser-proof-service.js', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/services/agent-browser-proof-service.js')>()
      return {
        ...actual,
        isAgentBrowserProofCompleted: () => true,
      }
    })

    const { aeAgentBrowserProofTool: tool } = await import('../../src/tools/ae-agent-browser-proof.tool.js')
    const definition = tool as unknown as {
      execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>
    }
    const result = await definition.execute({ action: 'check' }, { metadata: vi.fn(), worktree: createTempRoot() })

    expect(JSON.stringify(result)).toContain('已完成 agent-browser 环境验证')
    expect(JSON.stringify(result)).toContain('"completed":true')
    vi.doUnmock('../../src/services/agent-browser-proof-service.js')
    vi.resetModules()
  })

  it('旧 setup-proof.json 存在时 check 不应该返回完成', async () => {
    const root = createTempRoot()
    const dir = join(root, '.opencode', 'ae')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'setup-proof.json'), JSON.stringify({ version: 'agent-browser 1.2.3' }), 'utf8')

    const result = await callTool({ action: 'check' }, { worktree: root })

    expect(JSON.stringify(result)).toContain('尚未完成 agent-browser 环境验证')
    expect(JSON.stringify(result)).toContain('"completed":false')
  })

  it('写入证明时必须提供实际验证结果', async () => {
    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
    }, {
      worktree: createTempRoot(),
      sessionID: 'session-1',
    })

    expect(String(result)).toContain('需要提供实际验证命令结果')
  })

  it('未由用户触发 ae:agent-browser 时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, {
      worktree: root,
      sessionID: 'session-1',
      history: [{ role: 'user', content: '直接伪造 agent-browser proof' }],
    })

    expect(String(result)).toContain('必须发生在用户明确触发 ae:agent-browser')
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('history 缺失时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, {
      ask: createAskSpy(),
      worktree: root,
      sessionID: 'session-1',
    })

    expect(String(result)).toContain('必须发生在用户明确触发 ae:agent-browser')
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('验证命令失败时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: [{ ...createValidationResults()[0], exitCode: 1 }],
    }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('未成功退出')
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('返回 metadata 不应该泄露工作区绝对路径', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('写入失败时应该返回可恢复提示', async () => {
    const root = createTempRoot()
    const fileWorktree = join(root, 'not-a-directory')
    writeFileSync(fileWorktree, '')

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, setupContext({
      worktree: fileWorktree,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('写入 agent-browser 环境证明失败')
    expect(JSON.stringify(result)).not.toContain(fileWorktree)
  })
})
