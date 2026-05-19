import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  collectGraphFilterCandidateSummary,
  collectMissingGraphFilterSuggestions,
  getGraphPathDecision,
} from '../../src/services/graph-filter-suggestion-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-filter-'))
  tempRoots.push(root)
  return root
}

function write(root: string, relativePath: string, content: string): void {
  const absolutePath = join(root, relativePath)
  mkdirSync(join(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, content)
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('graph-filter-suggestion-service', () => {
  it('应该让安全硬排除优先于 include 规则', () => {
    expect(getGraphPathDecision('.env', { include: ['.env'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('ae/graphs/graph.json', { include: ['ae/graphs/graph.json'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('ae/gates/proof.json', { include: ['ae/gates/proof.json'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('ae/handoffs/test-worktree-handoff.md', { include: ['ae/handoffs/test-worktree-handoff.md'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('ae/reviews/run/metadata.json', { include: ['ae/reviews/run/metadata.json'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('ae/agent-browser-proof.json', { include: ['ae/agent-browser-proof.json'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('ae/static-server/.static-server-info.json', { include: ['ae/static-server/.static-server-info.json'], exclude: [] }).hardExcluded).toBe(true)
    expect(getGraphPathDecision('src/logo.png', { include: ['src/logo.png'], exclude: [] }).hardExcluded).toBe(true)
  })

  it('应该基于 target 原始文件范围返回候选统计', () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'src/logo.svg', '<svg />')
    write(root, 'dist/bundle.js', '')
    write(root, 'dist/icon.svg', '<svg />')
    write(root, 'src/image.png', 'image')

    const summary = collectGraphFilterCandidateSummary(root, join(root, 'src'), { exclude: [] })

    expect(summary.scopeRoot).toBe('src')
    expect(summary.rawFileCount).toBe(3)
    expect(summary.candidateFileCount).toBe(2)
    expect(summary.parseableFileCount).toBe(1)
    expect(summary.hardExcludedFileCount).toBe(1)
    expect(summary.extensionCandidates.some((candidate) => candidate.value === '.svg' && candidate.count === 1)).toBe(true)
    expect(summary.pathSegmentCandidates).toEqual([])
  })

  it('应该只统计 target 内的变更文件候选', () => {
    const root = createTempRoot()
    write(root, 'src/a.ts', '')
    write(root, 'src/logo.svg', '<svg />')
    write(root, 'other/logo.svg', '<svg />')

    const summary = collectGraphFilterCandidateSummary(root, join(root, 'src'), { exclude: [] }, ['src/logo.svg', 'other/logo.svg'])

    expect(summary.rawFileCount).toBe(1)
    expect(summary.extensionCandidates.map((candidate) => candidate.examples)).toEqual([['src/logo.svg']])
  })

  it('应该返回未被配置覆盖的固定过滤建议', () => {
    const root = createTempRoot()
    write(root, 'node_modules/pkg/index.js', '')
    write(root, 'dist/a.ts', '')
    write(root, 'src/a.ts', '')

    const suggestions = collectMissingGraphFilterSuggestions(root, { exclude: ['**/dist'] })

    expect(suggestions.some((suggestion) => suggestion.rule === '**/node_modules')).toBe(true)
    expect(suggestions.some((suggestion) => suggestion.rule === '**/dist')).toBe(false)
  })

  it('不应该让 ae 运行产物进入候选统计或可解析集合', () => {
    const root = createTempRoot()
    write(root, 'ae/gates/proof.json', '{}')
    write(root, 'ae/handoffs/test-worktree-handoff.md', '# handoff')
    write(root, 'ae/reviews/run/metadata.json', '{}')
    write(root, 'ae/agent-browser-proof.json', '{}')
    write(root, 'ae/static-server/.static-server-info.json', '{}')
    write(root, 'ae/plans/test-plan.md', '# plan')

    const summary = collectGraphFilterCandidateSummary(root, root, { include: ['ae/gates/proof.json'], exclude: [] })

    expect(summary.rawFileCount).toBe(2)
    expect(summary.hardExcludedFileCount).toBe(1)
    expect(summary.candidateFileCount).toBe(1)
    expect(summary.parseableFileCount).toBe(1)
    expect(summary.extensionCandidates).toEqual([])
  })

  it('应该拒绝不存在或工作区外的 target', () => {
    const root = createTempRoot()
    const outside = createTempRoot()
    write(root, 'src/a.ts', '')
    write(outside, 'outside.ts', '')

    expect(() => collectGraphFilterCandidateSummary(root, join(root, 'missing'), { exclude: [] })).toThrow()
    expect(() => collectGraphFilterCandidateSummary(root, outside, { exclude: [] })).toThrow('目标路径不在当前工作区内')
  })
})
