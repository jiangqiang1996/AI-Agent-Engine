import { promises as fs } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { MarkitdownError } from '../../src/services/markitdown-errors.js'
import { loadMarkitdownSource, normalizeUserFilePath } from '../../src/services/markitdown-source-loader.js'
import { detectFormat } from '../../src/services/markitdown-types.js'

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown')

describe('markitdown-source-loader', () => {
  it('应该加载本地文本文件', async () => {
    const result = await loadMarkitdownSource(
      path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html')),
      process.cwd(),
    )
    expect(result.format).toBe('html')
    expect(result.textContent).toContain('Hello World')
    expect(result.fileSize).toBeGreaterThan(0)
  })

  it('应该检测扩展名对应的格式', () => {
    expect(detectFormat('a.html')).toBe('html')
    expect(detectFormat('a.htm')).toBe('html')
    expect(detectFormat('a.csv')).toBe('csv')
    expect(detectFormat('a.tsv')).toBe('csv')
    expect(detectFormat('a.json')).toBe('json')
    expect(detectFormat('a.docx')).toBe('docx')
    expect(detectFormat('a.xlsx')).toBe('xlsx')
    expect(detectFormat('a.pdf')).toBe('pdf')
    expect(detectFormat('a.pptx')).toBe('pptx')
    expect(detectFormat('a.jpg')).toBe('jpg')
    expect(detectFormat('a.jpeg')).toBe('jpg')
    expect(detectFormat('a.png')).toBe('jpg')
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
    await expect(loadMarkitdownSource(emptyFile, process.cwd(), 'html')).rejects.toThrow(MarkitdownError)
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
      await expect(loadMarkitdownSource(rel, process.cwd(), 'html')).rejects.toThrow(
        /文件过大/,
      )
      process.env.AE_MARKITDOWN_MAX_BYTES = '128'
      const result = await loadMarkitdownSource(rel, process.cwd(), 'html')
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
        path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html')),
        process.cwd(),
      )
      expect(result.format).toBe('html')
    } finally {
      if (previous === undefined) delete process.env.AE_MARKITDOWN_MAX_BYTES
      else process.env.AE_MARKITDOWN_MAX_BYTES = previous
    }
  })
})

describe('normalizeUserFilePath', () => {
  it('应该剥离 @ 前缀', () => {
    expect(normalizeUserFilePath('@tests/fixtures/sample.txt')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离双引号包裹', () => {
    expect(normalizeUserFilePath('"tests/fixtures/sample.txt"')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离单引号包裹', () => {
    expect(normalizeUserFilePath("'tests/fixtures/sample.txt'")).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离反引号包裹', () => {
    expect(normalizeUserFilePath('`tests/fixtures/sample.txt`')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离 @ 前缀加引号的组合', () => {
    expect(normalizeUserFilePath('@"tests/fixtures/sample.txt"')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离首尾空白', () => {
    expect(normalizeUserFilePath('  tests/fixtures/sample.txt  ')).toBe('tests/fixtures/sample.txt')
  })

  it('应该保留路径内部的空格和特殊字符', () => {
    expect(normalizeUserFilePath('my folder/file name.txt')).toBe('my folder/file name.txt')
  })

  it('应该拒绝纯空白输入', () => {
    expect(normalizeUserFilePath('   ')).toBe('')
    expect(normalizeUserFilePath('')).toBe('')
  })

  it('不应剥离不配对的引号', () => {
    expect(normalizeUserFilePath('"tests/fixtures/sample.txt')).toBe('"tests/fixtures/sample.txt')
  })
})

describe('markitdown-source-loader format 覆盖', () => {
  it('应该支持 format 覆盖扩展名推断', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt'))
    const result = await loadMarkitdownSource(rel, process.cwd(), 'html')
    expect(result.format).toBe('html')
  })

  it('应该在未提供 format 时回退到扩展名推断', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.json'))
    const result = await loadMarkitdownSource(rel, process.cwd())
    expect(result.format).toBe('json')
  })
})

describe('normalizeUserFilePath', () => {
  it('应该剥离 @ 前缀', () => {
    expect(normalizeUserFilePath('@/path/to/file.pdf')).toBe('/path/to/file.pdf')
    expect(normalizeUserFilePath('@relative/file.txt')).toBe('relative/file.txt')
  })

  it('应该剥离配对的引号和反引号', () => {
    expect(normalizeUserFilePath('"path/with spaces.md"')).toBe('path/with spaces.md')
    expect(normalizeUserFilePath("'path/file.csv'")).toBe('path/file.csv')
    expect(normalizeUserFilePath('`path/file.json`')).toBe('path/file.json')
  })

  it('应该剥离 @ 前缀加引号的组合', () => {
    expect(normalizeUserFilePath('@"path/file.pdf"')).toBe('path/file.pdf')
    expect(normalizeUserFilePath("@'path/file.pdf'")).toBe('path/file.pdf')
  })

  it('应该保留不含包裹字符的路径', () => {
    expect(normalizeUserFilePath('plain/path.txt')).toBe('plain/path.txt')
    expect(normalizeUserFilePath('./relative.md')).toBe('./relative.md')
  })

  it('应该 trim 首尾空白', () => {
    expect(normalizeUserFilePath('  path.txt  ')).toBe('path.txt')
  })

  it('应该拒绝仅含空白的输入', async () => {
    await expect(loadMarkitdownSource('   ', process.cwd())).rejects.toThrow(MarkitdownError)
    await expect(loadMarkitdownSource('@"   "', process.cwd())).rejects.toThrow(MarkitdownError)
  })
})

describe('loadMarkitdownSource - format 覆盖', () => {
  it('应该支持 formatOverride 覆盖扩展名推断', async () => {
    const result = await loadMarkitdownSource(
      path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt')),
      process.cwd(),
      'html',
    )
    expect(result.format).toBe('html')
  })

  it('应该在未提供 formatOverride 时回退到扩展名推断', async () => {
    const result = await loadMarkitdownSource(
      path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.json')),
      process.cwd(),
    )
    expect(result.format).toBe('json')
  })

  it('应该接受 @ 前缀路径并正确加载', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html'))
    const result = await loadMarkitdownSource(`@${rel}`, process.cwd())
    expect(result.format).toBe('html')
    expect(result.textContent).toContain('Hello World')
  })

  it('应该接受引号包裹的路径并正确加载', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html'))
    const result = await loadMarkitdownSource(`"${rel}"`, process.cwd())
    expect(result.format).toBe('html')
  })
})

describe('normalizeUserFilePath', () => {
  it('应该剥离 @ 前缀', () => {
    expect(normalizeUserFilePath('@docs/a.txt')).toBe('docs/a.txt')
  })

  it('应该剥离首尾配对的引号与反引号', () => {
    expect(normalizeUserFilePath('"docs/a.txt"')).toBe('docs/a.txt')
    expect(normalizeUserFilePath("'docs/a.txt'")).toBe('docs/a.txt')
    expect(normalizeUserFilePath('`docs/a.txt`')).toBe('docs/a.txt')
  })

  it('应该同时剥离 @ 前缀与引号', () => {
    expect(normalizeUserFilePath('@"docs/a.txt"')).toBe('docs/a.txt')
  })

  it('应该保留路径内部的空格与分隔符', () => {
    expect(normalizeUserFilePath('my docs/a b.txt')).toBe('my docs/a b.txt')
  })

  it('应该处理纯空白输入', () => {
    expect(normalizeUserFilePath('   ')).toBe('')
  })

  it('不应该剥离未配对的引号', () => {
    expect(normalizeUserFilePath('"docs/a.txt')).toBe('"docs/a.txt')
  })
})

describe('markitdown-source-loader format override', () => {
  it('应该支持通过 formatOverride 强制指定格式', async () => {
    await fs.mkdir(path.join(FIXTURES_DIR, 'tmp_override'), { recursive: true })
    const noExtFile = path.join(FIXTURES_DIR, 'tmp_override', 'noext')
    await fs.writeFile(noExtFile, 'name,age\nAlice,30\n')
    try {
      const rel = path.relative(process.cwd(), noExtFile)
      // 不指定 format：无扩展名应被拒绝
      await expect(loadMarkitdownSource(rel, process.cwd())).rejects.toThrow(MarkitdownError)
      // 指定 format=csv：应成功按 csv 解析
      const result = await loadMarkitdownSource(rel, process.cwd(), 'csv')
      expect(result.format).toBe('csv')
    } finally {
      await fs.rm(path.join(FIXTURES_DIR, 'tmp_override'), { recursive: true, force: true })
    }
  })
})

describe('normalizeUserFilePath', () => {
  it('应该剥离 @ 前缀', () => {
    expect(normalizeUserFilePath('@tests/fixtures/sample.txt')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离配对的双引号', () => {
    expect(normalizeUserFilePath('"tests/fixtures/sample.txt"')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离配对的单引号', () => {
    expect(normalizeUserFilePath("'tests/fixtures/sample.txt'")).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离配对的反引号', () => {
    expect(normalizeUserFilePath('`tests/fixtures/sample.txt`')).toBe('tests/fixtures/sample.txt')
  })

  it('应该剥离 @ 前缀与配对引号的组合', () => {
    expect(normalizeUserFilePath('@"tests/fixtures/sample.txt"')).toBe('tests/fixtures/sample.txt')
    expect(normalizeUserFilePath("@'tests/fixtures/sample.txt'")).toBe('tests/fixtures/sample.txt')
  })

  it('应该保留首尾空白被 trim 后的内部路径', () => {
    expect(normalizeUserFilePath('  tests/fixtures/sample.txt  ')).toBe('tests/fixtures/sample.txt')
  })

  it('应该保留路径中合法的 @ 字符', () => {
    expect(normalizeUserFilePath('tests/@scope/file.txt')).toBe('tests/@scope/file.txt')
  })

  it('应该保留单个配对引号不存在的路径原样', () => {
    expect(normalizeUserFilePath('tests/file.txt')).toBe('tests/file.txt')
  })

  it('应该不剥离非配对的引号', () => {
    expect(normalizeUserFilePath('"tests/file.txt')).toBe('"tests/file.txt')
  })
})

describe('loadMarkitdownSource 路径归一化与 format 覆盖', () => {
  it('应该接受 @ 前缀路径', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html'))
    const result = await loadMarkitdownSource(`@${rel}`, process.cwd())
    expect(result.format).toBe('html')
  })

  it('应该接受带引号的路径', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.html'))
    const result = await loadMarkitdownSource(`"${rel}"`, process.cwd())
    expect(result.format).toBe('html')
  })

  it('应该接受 format 覆盖并优先于扩展名推断', async () => {
    const rel = path.relative(process.cwd(), path.join(FIXTURES_DIR, 'sample.txt'))
    const result = await loadMarkitdownSource(rel, process.cwd(), 'html')
    expect(result.format).toBe('html')
  })

  it('应该支持对无扩展名文件使用 format 覆盖', async () => {
    const noExtFile = path.join(FIXTURES_DIR, 'noext_temp')
    await fs.writeFile(noExtFile, 'plain content\n')
    try {
      const rel = path.relative(process.cwd(), noExtFile)
      const result = await loadMarkitdownSource(rel, process.cwd(), 'html')
      expect(result.format).toBe('html')
      expect(result.textContent).toContain('plain content')
    } finally {
      await fs.unlink(noExtFile)
    }
  })
})

