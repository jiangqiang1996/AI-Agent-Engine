import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  loadGraphConfig,
  matchGraphExcludePath,
  matchGraphPath,
  resolveGraphConfigPath,
  saveGraphIncludeRule,
  saveGraphExcludeRule,
} from '../../src/services/graph-config-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-graph-config-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('graph-config-service', () => {
  it('应该读取已有 graph.exclude 配置', () => {
    const root = createTempRoot()
    const configPath = resolveGraphConfigPath(root)
    mkdirSync(join(configPath, '..'), { recursive: true })
    writeFileSync(configPath, '{ // comment\n "graph": { "exclude": ["dist"] } }')

    expect(loadGraphConfig(root)).toEqual({ include: [], exclude: ['dist'] })
  })

  it('应该通过 ae.jsonc 公共优先级读取内置 graph.exclude 配置', () => {
    const root = createTempRoot()
    const builtinConfigPath = join(root, 'src', 'assets', 'config', 'ae.jsonc')
    mkdirSync(join(builtinConfigPath, '..'), { recursive: true })
    writeFileSync(builtinConfigPath, '{ "graph": { "exclude": ["dist"] } }')

    expect(loadGraphConfig(root, builtinConfigPath)).toEqual({ include: [], exclude: ['dist'] })
  })

  it('内置 ae.jsonc 默认应该排除迁移后的图谱产物目录', () => {
    expect(loadGraphConfig(process.cwd())).toEqual(expect.objectContaining({
      exclude: expect.arrayContaining(['ae/graphs']),
    }))
  })

  it('应该按 builtin-opencode 优先级覆盖 graph 配置', () => {
    const root = createTempRoot()
    const builtinConfigPath = join(root, 'src', 'assets', 'config', 'ae.jsonc')
    const projectConfigPath = resolveGraphConfigPath(root)
    mkdirSync(join(builtinConfigPath, '..'), { recursive: true })
    mkdirSync(join(projectConfigPath, '..'), { recursive: true })
    writeFileSync(builtinConfigPath, '{ "graph": { "include": ["src/generated/keep.ts"], "exclude": ["**/dist", "**/node_modules"] } }')
    writeFileSync(projectConfigPath, '{ "graph": { "include": ["src/generated/keep.ts", "src/generated/manual.ts"], "exclude": ["ae/graphs", "**/dist"] } }')

    expect(loadGraphConfig(root, builtinConfigPath)).toEqual({
      include: ['src/generated/keep.ts', 'src/generated/manual.ts'],
      exclude: ['ae/graphs', '**/dist'],
    })
  })

  it('保存规则时应该把内置层已有规则作为去重基线', () => {
    const root = createTempRoot()
    const builtinConfigPath = join(root, 'src', 'assets', 'config', 'ae.jsonc')
    mkdirSync(join(builtinConfigPath, '..'), { recursive: true })
    writeFileSync(builtinConfigPath, '{ "graph": { "exclude": ["**/node_modules"] } }')

    expect(loadGraphConfig(root, builtinConfigPath)).toEqual({ include: [], exclude: ['**/node_modules'] })
    expect(saveGraphExcludeRule(root, '**/node_modules', builtinConfigPath)).toEqual({ include: [], exclude: ['**/node_modules'] })
  })

  it('应该在 ae.jsonc 不存在时返回内置排除规则并可保存新规则', () => {
    const root = createTempRoot()

    expect(loadGraphConfig(root)).toEqual({ include: [], exclude: ['ae/graphs'] })
    expect(saveGraphExcludeRule(root, 'node_modules')).toEqual({ include: [], exclude: ['node_modules'] })
    expect(loadGraphConfig(root)).toEqual({ include: [], exclude: ['node_modules'] })
  })

  it('应该在 JSONC 解析失败时返回明确错误', () => {
    const root = createTempRoot()
    const configPath = resolveGraphConfigPath(root)
    mkdirSync(join(configPath, '..'), { recursive: true })
    writeFileSync(configPath, '{')

    expect(() => loadGraphConfig(root)).toThrow(/项目级 ae.jsonc 解析失败/)
  })

  it('应该去重并保存 graph.exclude 规则', () => {
    const root = createTempRoot()

    expect(saveGraphExcludeRule(root, 'dist')).toEqual({ include: [], exclude: ['dist'] })
    expect(saveGraphExcludeRule(root, 'dist')).toEqual({ include: [], exclude: ['dist'] })
  })

  it('应该按 glob 语义匹配星号、路径和目录，且不特殊处理否定规则', () => {
    const rules = ['**/dist', '**/*.log', 'ae/graphs', '!packages/app/dist/keep.ts']

    expect(matchGraphExcludePath('dist', rules, true)).toEqual({ excluded: true, matchedRule: '**/dist' })
    expect(matchGraphExcludePath('packages/app/dist/index.js', rules)).toEqual({ excluded: true, matchedRule: '**/dist' })
    expect(matchGraphExcludePath('logs/app.log', rules)).toEqual({ excluded: true, matchedRule: '**/*.log' })
    expect(matchGraphExcludePath('ae/graphs/graph.json', rules)).toEqual({ excluded: true, matchedRule: 'ae/graphs' })
    expect(matchGraphExcludePath('packages/app/dist/keep.ts', rules)).toEqual({ excluded: true, matchedRule: '**/dist' })
  })

  it('应该让 graph.include 优先于 graph.exclude', () => {
    const config = { include: ['packages/app/dist/keep.ts'], exclude: ['**/dist'] }

    expect(matchGraphPath('packages/app/dist/keep.ts', config)).toEqual({
      included: true,
      excluded: false,
      covered: true,
      matchedInclude: 'packages/app/dist/keep.ts',
    })
    expect(matchGraphPath('packages/app/dist/drop.ts', config)).toEqual({
      included: false,
      excluded: true,
      covered: true,
      matchedExclude: '**/dist',
    })
  })

  it('应该最小编辑项目级 ae.jsonc 并保留注释和无关配置', () => {
    const root = createTempRoot()
    const configPath = resolveGraphConfigPath(root)
    mkdirSync(join(configPath, '..'), { recursive: true })
    writeFileSync(configPath, '{\n  // keep comment\n  "mcp": { "demo": { "enabled": true } },\n  "graph": {\n    "exclude": [\n      "**/dist"\n    ]\n  }\n}\n')

    expect(saveGraphIncludeRule(root, 'packages/app/dist/keep.ts')).toEqual({
      include: ['packages/app/dist/keep.ts'],
      exclude: ['**/dist'],
    })
    const raw = readFileSync(configPath, 'utf8')

    expect(raw).toContain('// keep comment')
    expect(raw).toContain('"mcp"')
    expect(raw).toContain('packages/app/dist/keep.ts')
  })
})
