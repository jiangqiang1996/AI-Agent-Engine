import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { Effect } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showToast } from '../../src/services/toast-holder.js'

vi.mock('../../src/services/toast-holder.js', () => ({
  showToast: vi.fn(),
}))

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-figma-assets-tool-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
})

async function callTool(args: Record<string, unknown>) {
  const { aeFigmaAssetsTool: tool } = await import('../../src/tools/ae-figma-assets.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string | { output: string }>
  }
  const result = await definition.execute(args, {
    metadata: vi.fn(),
    ask: () => Effect.void,
    worktree: workspace,
    directory: workspace,
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
  return typeof result === 'string' ? result : result.output
}

describe('ae-figma-assets 工具', () => {
  it('应该收集手动导出素材', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    const output = await callTool({ mode: 'collect', manualSourceDir: 'manual' })

    expect(output).toContain('素材数量：1')
  })

  it('应该返回缺少 API 参数的友好错误', async () => {
    const output = await callTool({ mode: 'api', fileKey: 'abc', token: 'secret' })

    expect(output).toContain('Figma 素材处理失败')
    expect(output).toContain('nodeId')
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith(output)
  })

  it('应该捕获非法参数校验错误', async () => {
    const output = await callTool({ mode: 'bad' })

    expect(output).toContain('Figma 素材处理失败')
    expect(showToast).toHaveBeenCalledWith(output)
  })
})
