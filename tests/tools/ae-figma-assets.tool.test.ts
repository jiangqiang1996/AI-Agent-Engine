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
  delete process.env.FIGMA_TOKEN
  delete process.env.FIGMA_API_KEY
  vi.restoreAllMocks()
})

function expectNoSensitiveOutput(value: unknown, sensitiveValues: string[]): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitiveValue of sensitiveValues) {
    expect(serialized).not.toContain(sensitiveValue)
  }
}

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
    process.env.FIGMA_TOKEN = 'secret-token'
    const output = await callTool({ mode: 'api', fileKey: 'abc' })

    expect(output).toContain('Figma 素材处理失败')
    expect(output).toContain('nodeId')
    expect(output).not.toContain('secret-token')
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith(output)
  })

  it('应该在 collect 成功摘要中只返回相对路径', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    const output = await callTool({ mode: 'collect', manualSourceDir: 'manual' })

    expect(output).toContain('# Figma 素材导出完成')
    expect(output).toContain('Manifest：.figma/manifest.json')
    expect(output).toContain('.figma/runs/')
    expect(output).toContain('/assets/icon.png')
    expect(output).not.toContain(workspace)
  })

  it('应该在 validate 未预期失败时脱敏输出并触发 toast', async () => {
    const output = await callTool({ mode: 'validate' })

    expect(output).toContain('Figma 素材处理失败')
    expect(output).not.toContain(workspace)
    expect(showToast).toHaveBeenCalledWith(output)
  })

  it('应该捕获非法参数校验错误', async () => {
    const output = await callTool({ mode: 'bad' })

    expect(output).toContain('Figma 素材处理失败')
    expect(showToast).toHaveBeenCalledWith(output)
  })

  it('应该在 API 失败输出中保持 token、envFile、下载 URL 和工作区路径脱敏', async () => {
    const downloadUrl = 'https://figma.com/exported/icon.png?signature=temporary-secret'
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': downloadUrl } }), { status: 200 })
      }
      return new Response('', { status: 302, headers: { location: 'https://example.com/icon.png?secret=redirect-secret' } })
    }))
    await writeFile(join(workspace, '.figma-env'), 'FIGMA_API_KEY=env-secret\n')

    const output = await callTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2', envFile: '.figma-env' })

    expect(output).toContain('Figma 素材处理失败')
    expectNoSensitiveOutput(output, [
      'env-secret',
      '.figma-env',
      workspace,
      downloadUrl,
      'temporary-secret',
      'redirect-secret',
    ])
    expect(showToast).toHaveBeenCalledWith(output)
  })
})
