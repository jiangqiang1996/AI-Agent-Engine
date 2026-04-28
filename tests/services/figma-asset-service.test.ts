import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runFigmaAssetTool } from '../../src/services/figma-asset-service.js'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-figma-assets-'))
})

afterEach(async () => {
  await rm(workspace, { recursive: true, force: true })
  vi.restoreAllMocks()
})

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

  it('应该在 manifest 中脱敏 source', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    await runFigmaAssetTool({
      mode: 'collect',
      manualSourceDir: 'manual',
      source: 'https://user:pass@www.figma.com/file/abc/demo?token=secret#hash',
    }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as { source?: string }

    expect(manifest.source).toBe('https://www.figma.com/file/abc/demo')
  })

  it('不应该把非 URL source 原样写入 manifest', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))

    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual', source: 'token=secret' }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as { source?: string }

    expect(manifest.source).toBeUndefined()
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

  it('应该校验最新 manifest', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('校验通过')
  })

  it('应该报告素材被篡改的校验失败', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    await writeFile(join(workspace, '.figma', 'assets', 'icon.png'), Buffer.from('changed'))

    const output = await runFigmaAssetTool({ mode: 'validate' }, workspace)

    expect(output).toContain('Figma 素材校验失败')
    expect(output).toContain('checksum 或大小不匹配')
  })

  it('应该报告 manifest 中缺失的素材文件', async () => {
    await mkdir(join(workspace, 'manual'))
    await writeFile(join(workspace, 'manual', 'icon.png'), Buffer.from('image'))
    await runFigmaAssetTool({ mode: 'collect', manualSourceDir: 'manual' }, workspace)
    await rm(join(workspace, '.figma', 'assets', 'icon.png'))

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
    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', token: 'secret' }, workspace)).rejects.toThrow(
      'nodeId',
    )
  })

  it('应该拒绝非 FIGMA_ 前缀 tokenEnv', async () => {
    await expect(runFigmaAssetTool({
      mode: 'api',
      fileKey: 'abc',
      nodeId: '1:2',
      tokenEnv: 'GITHUB_TOKEN',
    }, workspace)).rejects.toThrow('FIGMA_')
  })

  it('应该拒绝不可信图片下载 URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      images: { '1:2': 'https://evilfigma.example.com/icon.png' },
    }), { status: 200 })))

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2', token: 'secret' }, workspace))
      .rejects.toThrow('允许的 HTTPS 域名')
  })

  it('应该拒绝图片下载重定向', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.figma.com/')) {
        return new Response(JSON.stringify({ images: { '1:2': 'https://figma.com/exported/icon.png' } }), { status: 200 })
      }
      return new Response('', { status: 302, headers: { location: 'https://example.com/icon.png' } })
    }))

    await expect(runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2', token: 'secret' }, workspace))
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

    const output = await runFigmaAssetTool({ mode: 'api', fileKey: 'abc', nodeId: '1:2', token: 'secret' }, workspace)
    const manifest = JSON.parse(await readFile(join(workspace, '.figma', 'manifest.json'), 'utf8')) as {
      nodeIds: string[]
      assets: Array<{ relativePath: string, bytes: number, format: string }>
    }
    const firstCall = fetchMock.mock.calls[0]
    const firstUrl = new URL(String(firstCall?.[0]))
    const firstInit = firstCall?.[1] as { headers?: Record<string, string> } | undefined

    expect(output).toContain('素材数量：1')
    expect(firstUrl.pathname).toBe('/v1/images/abc')
    expect(firstUrl.searchParams.get('ids')).toBe('1:2')
    expect(firstUrl.searchParams.get('format')).toBe('png')
    expect(firstUrl.searchParams.get('scale')).toBe('1')
    expect(firstInit?.headers?.['X-Figma-Token']).toBe('secret')
    expect(fetchMock).toHaveBeenCalledWith(new URL('https://figma.com/exported/icon.png'), { redirect: 'manual' })
    expect(manifest.nodeIds).toEqual(['1:2'])
    expect(manifest.assets[0]).toMatchObject({ relativePath: '.figma/assets/1-2.png', bytes: 5, format: 'png' })
  })
})
