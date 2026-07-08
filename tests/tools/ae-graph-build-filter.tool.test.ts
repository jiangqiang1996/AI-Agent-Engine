import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { aeGraphBuildTool } from '../../src/tools/ae-graph-build.tool.js'
import { aeGraphQueryTool } from '../../src/tools/ae-graph-query.tool.js'
import {
  cleanupTempRoots,
  createAllowExcludeContext,
  createCaptureAskContext,
  createMockContext,
  createTempRoot,
  write,
} from './graph-build-fixture.js'

afterEach(cleanupTempRoots)

describe('ae-graph-build 过滤与排除规则', () => {
  it('应该支持相对 target 与 exclude 参数', async () => {
    const root = createTempRoot()
    write(root, 'workspace/src/a.ts', "import b from './b'\nimport c from './c'")
    write(root, 'workspace/src/b.ts', 'export const b = 1')
    write(root, 'workspace/src/c.ts', 'export const c = 1')

    const result = await aeGraphBuildTool.execute({ target: './workspace', mode: 'full', exclude: ['workspace/src/c.ts'] }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { activeNodes: number; relations: number }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'deps', scope: 'workspace', file: 'workspace/src/a.ts' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { summary: { chunkIds: string[] }; result: { dependencies: Array<{ targetPath: string }> } }

    expect(parsed.activeNodes).toBeGreaterThan(0)
    expect(query.result.dependencies.some((relation) => relation.targetPath === 'workspace/src/c.ts')).toBe(false)
    expect(query.summary.chunkIds.length).toBeGreaterThan(0)
  })

  it('未授权时不应该保存明显需要排除的目录到项目级 ae.jsonc', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'vendor/pkg/index.js', 'export const ignored = true')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      savedExcludes: string[]
      excludeRules: string[]
      activeNodes: number
      filterCandidateSummary: { rawFileCount: number; candidateFileCount: number }
    }

    expect(parsed.savedExcludes).toEqual([])
    expect(parsed.excludeRules).not.toContain('**/vendor')
    expect(existsSync(join(root, '.opencode', 'ae.jsonc'))).toBe(false)
    expect(parsed.activeNodes).toBeGreaterThan(0)
    expect(parsed.filterCandidateSummary.rawFileCount).toBe(2)
    expect(parsed.filterCandidateSummary.candidateFileCount).toBe(2)
  })

  it('应该在构建结果中返回扩展名和路径段过滤候选摘要', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'src/logo.svg', '<svg />')
    write(root, 'build/bundle.js', '')

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const parsed = JSON.parse(result as string) as {
      filterCandidateSummary: {
        extensionCandidates: Array<{ value: string; count: number; suggestedRule: string }>
        pathSegmentCandidates: Array<{ value: string; count: number; suggestedRule: string }>
      }
    }

    expect(parsed.filterCandidateSummary.extensionCandidates).toContainEqual(expect.objectContaining({ value: '.svg', count: 1, suggestedRule: '**/*.svg' }))
    expect(parsed.filterCandidateSummary.pathSegmentCandidates).toContainEqual(expect.objectContaining({ value: 'build', count: 1, suggestedRule: '**/build' }))
  })

  it('应该只基于本次 target 范围提示过滤候选', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'src/logo.svg', '<svg />')
    write(root, 'other/logo.svg', '<svg />')
    const asked: unknown[] = []

    await aeGraphBuildTool.execute({ target: 'src', mode: 'full' }, createCaptureAskContext(root, asked))

    const suggestions = JSON.stringify(asked)
    expect(suggestions).toContain('src/logo.svg')
    expect(suggestions).not.toContain('other/logo.svg')
  })

  it('已有规则覆盖本次候选时不应该重复提示', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'src/logo.svg', '<svg />')
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/*.svg"] } }')
    const asked: unknown[] = []

    await aeGraphBuildTool.execute({ target: 'src', mode: 'full' }, createCaptureAskContext(root, asked))

    expect(JSON.stringify(asked)).not.toContain('**/*.svg')
  })

  it('未持久化排除规则时当前构建不应该排除候选目录', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'vendor/pkg/index.js', 'export const ignored = true')

    await aeGraphBuildTool.execute({ mode: 'full' }, createMockContext(root))
    const queryResult = await aeGraphQueryTool.execute({ mode: 'filter' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { files: Array<{ relativePath: string }> } }

    expect(query.result.files.some((file) => file.relativePath === 'vendor/pkg/index.js')).toBe(true)
  })

  it('应该在用户明确选择后保存未覆盖的明显排除规则', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'vendor/pkg/index.js', 'export const ignored = true')

    const result = await aeGraphBuildTool.execute({
      mode: 'full',
      filterDecisions: { exclude: ['**/vendor'] },
    }, createAllowExcludeContext(root))
    const parsed = JSON.parse(result as string) as { savedExcludes: string[]; excludeRules: string[]; activeNodes: number }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'filter' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { files: Array<{ relativePath: string }> } }
    const config = readFileSync(join(root, '.opencode', 'ae.jsonc'), 'utf8')

    expect(parsed.savedExcludes).toContain('**/vendor')
    expect(parsed.excludeRules).toContain('**/vendor')
    expect(config).toContain('**/vendor')
    expect(parsed.activeNodes).toBeGreaterThan(0)
    expect(query.result.files.some((file) => file.relativePath === 'vendor/pkg/index.js')).toBe(false)
    expect(query.result.files.some((file) => file.relativePath === 'src/a.ts')).toBe(true)
  })

  it('已有规则覆盖实际目录时不应该再次询问或重复保存', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'dist/a.ts', '')
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/dist"] } }')
    const asked: unknown[] = []
    const ctx = createCaptureAskContext(root, asked)

    const result = await aeGraphBuildTool.execute({ mode: 'full' }, ctx)
    const parsed = JSON.parse(result as string) as { savedExcludes: string[]; excludeRules: string[] }

    expect(asked.some((item) => JSON.stringify(item).includes('"suggestedRule":"**/dist"'))).toBe(false)
    expect(parsed.savedExcludes).not.toContain('**/dist')
    expect(parsed.excludeRules.filter((rule) => rule === '**/dist')).toHaveLength(1)
  })

  it('应该支持用户明确选择 graph.include 规则并优先于排除规则', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'dist/keep.ts', '')
    write(root, 'dist/drop.ts', '')
    write(root, '.opencode/ae.jsonc', '{ "graph": { "exclude": ["**/dist"] } }')

    const result = await aeGraphBuildTool.execute({
      mode: 'full',
      filterDecisions: { include: ['dist/keep.ts'] },
    }, createAllowExcludeContext(root))
    const parsed = JSON.parse(result as string) as { savedIncludes: string[]; includeRules: string[]; excludeRules: string[]; activeNodes: number }
    const queryResult = await aeGraphQueryTool.execute({ mode: 'filter' }, createMockContext(root))
    const query = JSON.parse(queryResult as string) as { result: { files: Array<{ relativePath: string }> } }
    const config = readFileSync(join(root, '.opencode', 'ae.jsonc'), 'utf8')

    expect(parsed.savedIncludes).toContain('dist/keep.ts')
    expect(parsed.includeRules).toContain('dist/keep.ts')
    expect(parsed.excludeRules).toContain('**/dist')
    expect(config).toContain('dist/keep.ts')
    expect(parsed.activeNodes).toBeGreaterThan(0)
    expect(query.result.files.some((file) => file.relativePath === 'dist/keep.ts')).toBe(true)
    expect(query.result.files.some((file) => file.relativePath === 'dist/drop.ts')).toBe(false)
  })

  it('filterDecisions 写入失败时应该返回可见 warning', async () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')

    const result = await aeGraphBuildTool.execute({
      mode: 'full',
      filterDecisions: { exclude: ['**/node_modules'] },
    }, createMockContext(root))
    const parsed = JSON.parse(result as string) as { savedExcludes: string[]; warnings: string[] }

    expect(parsed.savedExcludes).toEqual([])
    expect(parsed.warnings.some((warning) => warning.includes('filterDecisions 未持久化'))).toBe(true)
  })
})
