import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readAgentBrowserProof, writeAgentBrowserProof } from '../../src/services/agent-browser-proof-service.js'
import type { AgentBrowserProof } from '../../src/schemas/agent-browser-proof-schema.js'

const tempRoots: string[] = []
const runValidationCommands = vi.fn(() => createValidationResults())

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-agent-browser-proof-tool-'))
  tempRoots.push(root)
  return root
}

function createValidationResults() {
  return [
    {
      command: 'agent-browser --version',
      exitCode: 0,
      output: 'agent-browser 1.2.3',
      executedAt: '2026-04-29T00:00:00Z',
    },
    {
      command: 'agent-browser --help',
      exitCode: 0,
      output: 'Usage: agent-browser raw-output-token',
      executedAt: '2026-04-29T00:00:01Z',
    },
    {
      command: 'agent-browser skills get core --full',
      exitCode: 0,
      output: 'core skill content',
      executedAt: '2026-04-29T00:00:02Z',
    },
  ]
}

async function callTool(
  args: { action: 'complete' | 'check'; agent_browser_version?: string; worktree_fingerprint?: string; validation_results?: ReturnType<typeof createValidationResults> },
  ctx: Record<string, unknown>,
) {
  vi.resetModules()
  vi.doMock('../../src/services/agent-browser-proof-service.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/services/agent-browser-proof-service.js')>()
    return {
      ...actual,
      runAgentBrowserValidationCommands: runValidationCommands,
    }
  })
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
    }, {
      command: 'agent-browser --help',
      exitCode: 0,
      outputHash: 'hash-2',
      executedAt: '2026-04-29T00:00:01Z',
    }, {
      command: 'agent-browser skills get core --full',
      exitCode: 0,
      outputHash: 'hash-3',
      executedAt: '2026-04-29T00:00:02Z',
    }],
    proofKind: 'agent-browser-environment',
  }
}

afterEach(() => {
  runValidationCommands.mockReset()
  runValidationCommands.mockImplementation(() => createValidationResults())
  vi.doUnmock('../../src/services/agent-browser-proof-service.js')
  vi.resetModules()
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
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      permission: 'file',
      patterns: ['ae/agent-browser-proof.json'],
      metadata: expect.objectContaining({ target: 'ae/agent-browser-proof.json' }),
    }))
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
      }, {
        command: 'agent-browser --help',
        exitCode: 0,
        outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        executedAt: '2026-04-29T00:00:01Z',
      }, {
        command: 'agent-browser skills get core --full',
        exitCode: 0,
        outputHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        executedAt: '2026-04-29T00:00:02Z',
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
        isAgentBrowserProofCompleted: vi.fn(() => true),
      }
    })

    const { aeAgentBrowserProofTool: tool } = await import('../../src/tools/ae-agent-browser-proof.tool.js')
    const definition = tool as unknown as {
      execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<unknown>
    }
    const service = await import('../../src/services/agent-browser-proof-service.js')
    const result = await definition.execute({ action: 'check', worktree_fingerprint: 'fingerprint-1' }, { metadata: vi.fn(), worktree: createTempRoot() })

    expect(JSON.stringify(result)).toContain('已完成 agent-browser 环境验证')
    expect(JSON.stringify(result)).toContain('"completed":true')
    expect(service.isAgentBrowserProofCompleted).toHaveBeenCalledWith(expect.any(String), undefined, 'fingerprint-1')
    vi.doUnmock('../../src/services/agent-browser-proof-service.js')
    vi.resetModules()
  })

  it('check 应该在证明缺失时返回未完成状态', async () => {
    const result = await callTool({ action: 'check' }, { metadata: vi.fn(), worktree: createTempRoot() })

    expect(JSON.stringify(result)).toContain('尚未完成 agent-browser 环境验证')
    expect(JSON.stringify(result)).toContain('"completed":false')
  })

  it('写入证明时不应该采信入参伪造的验证结果', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: [{
        command: 'agent-browser --version',
        exitCode: 0,
        output: 'forged-output-token',
        executedAt: '2026-04-29T00:00:00Z',
      }],
    }, {
      worktree: root,
      ask: createAskSpy(),
      history: [{ role: 'user', content: '请执行 ae:agent-browser' }],
      sessionID: 'session-1',
    })

    expect(JSON.stringify(result)).toContain('已写入 agent-browser 环境证明')
    expect(JSON.stringify(readAgentBrowserProof(root))).not.toContain('forged-output-token')
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
    expect(runValidationCommands).not.toHaveBeenCalled()
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
    expect(runValidationCommands).not.toHaveBeenCalled()
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('验证命令失败时不应该写入证明', async () => {
    const root = createTempRoot()
    runValidationCommands.mockReturnValue([{ ...createValidationResults()[0], exitCode: 1 }])

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
    }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('未成功退出')
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('缺少必需验证命令时不应该写入证明', async () => {
    const root = createTempRoot()
    runValidationCommands.mockReturnValue(createValidationResults().filter((result) => result.command !== 'agent-browser --help'))

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2.3',
      worktree_fingerprint: 'fingerprint-1',
    }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('必须实际运行验证命令 agent-browser --help')
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('版本号不来自 version 输出时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 9.9.9',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('版本号必须来自')
    expect(readAgentBrowserProof(root)).toBeNull()
  })

  it('版本号只匹配 version 输出前缀时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({
      action: 'complete',
      agent_browser_version: 'agent-browser 1.2',
      worktree_fingerprint: 'fingerprint-1',
      validation_results: createValidationResults(),
    }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('版本号必须来自')
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
