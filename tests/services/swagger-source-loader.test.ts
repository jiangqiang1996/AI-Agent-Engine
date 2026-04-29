import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadSwaggerSource } from '../../src/services/swagger-source-loader.js'

describe('swagger-source-loader', () => {
  it('应该读取工作区内 JSON 文件', async () => {
    const result = await loadSwaggerSource('tests/fixtures/swagger/openapi-3-basic.json', process.cwd())

    expect(result.sourceType).toBe('local')
    expect(result.content).toContain('Pet Store')
  })

  it('应该拒绝路径穿越', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'swagger-loader-'))
    try {
      const outside = join(dir, '..', 'outside.json')
      writeFileSync(outside, '{}')
      await expect(loadSwaggerSource('../outside.json', dir)).rejects.toThrow('路径越界')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('应该读取工作区内 YAML 文件', async () => {
    const result = await loadSwaggerSource('tests/fixtures/swagger/openapi-3-basic.yaml', process.cwd())

    expect(result.sourceType).toBe('local')
    expect(result.content).toContain('Pet Store YAML')
    expect(result.documentDir).toContain('swagger')
  })
})
