import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { createLocalDepsInjectionHook } from '../../src/hooks/local-deps-injection.hook.js'

describe('local-deps-injection hook', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'local-deps-hook-test-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('非编辑工具调用应直接跳过', async () => {
    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'test', output: 'result', metadata: {} }
    await hook({ tool: 'ae-graph-query', sessionID: 's1', callID: 'c1', args: { mode: 'deps' } }, output)
    expect(output.output).toBe('result')
  })

  it('edit 工具调用后应注入依赖分析', async () => {
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    const targetFile = join(srcDir, 'utils.ts')
    writeFileSync(targetFile, `import { foo } from './bar'\n`)
    writeFileSync(join(srcDir, 'bar.ts'), `export const foo = 42\n`)

    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'edit', output: 'File edited', metadata: {} }
    await hook({ tool: 'edit', sessionID: 's1', callID: 'c1', args: { filePath: targetFile } }, output)
    expect(output.output).toContain('local-deps')
    expect(output.output).toContain('bar.ts')
  })

  it('write 工具调用后应注入依赖分析', async () => {
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    const targetFile = join(srcDir, 'main.ts')
    writeFileSync(targetFile, `export const x = 1\n`)

    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'write', output: 'File written', metadata: {} }
    await hook({ tool: 'write', sessionID: 's1', callID: 'c1', args: { filePath: targetFile } }, output)
    expect(output.output).toContain('local-deps')
  })

  it('patch 工具调用后应注入依赖分析', async () => {
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    const targetFile = join(srcDir, 'app.ts')
    writeFileSync(targetFile, `export const y = 2\n`)

    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'patch', output: 'Patched', metadata: {} }
    await hook({ tool: 'patch', sessionID: 's1', callID: 'c1', args: { filePath: targetFile } }, output)
    expect(output.output).toContain('local-deps')
  })

  it('不支持的文件类型应跳过', async () => {
    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'edit', output: 'done', metadata: {} }
    await hook({ tool: 'edit', sessionID: 's1', callID: 'c1', args: { filePath: 'image.png' } }, output)
    expect(output.output).toBe('done')
  })

  it('文件路径不存在应安全跳过', async () => {
    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'edit', output: 'done', metadata: {} }
    await hook({ tool: 'edit', sessionID: 's1', callID: 'c1', args: { filePath: join(tempDir, 'nonexistent', 'file.ts') } }, output)
    expect(output.output).toBe('done')
  })

  it('无 filePath 参数应安全跳过', async () => {
    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'edit', output: 'done', metadata: {} }
    await hook({ tool: 'edit', sessionID: 's1', callID: 'c1', args: {} }, output)
    expect(output.output).toBe('done')
  })

  it('工具名为 undefined 应安全跳过', async () => {
    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'test', output: 'result', metadata: {} }
    await hook({ tool: undefined as unknown as string, sessionID: 's1', callID: 'c1', args: {} }, output)
    expect(output.output).toBe('result')
  })

  it('skipDownstream 应确保 hook 中不执行下游扫描', async () => {
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    const targetFile = join(srcDir, 'a.ts')
    writeFileSync(targetFile, `export const a = 1\n`)
    writeFileSync(join(srcDir, 'b.ts'), `import { a } from './a'\n`)

    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'edit', output: 'done', metadata: {} }
    await hook({ tool: 'edit', sessionID: 's1', callID: 'c1', args: { filePath: targetFile } }, output)
    // hook 中 skipDownstream=true，下游引用应为空
    expect(output.output).toContain('下游引用: 无')
  })

  it('闭包捕获的 worktree 应正确使用', async () => {
    const srcDir = join(tempDir, 'src')
    mkdirSync(srcDir, { recursive: true })
    const targetFile = join(srcDir, 'mod.ts')
    writeFileSync(targetFile, `import { bar } from './bar'\n`)
    writeFileSync(join(srcDir, 'bar.ts'), `export const bar = 1\n`)

    const hook = createLocalDepsInjectionHook(tempDir)
    const output = { title: 'edit', output: 'ok', metadata: {} }
    await hook({ tool: 'edit', sessionID: 's1', callID: 'c1', args: { filePath: targetFile } }, output)
    expect(output.output).toContain('bar.ts')
    expect(output.output).toContain('src/mod.ts')
  })
})
