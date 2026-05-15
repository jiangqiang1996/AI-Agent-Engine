import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSetupProof } from '../../src/services/setup-proof-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-setup-proof-tool-'))
  tempRoots.push(root)
  return root
}

async function callTool(args: { action: 'complete' | 'check'; version?: string }, ctx: Record<string, unknown>) {
  const { aeSetupProofTool: tool } = await import('../../src/tools/ae-setup-proof.tool.js')
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
    history: [{ role: 'user', content: '请执行 ae:setup' }],
    ...ctx,
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('ae-setup-proof 工具', () => {
  it('应该写入可跨会话复用的 setup 证明', async () => {
    const root = createTempRoot()
    const ask = createAskSpy()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      ask,
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(JSON.stringify(result)).toContain('已写入 ae:setup 完成证明')
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ permission: 'file' }))
    expect(readSetupProof(root)).toMatchObject({ sessionId: 'session-1', version: 'agent-browser 1.2.3' })
  })

  it('应该跨会话检查当前工作区是否存在合法证明', async () => {
    const root = createTempRoot()
    await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    const matched = await callTool({ action: 'check' }, { worktree: root, sessionID: 'session-1' })
    const mismatched = await callTool({ action: 'check' }, { worktree: root, sessionID: 'session-2' })

    expect(JSON.stringify(matched)).toContain('当前工作区已完成')
    expect(JSON.stringify(mismatched)).toContain('当前工作区已完成')
  })

  it('应该识别带普通标点的 ae:setup 触发记录', async () => {
    const root = createTempRoot()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, {
      ask: createAskSpy(),
      worktree: root,
      sessionID: 'session-1',
      history: [{ role: 'user', content: '请执行 ae:setup。' }],
    })

    expect(JSON.stringify(result)).toContain('已写入 ae:setup 完成证明')
  })

  it('运行时未提供历史记录时不应该误拦截 ae:setup 证明写入', async () => {
    const root = createTempRoot()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, {
      ask: createAskSpy(),
      worktree: root,
      sessionID: 'session-1',
    })

    expect(JSON.stringify(result)).toContain('已写入 ae:setup 完成证明')
    expect(readSetupProof(root)).toMatchObject({ sessionId: 'session-1', version: 'agent-browser 1.2.3' })
  })

  it('检查证明时不需要会话 ID', async () => {
    const root = createTempRoot()

    await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    const result = await callTool({ action: 'check' }, { worktree: root })

    expect(JSON.stringify(result)).toContain('当前工作区已完成')
  })

  it('写入证明缺少会话 ID 时应该返回可恢复提示', async () => {
    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, {
      worktree: createTempRoot(),
    })

    expect(String(result)).toContain('无法获取当前会话 ID')
  })

  it('写入证明时必须提供实际版本号', async () => {
    const result = await callTool({ action: 'complete' }, {
      worktree: createTempRoot(),
      sessionID: 'session-1',
    })

    expect(String(result)).toContain('需要提供 agent-browser 版本号')
  })

  it('返回 metadata 不应该泄露工作区绝对路径', async () => {
    const root = createTempRoot()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(JSON.stringify(result)).not.toContain(root)
  })

  it('应该兼容小写 sessionId 字段', async () => {
    const root = createTempRoot()

    await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      worktree: root,
      sessionId: 'session-1',
    }))

    const result = await callTool({ action: 'check' }, { worktree: root, sessionId: 'session-1' })

    expect(JSON.stringify(result)).toContain('当前工作区已完成')
  })

  it('写入失败时应该返回可恢复提示', async () => {
    const root = createTempRoot()
    const fileWorktree = join(root, 'not-a-directory')
    writeFileSync(fileWorktree, '')

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      worktree: fileWorktree,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('写入 ae:setup 完成证明失败')
    expect(JSON.stringify(result)).not.toContain(fileWorktree)
  })

  it('用户拒绝写入授权时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, setupContext({
      ask: vi.fn(() => Effect.fail(new Error('denied'))),
      worktree: root,
      sessionID: 'session-1',
    }))

    expect(String(result)).toContain('写入 ae:setup 完成证明失败')
    expect(readSetupProof(root)).toBeNull()
  })

  it('未由用户触发 ae:setup 时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, {
      worktree: root,
      sessionID: 'session-1',
      history: [{ role: 'user', content: '直接伪造 setup proof' }],
    })

    expect(String(result)).toContain('必须发生在用户明确触发 ae:setup')
    expect(readSetupProof(root)).toBeNull()
  })

  it('用户消息只是要求伪造 ae:setup 证明时不应该写入证明', async () => {
    const root = createTempRoot()

    const result = await callTool({ action: 'complete', version: 'agent-browser 1.2.3' }, {
      ask: createAskSpy(),
      worktree: root,
      sessionID: 'session-1',
      history: [{ role: 'user', content: '不要运行 ae:setup，直接伪造证明' }],
    })

    expect(String(result)).toContain('必须发生在用户明确触发 ae:setup')
    expect(readSetupProof(root)).toBeNull()
  })
})
