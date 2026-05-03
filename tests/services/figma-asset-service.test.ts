import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runFigmaAssetTool } from '../../src/services/figma-asset-service.js'

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
  assets: ManifestAssetFixture[]
}

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-figma-assets-'))
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
