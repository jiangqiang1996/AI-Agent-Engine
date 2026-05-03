import { describe, expect, it } from 'vitest'

import { FigmaAssetManifestSchema, FigmaAssetToolArgsSchema } from '../../src/schemas/figma-asset-schema.js'

describe('Figma 素材 Schema', () => {
  it('应该为工具参数提供默认模式和格式', () => {
    const result = FigmaAssetToolArgsSchema.parse({ source: 'https://figma.com/file/abc' })

    expect(result.mode).toBe('api')
    expect(result.format).toBe('png')
  })

  it('应该校验 manifest checksum 长度', () => {
    const manifest = FigmaAssetManifestSchema.parse({
      schemaVersion: 2,
      mode: 'collect',
      runId: 'run-1',
      startedAt: '2026-04-28T00:00:00.000Z',
      completedAt: '2026-04-28T00:00:00.000Z',
      status: 'success',
      source: { type: 'manual', nodeIdHashes: ['hash123456789abc'] },
      evidence: { agentBrowserUsed: false, saved: false, types: [], paths: [] },
      warnings: [],
      failures: [],
      assets: [{
        sourceIdHash: 'hash123456789abc',
        fileName: 'icon.png',
        relativePath: '.figma/assets/icon.png',
        format: 'png',
        bytes: 1,
        sha256: 'a'.repeat(64),
      }],
    })

    expect(manifest.assets[0]?.sha256).toHaveLength(64)
  })

  it.each([
    [{ mode: 'bad' }, 'mode'],
    [{ format: 'bmp' }, 'format'],
    [{ scale: 0 }, 'scale'],
    [{ scale: 5 }, 'scale'],
  ])('应该拒绝非法工具参数：%s', (input, _field) => {
    expect(() => FigmaAssetToolArgsSchema.parse(input)).toThrow()
  })

  it('应该拒绝非法 manifest 字段', () => {
    expect(() => FigmaAssetManifestSchema.parse({
      schemaVersion: 2,
      mode: 'collect',
      runId: 'run-1',
      startedAt: '2026-04-28T00:00:00.000Z',
      completedAt: '2026-04-28T00:00:00.000Z',
      status: 'success',
      source: { type: 'manual', nodeIdHashes: ['hash123456789abc'] },
      evidence: { agentBrowserUsed: false, saved: false, types: [], paths: [] },
      warnings: [],
      failures: [],
      assets: [{
        sourceIdHash: 'hash123456789abc',
        fileName: 'icon.png',
        relativePath: '.figma/assets/icon.png',
        format: 'png',
        bytes: -1,
        sha256: 'short',
      }],
    })).toThrow()
  })
})
