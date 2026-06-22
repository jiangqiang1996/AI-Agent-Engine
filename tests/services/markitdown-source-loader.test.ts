import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { MarkitdownError } from '../../src/services/markitdown-errors.js'
import { loadMarkitdownSource } from '../../src/services/markitdown-source-loader.js'
import { detectFormat } from '../../src/services/markitdown-types.js'

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')

describe('markitdown-source-loader', () => {
  it('应该加载本地文本文件', async () => {
    const result = await loadMarkitdownSource(
      path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt')),
      process.cwd(),
    )
    expect(result.format).toBe('text')
    expect(result.textContent).toContain('plain text file')
    expect(result.fileSize).toBeGreaterThan(0)
  })

  it('应该检测扩展名对应的格式', () => {
    expect(detectFormat('a.html')).toBe('html')
    expect(detectFormat('a.htm')).toBe('html')
    expect(detectFormat('a.csv')).toBe('csv')
    expect(detectFormat('a.tsv')).toBe('csv')
    expect(detectFormat('a.json')).toBe('json')
    expect(detectFormat('a.yaml')).toBe('yaml')
    expect(detectFormat('a.yml')).toBe('yaml')
    expect(detectFormat('a.xml')).toBe('xml')
    expect(detectFormat('a.txt')).toBe('text')
    expect(detectFormat('a.md')).toBe('markdown')
    expect(detectFormat('a.docx')).toBe('docx')
    expect(detectFormat('a.xlsx')).toBe('xlsx')
    expect(detectFormat('a.pdf')).toBe('pdf')
    expect(detectFormat('a.ipynb')).toBe('ipynb')
    expect(detectFormat('a.unknown')).toBeUndefined()
    expect(detectFormat('noext')).toBeUndefined()
  })

  it('应该拒绝空输入', async () => {
    await expect(loadMarkitdownSource('', process.cwd())).rejects.toThrow(MarkitdownError)
    await expect(loadMarkitdownSource('   ', process.cwd())).rejects.toThrow(MarkitdownError)
  })

  it('应该拒绝不存在的路径', async () => {
    await expect(
      loadMarkitdownSource('nonexistent-file.txt', process.cwd()),
    ).rejects.toThrow(MarkitdownError)
  })

  it('应该拒绝工作区外的路径', async () => {
    await expect(
      loadMarkitdownSource(path.relative(process.cwd(), path.resolve(process.cwd(), '..', 'package.json')), process.cwd()),
    ).rejects.toThrow(MarkitdownError)
  })

  it('应该拒绝空文件', async () => {
    const emptyFile = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'empty.txt'))
    await expect(loadMarkitdownSource(emptyFile, process.cwd())).rejects.toThrow(MarkitdownError)
  })

  it('应该拒绝不支持的格式', async () => {
    const unsupportedFile = path.join(FIXTURES_DIR, 'sample.unknown')
    await fs.writeFile(unsupportedFile, 'content')
    try {
      await expect(
        loadMarkitdownSource(path.relative(process.cwd(), unsupportedFile), process.cwd()),
      ).rejects.toThrow(MarkitdownError)
    } finally {
      await fs.unlink(unsupportedFile)
    }
  })

  it('应该拒绝 UNC 路径', async () => {
    await expect(loadMarkitdownSource('\\\\server\\share\\file.txt', process.cwd())).rejects.toThrow(
      MarkitdownError,
    )
  })

  it('应该支持通过环境变量 AE_MARKITDOWN_MAX_BYTES 调整大小上限', async () => {
    const oversizedFile = path.join(FIXTURES_DIR, 'oversized.txt')
    const payload = Buffer.alloc(64, 0x41)
    await fs.writeFile(oversizedFile, payload)
    const previous = process.env.AE_MARKITDOWN_MAX_BYTES
    try {
      const rel = path.relative(process.cwd(), oversizedFile)
      process.env.AE_MARKITDOWN_MAX_BYTES = '32'
      await expect(loadMarkitdownSource(rel, process.cwd())).rejects.toThrow(
        /文件过大/,
      )
      process.env.AE_MARKITDOWN_MAX_BYTES = '128'
      const result = await loadMarkitdownSource(rel, process.cwd())
      expect(result.fileSize).toBe(64)
    } finally {
      if (previous === undefined) delete process.env.AE_MARKITDOWN_MAX_BYTES
      else process.env.AE_MARKITDOWN_MAX_BYTES = previous
      await fs.unlink(oversizedFile)
    }
  })

  it('应该在环境变量非法时回退到默认上限', async () => {
    const previous = process.env.AE_MARKITDOWN_MAX_BYTES
    try {
      process.env.AE_MARKITDOWN_MAX_BYTES = 'not-a-number'
      const result = await loadMarkitdownSource(
        path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt')),
        process.cwd(),
      )
      expect(result.format).toBe('text')
    } finally {
      if (previous === undefined) delete process.env.AE_MARKITDOWN_MAX_BYTES
      else process.env.AE_MARKITDOWN_MAX_BYTES = previous
    }
  })
})

