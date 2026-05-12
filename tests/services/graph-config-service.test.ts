import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadGraphConfig, resolveGraphConfigPath, saveGraphExcludeRule } from '../../src/services/graph-config-service.js'

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

    expect(loadGraphConfig(root)).toEqual({ exclude: ['dist'] })
  })

  it('应该通过 ae.jsonc 公共优先级读取内置 graph.exclude 配置', () => {
    const root = createTempRoot()
    const builtinConfigPath = join(root, 'src', 'assets', 'config', 'ae.jsonc')
    mkdirSync(join(builtinConfigPath, '..'), { recursive: true })
    writeFileSync(builtinConfigPath, '{ "graph": { "exclude": ["dist"] } }')

    expect(loadGraphConfig(root, builtinConfigPath)).toEqual({ exclude: ['dist'] })
  })

  it('应该在 ae.jsonc 不存在时返回空排除规则并可保存新规则', () => {
    const root = createTempRoot()

    expect(loadGraphConfig(root)).toEqual({ exclude: [] })
    expect(saveGraphExcludeRule(root, 'node_modules')).toEqual({ exclude: ['node_modules'] })
    expect(loadGraphConfig(root)).toEqual({ exclude: ['node_modules'] })
  })

  it('应该在 JSONC 解析失败时返回明确错误', () => {
    const root = createTempRoot()
    const configPath = resolveGraphConfigPath(root)
    mkdirSync(join(configPath, '..'), { recursive: true })
    writeFileSync(configPath, '{')

    expect(() => loadGraphConfig(root)).toThrow(/项目级 builtin-opencode 配置解析失败/)
  })

  it('应该去重并保存 graph.exclude 规则', () => {
    const root = createTempRoot()

    expect(saveGraphExcludeRule(root, 'dist')).toEqual({ exclude: ['dist'] })
    expect(saveGraphExcludeRule(root, 'dist')).toEqual({ exclude: ['dist'] })
  })
})
