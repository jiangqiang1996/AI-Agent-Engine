import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { computeLocalDeps, formatLocalDepsForInjection, isLocalDepsSupported } from '../../src/services/local-deps-service.js'

describe('local-deps-service', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'local-deps-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('应该解析 TS 文件的 import 语句', () => {
    const targetPath = join(tempDir, 'target.ts')
    const depPath = join(tempDir, 'dep.ts')
    writeFileSync(depPath, 'export const foo = 42\n')
    writeFileSync(targetPath, "import { foo } from './dep'\nexport const bar = foo + 1\n")

    const result = computeLocalDeps(tempDir, 'target.ts')
    expect(result.upstream).toContain('dep.ts')
    expect(result.downstream).toEqual([])
    expect(result.unresolved).toEqual([])
  })

  it('应该解析 CommonJS require', () => {
    const targetPath = join(tempDir, 'target.js')
    const depPath = join(tempDir, 'dep.js')
    writeFileSync(depPath, 'module.exports = { foo: 42 }\n')
    writeFileSync(targetPath, "const { foo } = require('./dep')\nmodule.exports = { bar: foo }\n")

    const result = computeLocalDeps(tempDir, 'target.js')
    expect(result.upstream).toContain('dep.js')
  })

  it('应该支持自动扩展名解析', () => {
    const targetPath = join(tempDir, 'target.ts')
    const depPath = join(tempDir, 'dep.ts')
    writeFileSync(depPath, 'export const x = 1\n')
    writeFileSync(targetPath, "import { x } from './dep'\n")

    const result = computeLocalDeps(tempDir, 'target.ts')
    expect(result.upstream).toContain('dep.ts')
  })

  it('应该支持 index 文件解析', () => {
    const subDir = join(tempDir, 'module')
    mkdirSync(subDir)
    writeFileSync(join(subDir, 'index.ts'), 'export const x = 1\n')
    writeFileSync(join(tempDir, 'target.ts'), "import { x } from './module'\n")

    const result = computeLocalDeps(tempDir, 'target.ts')
    expect(result.upstream).toContain('module/index.ts')
  })

  it('应该收集未解析的外部包引用', () => {
    writeFileSync(join(tempDir, 'target.ts'), "import { z } from 'some-external-package'\n")

    const result = computeLocalDeps(tempDir, 'target.ts')
    expect(result.unresolved).toContain('some-external-package')
    expect(result.upstream).toEqual([])
  })

  it('应该扫描同目录下游引用', () => {
    writeFileSync(join(tempDir, 'lib.ts'), 'export const x = 1\n')
    writeFileSync(join(tempDir, 'caller.ts'), "import { x } from './lib'\n")
    writeFileSync(join(tempDir, 'another.ts'), "import { x } from './lib'\nexport const y = x\n")

    const result = computeLocalDeps(tempDir, 'lib.ts')
    expect(result.downstream).toContain('caller.ts')
    expect(result.downstream).toContain('another.ts')
  })

  it('formatLocalDepsForInjection 应包含上游和下游信息', () => {
    writeFileSync(join(tempDir, 'dep.ts'), 'export const x = 1\n')
    writeFileSync(join(tempDir, 'target.ts'), "import { x } from './dep'\n")
    const result = computeLocalDeps(tempDir, 'target.ts')
    const text = formatLocalDepsForInjection(result)
    expect(text).toContain('local-deps')
    expect(text).toContain('上游依赖')
    expect(text).toContain('dep.ts')
    expect(text).toContain('下游引用')
    expect(text).toContain('即时解析')
  })

  it('isLocalDepsSupported 应根据扩展名判断', () => {
    expect(isLocalDepsSupported('file.ts')).toBe(true)
    expect(isLocalDepsSupported('file.js')).toBe(true)
    expect(isLocalDepsSupported('file.py')).toBe(true)
    expect(isLocalDepsSupported('file.go')).toBe(true)
    expect(isLocalDepsSupported('file.unknown')).toBe(false)
  })

  it('文件不存在时应返回空结果', () => {
    const result = computeLocalDeps(tempDir, 'nonexistent.ts')
    expect(result.upstream).toEqual([])
    expect(result.downstream).toEqual([])
  })

  it('应该解析 Markdown 链接引用', () => {
    writeFileSync(join(tempDir, 'doc.md'), '# Title\n')
    writeFileSync(join(tempDir, 'index.md'), 'See [doc](doc.md) for details\n')

    const result = computeLocalDeps(tempDir, 'index.md')
    expect(result.upstream).toContain('doc.md')
  })

  it('应该解析 Python import 语句', () => {
    writeFileSync(join(tempDir, 'utils.py'), 'def foo(): pass\n')
    writeFileSync(join(tempDir, 'main.py'), 'from utils import foo\n\nfoo()\n')

    const result = computeLocalDeps(tempDir, 'main.py')
    expect(result.upstream.some((p) => p.includes('utils'))).toBe(true)
  })
})
