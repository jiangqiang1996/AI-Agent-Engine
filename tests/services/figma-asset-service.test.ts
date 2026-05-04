import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runFigmaAssetTool } from '../../src/services/figma-asset-service.js'
import { hashPrefix, type FigmaAgentBrowserRunner } from '../../src/services/figma-agent-browser-runner.js'

interface ManifestAssetFixture {
  sourceIdHash: string
  fileName: string
  relativePath: string
  format: string
  bytes: number
  sha256: string
}

interface ManifestFixture {
  schemaVersion: number
  mode: string
  runId: string
  startedAt: string
  completedAt: string
  status: string
  source?: {
    type: string
    host?: string
    fileKeyHash?: string
    nodeIdHashes: string[]
  }
  failures: Array<{ code: string; message: string }>
  warnings: Array<{ code: string; message: string }>
  evidence: Record<string, unknown>
  assets: ManifestAssetFixture[]
}

let workspace: string
const TEST_SESSION_ID = 'test-session'

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-figma-assets-'))
  await writeSetupProofFixture(TEST_SESSION_ID)
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
  delete process.env.FIGMA_TOKEN
  delete process.env.FIGMA_OAUTH_TOKEN
  delete process.env.FIGMA_API_KEY
  delete process.env.FIGMA_INTERNAL_TOKEN
})

async function readManifest(path = join(workspace, '.figma', 'manifest.json')): Promise<ManifestFixture> {
  return JSON.parse(await readFile(path, 'utf8')) as ManifestFixture
}

function expectNoSensitiveOutput(value: unknown, sensitiveValues: string[]): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const sensitiveValue of sensitiveValues) {
    expect(serialized).not.toContain(sensitiveValue)
  }
}

describe('Figma 素材服务', () => {
  it('应该收集手动导出的图片并生成 manifest', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await writeFile(join(workspace, 'manual', 'note.txt'), 'skip')

    const output = await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as {
      assets: Array<{ relativePath: string }>
    }

    expect(output).toContain('素材数量：1')
    expect(manifest.assets).toHaveLength(1)
    expect(manifest.assets[0]?.relativePath).toBe('.figma/assets/icon.png')
  })

  it('应该同时写入本次 run manifest、latest manifest 和 latest assets', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const latestManifest = await readManifest()
    const runManifest = await readManifest(join(workspace, '.figma', 'runs', latestManifest.runId, 'manifest.json'))
    const latestAssetStat = await stat(join(workspace, '.figma', 'assets', 'icon.png'))
    const runAssetStat = await stat(join(workspace, '.figma', 'runs', latestManifest.runId, 'assets', 'icon.png'))

    expect(latestManifest.schemaVersion).toBe(2)
    expect(runManifest).toMatchObject({
      schemaVersion: 2,
      mode: 'collect',
      runId: latestManifest.runId,
      status: 'success',
    })
    expect(runManifest.source).toMatchObject({ type: 'manual', nodeIdHashes: [expect.any(String)] })
    expect(runManifest.assets[0]?.relativePath).toBe(`.figma/runs/${latestManifest.runId}/assets/icon.png`)
    expect(latestManifest.assets[0]?.relativePath).toBe('.figma/assets/icon.png')
    expect(latestAssetStat.size).toBe(5)
    expect(runAssetStat.size).toBe(5)
  })

  it('应该用最新运行重建 latest assets，避免历史残留误判成功', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'old.png'), Buffer.from('old'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    await rm(join(workspace, 'manual'), { recursive: true, force: true })
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'new.png'), Buffer.from('new'))

    const output = await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const latestManifest = await readManifest()
    const validateOutput = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('素材数量：1')
    expect(latestManifest.assets.map((asset) => asset.fileName)).toEqual(['new.png'])
    await expect(stat(join(workspace, '.figma', 'assets', 'old.png'))).rejects.toThrow()
    expect(validateOutput).toContain('校验通过')
    expect(validateOutput).toContain('.figma/assets/new.png')
  })

  it('应该在 manifest 中脱敏 source', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    await runFigmaAssetTool({
      mode: 'collect',
      manualSourceDir: 'manual',
      source: 'https://user:pass@www.figma.com/file/abc/demo?token=secret#hash',
    }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as ManifestFixture

    expect(manifest.source).toMatchObject({
      type: 'figma_url',
      host: 'www.figma.com',
      fileKeyHash: expect.any(String),
      nodeIdHashes: [expect.any(String)],
    })
  })

  it('不应该把非 URL source 原样写入 manifest', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual', source: 'token=secret' }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as ManifestFixture

    expect(manifest.source).toMatchObject({ type: 'manual', nodeIdHashes: [expect.any(String)] })
  })

  it('应该为清洗后冲突的文件名生成唯一文件名', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon 1.png'), Buffer.from('first'))
    await writeFile(join(workspace, 'manual', 'icon_1.png'), Buffer.from('second'))

    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as {
      assets: Array<{ fileName: string }>
    }

    expect(manifest.assets.map((asset) => asset.fileName).sort()).toEqual(['icon_1-2.png', 'icon_1.png'])
  })

  it('应该支持自定义 outputDir 并只返回工作区相对路径', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    const output = await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual', outputDir: 'custom-figma' }, workspace)
    const manifest = await readManifest(join(workspace, 'custom-figma', 'manifest.json'))

    expect(output).toContain('输出目录：custom-figma')
    expect(output).toContain('Manifest：custom-figma/manifest.json')
    expect(output).toContain(`custom-figma/runs/${manifest.runId}/assets/icon.png`)
    expect(output).not.toContain(workspace)
    expect(manifest.assets[0]?.relativePath).toBe('custom-figma/assets/icon.png')
  })

  it('应该拒绝工作区根目录作为 outputDir，避免删除业务 assets', async () => {
    await mkdir(join(workspace, 'manual'))
    await mkdir(join(workspace, 'assets'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await writeFile(join(workspace, 'assets', 'keep.png'), Buffer.from('keep'))

    await expect(runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual', outputDir: '.' }, workspace))
      .rejects.toThrow('专用 Figma 输出目录')
    await expect(stat(join(workspace, 'assets', 'keep.png'))).resolves.toMatchObject({ size: 4 })
  })

  it('应该拒绝非 Figma 专用名称的 outputDir', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    await expect(runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual', outputDir: 'assets' }, workspace))
      .rejects.toThrow('专用 Figma 输出目录')
  })

  it('应该从 envFile 读取 token 且不把 token 或 envFile 路径写入输出面', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    await writeFile(join(workspace, '.figma-env'), 'FIGMA_TOKEN=env-file-secret\nOTHER_SECRET=do-not-leak\n')

    const output = await runFigmaAssetTool({
      mode: 'api',
      fileKey: 'abc',
      nodeId: '1:2',
      envFile: '.figma-env',
    }, workspace)
    const manifest = await readManifest()
    const apiCallInit = fetchMock.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined

    expect(apiCallInit?.headers?.['X-Figma-Token']).toBe('env-file-secret')
    expectNoSensitiveOutput(output, ['env-file-secret', 'do-not-leak', '.figma-env', workspace])
    expectNoSensitiveOutput(manifest, ['env-file-secret', 'do-not-leak', '.figma-env', workspace])
  })

  it('应该通过 browser runner 下载素材并写入脱敏 manifest', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30&token=query-secret'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png?Expires=secret&Signature=secret'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe(signedUrl)
      expect(init?.redirect).toBe('manual')
      return new Response(Buffer.from('image'), {
        status: 200,
        headers: { 'content-type': 'image/png', 'content-length': '5' },
      })
    }))

    const output = await runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })
    const manifest = await readManifest()

    expect(output).toContain('- 模式：browser')
    expect(output).toContain('素材数量：1')
    expect(manifest.source).toMatchObject({ type: 'browser_page', host: 'www.figma.com' })
    expect(manifest.evidence).toMatchObject({
      agentBrowserUsed: true,
      saved: false,
      browserAuthStatus: 'node_exportable',
      downloadSourceType: 's3_presigned',
      discoveryScriptId: 'figma-export-urls',
      discoveryEventType: 'page_eval',
      savedLocalEvidence: false,
      evidenceTypes: [],
    })
    expect(manifest.assets[0]).toMatchObject({ bytes: 5, format: 'png' })
    expectNoSensitiveOutput([output, manifest], [signedUrl, 'query-secret', 'Expires=secret', 'Signature=secret'])
    expect(runner.close).toHaveBeenCalledTimes(1)
  })

  it('应该在 browser 发现不可信资源时写入 failed manifest 且关闭 session', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const unsafeUrl = 'https://example.com/icon.png?secret=leak'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [unsafeUrl] })

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    }))
      .rejects.toMatchObject({ code: 'unsafe_browser_resource_url' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'unsafe_browser_resource_url' })
    expectNoSensitiveOutput(manifest, [unsafeUrl, 'secret=leak'])
    expect(runner.close).toHaveBeenCalledTimes(1)
  })

  it.each([
    'http://www.figma.com/design/fileKey/demo?node-id=1-30',
    'https://user:pass@www.figma.com/design/fileKey/demo?node-id=1-30',
    'https://www.figma.com:444/design/fileKey/demo?node-id=1-30',
    'https://example.com/design/fileKey/demo?node-id=1-30',
    'https://127.0.0.1/design/fileKey/demo?node-id=1-30',
  ])('应该拒绝 browser 模式打开非 allowlist Figma URL：%s', async (source) => {
    const runner = createBrowserRunner({ pageUrl: source, nodeId: '1:30', resourceUrls: [] })

    await expect(runFigmaAssetTool({ mode: 'browser', source, nodeId: '1:30' }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    }))
      .rejects.toMatchObject({ code: 'invalid_figma_browser_url' })

    expect(runner.open).not.toHaveBeenCalled()
  })

  it('应该要求服务层默认 browser runner 也必须有 setup proof 标记', async () => {
    await rm(join(workspace, '.opencode'), { recursive: true, force: true })

    await expect(runFigmaAssetTool({
      mode: 'browser',
      source: 'https://www.figma.com/design/fileKey/demo?node-id=1-30',
    }, workspace)).rejects.toMatchObject({ code: 'setup_not_completed' })
  })

  it('应该要求注入 browser runner 时也必须有匹配当前会话的 setup proof', async () => {
    await writeSetupProofFixture('other-session')
    const runner = createBrowserRunner({
      pageUrl: 'https://www.figma.com/design/fileKey/demo?node-id=1-30',
      nodeId: '1:30',
      resourceUrls: [],
    })

    await expect(runFigmaAssetTool({
      mode: 'browser',
      source: 'https://www.figma.com/design/fileKey/demo?node-id=1-30',
    }, workspace, { browser: { runner, sessionId: TEST_SESSION_ID } })).rejects.toMatchObject({ code: 'setup_not_completed' })

    expect(runner.open).not.toHaveBeenCalled()
  })

  it('应该拒绝 browser 资源发现 page provenance 不匹配', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [] })
    vi.mocked(runner.discoverResources).mockResolvedValueOnce({
      sessionIdHash: hashPrefix('figma-assets-wrong'),
      pageUrlHash: hashPrefix('https://www.figma.com/design/other/demo?node-id=1-30'),
      targetNodeId: '1:30',
      scriptId: 'figma-export-urls',
      capturedAt: '2026-04-28T00:00:00.000Z',
      eventType: 'page_eval',
      resourceUrls: ['https://s3-alpha-sig.figma.com/img/abc/icon.png'],
    })

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    }))
      .rejects.toMatchObject({ code: 'browser_resource_discovery_failed' })
  })

  it('应该拒绝 browser 发现多个候选资源以避免错误节点误成功', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({
      pageUrl: figmaUrl,
      nodeId: '1:30',
      resourceUrls: [
        'https://s3-alpha-sig.figma.com/img/abc/icon-a.png',
        'https://s3-alpha-sig.figma.com/img/abc/icon-b.png',
      ],
    })

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'browser_resource_ambiguous' })
  })

  it('应该拒绝 browser 资源发现 node-id 前缀误匹配', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({
      pageUrl: figmaUrl,
      nodeId: '1:3',
      resourceUrls: ['https://s3-alpha-sig.figma.com/img/abc/icon.png'],
    })

    await expect(runFigmaAssetTool({
      mode: 'browser',
      source: figmaUrl,
      nodeId: '1:3',
    }, workspace, { browser: { runner, sessionId: TEST_SESSION_ID } }))
      .rejects.toMatchObject({ code: 'browser_resource_discovery_failed' })
  })

  it('应该拒绝 browser 下载重定向并写入 failed manifest', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png?Signature=secret'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 302,
      headers: { location: 'https://example.com/redirect?secret=leak' },
    })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    }))
      .rejects.toMatchObject({ code: 'download_redirect_not_allowed' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'download_redirect_not_allowed' })
    expectNoSensitiveOutput(manifest, [signedUrl, 'Signature=secret', 'redirect?secret=leak'])
  })

  it('应该拒绝 browser 流式下载超过单文件大小上限', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png?Signature=secret'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(26 * 1024 * 1024))
        controller.close()
      },
    }), {
      status: 200,
      headers: { 'content-type': 'image/png' },
    })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'download_too_large' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'download_too_large' })
  })

  it('应该在 browser session 关闭失败时返回失败 manifest', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.mocked(runner.close).mockRejectedValueOnce(new Error('close failed'))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('image'), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '5' },
    })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'browser_session_close_failed' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.warnings[0]).toMatchObject({ code: 'browser_session_close_failed' })
    expect(manifest.failures[0]).toMatchObject({ code: 'browser_session_close_failed' })
  })

  it('应该在 browser 下载遇到 403+set-cookie 时返回 requires_auth 错误', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 403,
      headers: { 'set-cookie': 'session=abc; Path=/' },
    })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'browser_resource_requires_auth' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'browser_resource_requires_auth' })
    expectNoSensitiveOutput(manifest, ['session=abc'])
  })

  it('应该在 browser 下载遇到 403 无 set-cookie 时返回 expired_url 错误', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png?Signature=secret'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'expired_browser_resource_url' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'expired_browser_resource_url' })
    expectNoSensitiveOutput(manifest, [signedUrl, 'Signature=secret'])
  })

  it('应该在 browser 下载遇到 404 时返回 expired_url 错误', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'expired_browser_resource_url' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'expired_browser_resource_url' })
  })

  it('应该在 browser 下载遇到 500 时返回 download_failed 错误', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const signedUrl = 'https://s3-alpha-sig.figma.com/img/abc/icon.png'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [signedUrl] })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('server error', { status: 500 })))

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'download_failed' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'download_failed' })
  })

  it('应该在 browser snapshot 返回需要登录时拒绝并写入 failed manifest', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [] })
    vi.mocked(runner.snapshotInteractive).mockResolvedValueOnce('Sign in to Figma')

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'login_required' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'login_required' })
    expect(runner.close).toHaveBeenCalledTimes(1)
  })

  it('应该在 browser snapshot 返回无权限时拒绝并写入 failed manifest', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [] })
    vi.mocked(runner.snapshotInteractive).mockResolvedValueOnce('Request access to this file')

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'access_denied' })
    const manifest = await readManifest()

    expect(manifest.status).toBe('failed')
    expect(manifest.failures[0]).toMatchObject({ code: 'access_denied' })
  })

  it('应该在 browser snapshot 返回文件不存在时拒绝', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [] })
    vi.mocked(runner.snapshotInteractive).mockResolvedValueOnce('File not found - 404')

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'file_not_found' })
  })

  it('应该在 browser snapshot 返回空内容时拒绝', async () => {
    const figmaUrl = 'https://www.figma.com/design/fileKey/demo?node-id=1-30'
    const runner = createBrowserRunner({ pageUrl: figmaUrl, nodeId: '1:30', resourceUrls: [] })
    vi.mocked(runner.snapshotInteractive).mockResolvedValueOnce('')

    await expect(runFigmaAssetTool({ mode: 'browser', source: figmaUrl }, workspace, {
      browser: { runner, sessionId: TEST_SESSION_ID },
    })).rejects.toMatchObject({ code: 'page_load_failed' })
  })

  it('应该校验最新 manifest', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('校验通过')
  })

  it('应该报告 latest manifest 与 run manifest 的 runId 不一致', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const latestManifest = await readManifest()
    const runManifestPath = join(workspace, '.figma', 'runs', latestManifest.runId, 'manifest.json')
    await writeFile(runManifestPath, `${JSON.stringify({ ...latestManifest, runId: 'different-run' }, null, 2)}\n`)

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('run manifest 与 latest manifest 的 runId 不一致')
  })

  it('应该提示旧版 manifest 需要重新生成', async () => {
    await mkdir(join(workspace, '.figma'), { recursive: true })
    await writeFile(join(workspace, '.figma', 'manifest.json'), `${JSON.stringify({
      version: 1,
      mode: 'collect',
      runId: 'legacy-run',
      createdAt: '2026-04-28T00:00:00.000Z',
      nodeIds: ['icon'],
      assets: [],
    })}\n`)

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('旧版 version: 1')
    expect(output).toContain('schemaVersion: 2')
  })

  it('应该返回 API、collect 和 validate 三模式的当前摘要标题', async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.FIGMA_TOKEN = 'api-secret'
    const apiOutput = await runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace)
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    const collectOutput = await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const validateOutput = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(apiOutput).toContain('# Figma 素材导出完成')
    expect(apiOutput).toContain('- 模式：api')
    expect(collectOutput).toContain('# Figma 素材导出完成')
    expect(collectOutput).toContain('- 模式：collect')
    expect(validateOutput).toContain('# Figma 素材校验通过')
    expect(validateOutput).toContain('- 模式：collect')
    expectNoSensitiveOutput([apiOutput, collectOutput, validateOutput], ['api-secret'])
  })

  it('应该报告素材被篡改的校验失败', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const latestManifest = await readManifest()
    await writeFile(join(workspace, '.figma', 'runs', latestManifest.runId, 'assets', 'icon.png'), Buffer.from('changed'))

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('Figma 素材校验失败')
    expect(output).toContain('checksum 或大小不匹配')
  })

  it('应该报告 latest assets 被篡改的校验失败', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    await writeFile(join(workspace, '.figma', 'assets', 'icon.png'), Buffer.from('changed'))

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('.figma/assets/icon.png')
    expect(output).toContain('checksum 或大小不匹配')
  })

  it('应该报告 manifest 中缺失的素材文件', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    const latestManifest = await readManifest()
    await rm(join(workspace, '.figma', 'runs', latestManifest.runId, 'assets', 'icon.png'))

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('文件不存在或无法读取')
  })

  it('应该拒绝超大本地素材', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'large.png'), Buffer.alloc((25 * 1024 * 1024) + 1))

    await expect(runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace))
      .rejects.toThrow('大小上限')
  })

  it('应该拒绝缺少 nodeId 的 API 模式', async () => {
    process.env.FIGMA_TOKEN = 'test'
    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc' }, workspace)).rejects.toThrow(
      'nodeId',
    )
  })

  it('应该在缺少 nodeId 的 API 错误中保持 token 脱敏', async () => {
    process.env.FIGMA_TOKEN = 'secret-token'
    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc' }, workspace)).rejects.toThrow(
      'nodeId',
    )

    try {
      await runFigmaAssetTool({ mode: 'api', fileKey: 'abc' }, workspace)
    } catch (error) {
      expectNoSensitiveOutput(error instanceof Error ? error.message : error, ['secret-token'])
    }
  })

  it('应该拒绝直接传入 token 参数', async () => {
    await expect(runFigmaAssetTool({
      mode: 'api',
      fileKey: 'abc',
      nodeId: '1:2',
      token: 'direct-token',
    }, workspace)).rejects.toThrow('token 参数已弃用')
  })

  it('应该拒绝非 allowlist 的 tokenEnv', async () => {
    process.env.FIGMA_INTERNAL_TOKEN = 'internal-secret'
    await expect(runFigmaAssetTool({
      mode: 'api',
      fileKey: 'abc',
      nodeId: '1:2',
      tokenEnv: 'FIGMA_INTERNAL_TOKEN',
    }, workspace)).rejects.toThrow('FIGMA_OAUTH_TOKEN')
    delete process.env.FIGMA_INTERNAL_TOKEN
  })

  it('应该拒绝不可信图片下载 URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      images: { '1:2': 'https://evilfigma.example.com/icon.png' },
    }), { status: 200 })))
    process.env.FIGMA_TOKEN = 'test'

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace))
      .rejects.toThrow('允许的 HTTPS 域名')
  })

  it('应该在 API 已发起后的失败中写入 failed manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      images: { '1:2': 'https://evilfigma.example.com/icon.png' },
    }), { status: 200 })))
    process.env.FIGMA_TOKEN = 'test'

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace))
      .rejects.toThrow('允许的 HTTPS 域名')
    const latestManifest = await readManifest()
    const runManifest = await readManifest(join(workspace, '.figma', 'runs', latestManifest.runId, 'manifest.json'))

    expect(latestManifest.status).toBe('failed')
    expect(runManifest.status).toBe('failed')
    expect(runManifest.assets).toHaveLength(0)
    expect(runManifest.failures[0]).toMatchObject({ code: 'unsafe_download_url' })
  })

  it('应该在 API 权限失败中写入 failed manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 403 })))
    process.env.FIGMA_TOKEN = 'test'

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace))
      .rejects.toThrow('无权访问')
    const latestManifest = await readManifest()
    const runManifest = await readManifest(join(workspace, '.figma', 'runs', latestManifest.runId, 'manifest.json'))

    expect(runManifest.status).toBe('failed')
    expect(runManifest.failures[0]).toMatchObject({ code: 'access_denied' })
  })

  it('应该把 API 模式未知异常转换为脱敏 failed manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error(`network failed ${workspace} secret-token`)
    }))
    process.env.FIGMA_TOKEN = 'secret-token'

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace))
      .rejects.toMatchObject({ code: 'api_mode_failed' })
    const latestManifest = await readManifest()
    const runManifest = await readManifest(join(workspace, '.figma', 'runs', latestManifest.runId, 'manifest.json'))

    expect(runManifest.status).toBe('failed')
    expect(runManifest.failures[0]).toMatchObject({ code: 'api_mode_failed' })
    expectNoSensitiveOutput(runManifest, [workspace, 'secret-token'])
  })

  it('应该拒绝图片下载重定向', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response('', { status: 302, headers: { location: 'https://example.com/icon.png' } })
    }))
    process.env.FIGMA_TOKEN = 'test'

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace))
      .rejects.toThrow('重定向')
  })

  it('应该使用 Figma API 下载指定节点素材', async () => {
    const fetchMock = vi.fn(async (input: string | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    process.env.FIGMA_TOKEN = 'secret'

    const output = await runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2' }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as ManifestFixture
    const firstCall = fetchMock.mock.calls[0]
    const firstUrl = new URL(String(firstCall?.[0]))
    const firstInit = firstCall?.[1] as { headers?: Record<string, string> } | undefined

    expect(output).toContain('素材数量：1')
    expect(firstUrl.pathname).toBe('/v1/images/abc')
    expect(firstUrl.searchParams.get('ids')).toBe('1:2')
    expect(firstUrl.searchParams.get('format')).toBe('png')
    expect(firstUrl.searchParams.get('scale')).toBe('1')
    expect(firstInit?.headers?.['X-Figma-Token']).toBe('secret')
    const downloadCall = fetchMock.mock.calls[1]
    const downloadInit = downloadCall?.[1] as { redirect?: string; signal?: AbortSignal } | undefined
    expect(downloadCall?.[0]).toEqual(new URL('https://figma.com/exported/icon.png'))
    expect(downloadInit?.redirect).toBe('manual')
    expect(downloadInit?.signal).toBeInstanceOf(AbortSignal)
    expect(manifest.source).toMatchObject({ type: 'figma_url', nodeIdHashes: [expect.any(String)] })
    expect(manifest.assets[0]).toMatchObject({ relativePath: expect.stringMatching(/^\.figma\/assets\/[a-f0-9]{16}\.png$/), bytes: 5, format: 'png' })
    expect(manifest.assets[0]?.relativePath).not.toContain('1-2')
    expect(manifest.assets[0]?.sourceIdHash).toHaveLength(16)
  })

  it('不应该把 API token、完整下载 URL 或 source 查询参数写入 manifest 和摘要', async () => {
    const downloadUrl = 'https://figma.com/exported/icon.png?signature=temporary-secret'
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': downloadUrl } }), { status: 200 })
      }
      return new Response(Buffer.from('image'), { status: 200, headers: { 'content-length': '5' } })
    }))

    process.env.FIGMA_TOKEN = 'api-secret'
    const output = await runFigmaAssetTool({
      mode: 'api',
      source: 'https://www.figma.com/file/abc/demo?node-id=1-2&token=query-secret#hash',
    }, workspace)
    const manifest = await readManifest()

    expect(manifest.source).toMatchObject({
      type: 'figma_url',
      host: 'www.figma.com',
      fileKeyHash: expect.any(String),
      nodeIdHashes: [expect.any(String)],
    })
    expectNoSensitiveOutput(output, ['api-secret', downloadUrl, 'temporary-secret', 'query-secret'])
    expectNoSensitiveOutput(manifest, ['api-secret', downloadUrl, 'temporary-secret', 'query-secret'])
  })

})

function createBrowserRunner(options: {
  pageUrl: string
  nodeId: string
  resourceUrls: string[]
}): FigmaAgentBrowserRunner {
  return {
    open: vi.fn(async () => undefined),
    snapshotInteractive: vi.fn(async () => 'Export PNG'),
    discoverResources: vi.fn(async (sessionId, pageUrl, nodeId, scriptId) => ({
      sessionIdHash: hashPrefix(sessionId),
      pageUrlHash: hashPrefix(pageUrl),
      targetNodeId: nodeId,
      scriptId: scriptId as 'figma-export-urls',
      capturedAt: '2026-04-28T00:00:00.000Z',
      eventType: 'page_eval' as const,
      resourceUrls: pageUrl === options.pageUrl && nodeId === options.nodeId ? options.resourceUrls : [],
    })),
    close: vi.fn(async () => undefined),
  }
}

async function writeSetupProofFixture(sessionId: string): Promise<void> {
  await mkdir(join(workspace, '.opencode', 'ae'), { recursive: true })
  await writeFile(join(workspace, '.opencode', 'ae', 'setup-proof.json'), `${JSON.stringify({
    sessionId,
    completedAt: '2026-04-28T00:00:00.000Z',
    version: '0.25.4',
  }, null, 2)}\n`)
}
