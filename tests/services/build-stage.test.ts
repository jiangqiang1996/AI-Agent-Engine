import { describe, it, expect } from 'vitest'

import { TREE_SITTER_STAGE, DOCUMENT_STAGE, ARTIFACT_STAGE } from '../../src/services/graph/build-stage.js'
import type { BuildStage, ToolDescriptor, StageResult } from '../../src/services/graph/build-stage.js'
import type { ToolchainProfile, ToolchainInfo } from '../../src/services/graph/toolchain-profile.js'

describe('BuildStage 接口类型校验', () => {
  it('应满足接口契约', () => {
    const stage: BuildStage = {
      name: 'test-stage',
      layer: 'code',
      requiredTools: [{ tool: 'test', command: 'test', detectFiles: ['test.txt'] }],
      async extract(_worktree: string, _toolchain: ToolchainProfile): Promise<StageResult> {
        return { nodes: [], relations: [], diagnostics: [] }
      },
      confidence: 'deterministic',
    }
    expect(stage.name).toBe('test-stage')
    expect(stage.layer).toBe('code')
    expect(stage.confidence).toBe('deterministic')
  })

  it('confidence 应支持 heuristic', () => {
    const stage: BuildStage = {
      name: 'heuristic-stage',
      layer: 'artifact',
      requiredTools: [],
      async extract(): Promise<StageResult> {
        return { nodes: [], relations: [], diagnostics: [] }
      },
      confidence: 'heuristic',
    }
    expect(stage.confidence).toBe('heuristic')
  })
})

describe('ToolDescriptor 结构校验', () => {
  it('应包含 tool、command 和 detectFiles', () => {
    const descriptor: ToolDescriptor = {
      tool: 'maven-cli',
      command: 'mvn',
      detectFiles: ['pom.xml'],
    }
    expect(descriptor.tool).toBe('maven-cli')
    expect(descriptor.command).toBe('mvn')
    expect(descriptor.detectFiles).toEqual(['pom.xml'])
  })
})

describe('TREE_SITTER_STAGE', () => {
  it('名称应为 tree-sitter', () => {
    expect(TREE_SITTER_STAGE.name).toBe('tree-sitter')
  })

  it('层应为 code', () => {
    expect(TREE_SITTER_STAGE.layer).toBe('code')
  })

  it('置信度应为 deterministic', () => {
    expect(TREE_SITTER_STAGE.confidence).toBe('deterministic')
  })

  it('extract 应返回空 StageResult', async () => {
    const emptyToolchain = new Map<string, ToolchainInfo>()
    const result = await TREE_SITTER_STAGE.extract('/tmp', emptyToolchain)
    expect(result.nodes).toEqual([])
    expect(result.relations).toEqual([])
    expect(result.diagnostics).toEqual([])
  })
})

describe('DOCUMENT_STAGE', () => {
  it('名称应为 document', () => {
    expect(DOCUMENT_STAGE.name).toBe('document')
  })

  it('层应为 document', () => {
    expect(DOCUMENT_STAGE.layer).toBe('document')
  })

  it('置信度应为 heuristic', () => {
    expect(DOCUMENT_STAGE.confidence).toBe('heuristic')
  })

  it('extract 应返回空 StageResult', async () => {
    const emptyToolchain = new Map<string, ToolchainInfo>()
    const result = await DOCUMENT_STAGE.extract('/tmp', emptyToolchain)
    expect(result.nodes).toEqual([])
    expect(result.relations).toEqual([])
    expect(result.diagnostics).toEqual([])
  })
})

describe('ARTIFACT_STAGE', () => {
  it('名称应为 artifact', () => {
    expect(ARTIFACT_STAGE.name).toBe('artifact')
  })

  it('层应为 artifact', () => {
    expect(ARTIFACT_STAGE.layer).toBe('artifact')
  })

  it('置信度应为 heuristic', () => {
    expect(ARTIFACT_STAGE.confidence).toBe('heuristic')
  })

  it('extract 在无工具链时应返回空结果', async () => {
    // 所有生态系统均标记为 unavailable
    const noToolchain: ToolchainProfile = new Map<string, ToolchainInfo>([
      ['npm', { available: false, command: 'npm' }],
      ['maven', { available: false, command: 'mvn' }],
    ])
    const result = await ARTIFACT_STAGE.extract('/tmp', noToolchain)
    expect(result.nodes).toEqual([])
    expect(result.relations).toEqual([])
    expect(result.diagnostics).toEqual([])
  })

  it('extract 在有可用工具链时尝试解析（可能因无真实项目返回空或部分结果）', async () => {
    const withToolchain: ToolchainProfile = new Map<string, ToolchainInfo>([
      ['npm', { available: true, version: '10.0.0', command: 'npm', manifestFile: 'package.json' }],
    ])
    const result = await ARTIFACT_STAGE.extract('/tmp', withToolchain)
    // 有可用工具链时会尝试解析，/tmp 无真实项目所以可能返回空或部分结果
    expect(result.nodes).toBeDefined()
    expect(result.relations).toBeDefined()
    expect(result.diagnostics).toBeDefined()
  })

  it('requiredTools 应包含 dependency-resolver', () => {
    expect(ARTIFACT_STAGE.requiredTools.length).toBeGreaterThan(0)
    expect(ARTIFACT_STAGE.requiredTools[0].tool).toBe('dependency-resolver')
  })
})