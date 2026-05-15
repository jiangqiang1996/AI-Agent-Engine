import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Effect } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-html-bundle-tool-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function callTool(root: string, args: Record<string, unknown>, ask?: () => Effect.Effect<void, Error>) {
  const { aeHtmlBundleTool: tool } = await import('../../src/tools/ae-html-bundle.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string | { output: string }>
  }
  const result = await definition.execute(args, {
    metadata: vi.fn(),
    ...(ask ? { ask } : {}),
    worktree: root,
    directory: root,
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
  return typeof result === 'string' ? result : result.output
}

describe('ae-html-bundle 工具', () => {
  it('应该生成 bundle 并返回摘要', async () => {
    const root = createRoot()
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'assets', 'app.js'), 'console.log("ok")')
    writeFileSync(join(root, 'index.html'), '<script src="assets/app.js"></script>')

    const output = await callTool(root, { entry: 'index.html', output: 'bundle.html' }, () => Effect.void)

    expect(output).toContain('# HTML Bundle 结果：complete')
    expect(output).toContain('已内联资源：1')
    expect(readFileSync(join(root, 'bundle.html'), 'utf8')).toContain('console.log("ok")')
  })

  it('应该返回可恢复的中文错误', async () => {
    const root = createRoot()

    const output = await callTool(root, { entry: 'missing.html', output: 'bundle.html' }, () => Effect.void)

    expect(output).toContain('# HTML Bundle 结果：failed')
    expect(output).toContain('入口 HTML 不存在或无法访问')
  })

  it('缺少写入授权能力时应该停止且不写文件', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<html></html>')

    const output = await callTool(root, { entry: 'index.html', output: 'bundle.html' })

    expect(output).toContain('# HTML Bundle 结果：failed')
    expect(output).toContain('无法请求文件写入授权')
    expect(() => readFileSync(join(root, 'bundle.html'), 'utf8')).toThrow()
  })

  it('写入授权被拒绝时应该返回 failed 且不写文件', async () => {
    const root = createRoot()
    writeFileSync(join(root, 'index.html'), '<html></html>')

    const output = await callTool(root, { entry: 'index.html', output: 'bundle.html' }, () => Effect.fail(new Error('拒绝写入')))

    expect(output).toContain('# HTML Bundle 结果：failed')
    expect(output).toContain('拒绝写入')
    expect(() => readFileSync(join(root, 'bundle.html'), 'utf8')).toThrow()
  })
})
