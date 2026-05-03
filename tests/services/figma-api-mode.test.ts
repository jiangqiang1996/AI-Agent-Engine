import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runApiMode } from '../../src/services/figma-api-mode.js'
import { FigmaAssetError } from '../../src/services/figma-result-formatter.js'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-api-mode-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
  delete process.env.FIGMA_TOKEN
  delete process.env.FIGMA_OAUTH_TOKEN
  delete process.env.FIGMA_API_KEY
})

describe('figma-api-mode', () => {
  it('应该在缺少 fileKey 时抛出 missing_file_key', async () => {
    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    await expect(runApiMode(
      { mode: 'api', source: '', nodeId: '1:2' },
      { fileKey: undefined, nodeId: undefined, redactedSource: '' },
      workspace,
      'run-1',
      runAssetsDir,
    )).rejects.toThrow(FigmaAssetError)

    try {
      await runApiMode(
        { mode: 'api', source: '', nodeId: '1:2' },
        { fileKey: undefined, nodeId: undefined, redactedSource: '' },
        workspace,
        'run-1',
        runAssetsDir,
      )
    } catch (error) {
      expect(error).toBeInstanceOf(FigmaAssetError)
      expect((error as FigmaAssetError).code).toBe('missing_file_key')
    }
  })

  it('应该在缺少 nodeId 时抛出 missing_node_id', async () => {
    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    await expect(runApiMode(
      { mode: 'api', source: '', fileKey: 'abc' },
      { fileKey: 'abc', nodeId: undefined, redactedSource: '' },
      workspace,
      'run-1',
      runAssetsDir,
    )).rejects.toThrow(FigmaAssetError)

    try {
      await runApiMode(
        { mode: 'api', source: '', fileKey: 'abc' },
        { fileKey: 'abc', nodeId: undefined, redactedSource: '' },
        workspace,
        'run-1',
        runAssetsDir,
      )
    } catch (error) {
      expect(error).toBeInstanceOf(FigmaAssetError)
      expect((error as FigmaAssetError).code).toBe('missing_node_id')
    }
  })

  it('应该拒绝直接传入 token 参数', async () => {
    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    await expect(runApiMode(
      { mode: 'api', source: '', fileKey: 'abc', nodeId: '1:2', token: 'direct-token' },
      { fileKey: 'abc', nodeId: '1:2', redactedSource: '' },
      workspace,
      'run-1',
      runAssetsDir,
    )).rejects.toThrow('token 参数已弃用')
  })

  it('应该从 Figma URL 解析 fileKey 和 nodeId', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.FIGMA_TOKEN = 'test-token'

    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    const result = await runApiMode(
      { mode: 'api', source: 'https://www.figma.com/file/XYZ123/demo?node-id=1-2' },
      { fileKey: 'XYZ123', nodeId: '1-2', redactedSource: 'https://www.figma.com/file/XYZ123/demo' },
      workspace,
      'run-1',
      runAssetsDir,
    )

    expect(result.manifest.mode).toBe('api')
    expect(result.manifest.runId).toBe('run-1')
    expect(result.manifest.schemaVersion).toBe(2)
    expect(result.manifest.status).toBe('success')
    expect(result.manifest.source).toMatchObject({
      type: 'figma_url',
      host: 'www.figma.com',
      nodeIdHashes: [expect.any(String)],
      fileKeyHash: expect.any(String),
    })
    expect(result.manifest.assets).toHaveLength(1)
    expect(result.manifest.assets[0]?.format).toBe('png')
    expect(result.manifest.assets[0]?.sourceIdHash).toHaveLength(16)
    expect(result.authMode).toBe('legacy')

    delete process.env.FIGMA_TOKEN
  })

  it('应该支持 svg 和自定义 scale', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '3:4': 'https://figma.com/exported/icon.svg' } }), { status: 200 })
      }
      return new Response(Buffer.from('<svg/>'), { status: 200, headers: { 'content-length': '6' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.FIGMA_TOKEN = 'test-token'

    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    const result = await runApiMode(
      { mode: 'api', source: '', fileKey: 'abc', nodeId: '3:4', format: 'svg', scale: 2 },
      { fileKey: 'abc', nodeId: '3:4', redactedSource: '' },
      workspace,
      'run-2',
      runAssetsDir,
    )

    const apiUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(apiUrl.searchParams.get('format')).toBe('svg')
    expect(apiUrl.searchParams.get('scale')).toBe('2')
    expect(result.manifest.assets[0]?.format).toBe('svg')

    delete process.env.FIGMA_TOKEN
  })

  it('应该将 nodeId 中的 - 规范化为 :', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '10:20': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.FIGMA_TOKEN = 'test-token'

    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    const result = await runApiMode(
      { mode: 'api', source: '', fileKey: 'abc', nodeId: '10-20' },
      { fileKey: 'abc', nodeId: '10-20', redactedSource: '' },
      workspace,
      'run-3',
      runAssetsDir,
    )

    const apiUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(apiUrl.searchParams.get('ids')).toBe('10:20')
    expect(result.manifest.source?.nodeIdHashes).toHaveLength(1)

    delete process.env.FIGMA_TOKEN
  })

  it('应该使用 OAuth Bearer 认证头', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.FIGMA_OAUTH_TOKEN = 'oauth-test-token'

    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    const result = await runApiMode(
      { mode: 'api', source: '', fileKey: 'abc', nodeId: '1:2' },
      { fileKey: 'abc', nodeId: '1:2', redactedSource: '' },
      workspace,
      'run-4',
      runAssetsDir,
    )

    const apiCallInit = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined
    expect(apiCallInit?.headers?.['Authorization']).toBe('Bearer oauth-test-token')
    expect(apiCallInit?.headers?.['X-Figma-Token']).toBeUndefined()
    expect(result.authMode).toBe('oauth')

    delete process.env.FIGMA_OAUTH_TOKEN
  })

  it('应该从 envFile 读取 API key 并使用 X-Figma-Token 认证头', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    await writeFile(join(workspace, '.figma-env'), 'FIGMA_API_KEY=env-api-key\nOTHER_SECRET=do-not-leak\n')

    const runAssetsDir = join(workspace, 'assets')
    await mkdir(runAssetsDir, { recursive: true })

    const result = await runApiMode(
      { mode: 'api', source: '', fileKey: 'abc', nodeId: '1:2', envFile: '.figma-env' },
      { fileKey: 'abc', nodeId: '1:2', redactedSource: '' },
      workspace,
      'run-5',
      runAssetsDir,
    )

    const apiCallInit = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined
    expect(apiCallInit?.headers?.['X-Figma-Token']).toBe('env-api-key')
    expect(apiCallInit?.headers?.['Authorization']).toBeUndefined()
    expect(result.authMode).toBe('api_key')
    expect(result.authSource).toBe('envFile')
  })
})
