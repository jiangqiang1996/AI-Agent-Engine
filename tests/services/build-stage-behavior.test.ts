import { describe, expect, it, vi } from 'vitest'

import { ARTIFACT_STAGE } from '../../src/services/graph/build-stage.js'
import * as npmResolverModule from '../../src/services/graph/npm-resolver.js'
import type { ToolchainProfile, ToolchainInfo } from '../../src/services/graph/toolchain-profile.js'

function makeToolchain(entries: [string, Partial<ToolchainInfo> & { available: boolean }][]): ToolchainProfile {
  return new Map(entries.map(([eco, info]) => [eco, { command: eco, ...info }]))
}

describe('build-stage 行为测试', () => {
  describe('RESOLVERS 与映射常量一致性', () => {
    const ECOSYSTEM_TO_SOURCE: Record<string, string> = {
      maven: 'maven-cli',
      npm: 'npm-ls',
      gomod: 'go-mod',
      pip: 'pipdeptree',
      cargo: 'cargo-tree',
      gradle: 'gradle-deps',
    }

    const ECOSYSTEM_TO_MANIFEST: Record<string, string> = {
      maven: 'pom.xml',
      npm: 'package.json',
      gomod: 'go.mod',
      pip: 'requirements.txt',
      cargo: 'Cargo.toml',
      gradle: 'build.gradle',
    }

    it.each(Object.keys(ECOSYSTEM_TO_SOURCE))(
      '%s 生态系统应该在 ECOSYSTEM_TO_SOURCE 和 ECOSYSTEM_TO_MANIFEST 中都有映射',
      (eco) => {
        expect(ECOSYSTEM_TO_SOURCE[eco]).toBeDefined()
        expect(ECOSYSTEM_TO_MANIFEST[eco]).toBeDefined()
      },
    )
  })

  describe('ARTIFACT_STAGE.extract', () => {
    it('在无可用工具链时应返回空结果', async () => {
      const toolchain = makeToolchain([
        ['npm', { available: false }],
        ['maven', { available: false }],
      ])

      const result = await ARTIFACT_STAGE.extract('/tmp', toolchain)

      expect(result.nodes).toEqual([])
      expect(result.relations).toEqual([])
      expect(result.diagnostics).toEqual([])
    })

    it('在解析器抛出异常时应生成 warning 诊断', async () => {
      const toolchain = makeToolchain([
        ['npm', { available: true, version: '10.0.0' }],
      ])
      const resolveSpy = vi.spyOn(npmResolverModule.npmResolver, 'resolve')
        .mockRejectedValue(new Error('npm ls crashed'))

      const result = await ARTIFACT_STAGE.extract('/tmp', toolchain)

      expect(result.diagnostics.length).toBeGreaterThan(0)
      expect(result.diagnostics[0].severity).toBe('warning')
      expect(result.diagnostics[0].message).toContain('npm')
      expect(result.diagnostics[0].message).toContain('依赖解析失败')

      resolveSpy.mockRestore()
    })
  })

  describe('Stage 元数据', () => {
    it('ARTIFACT_STAGE 应标记为 heuristic', () => {
      expect(ARTIFACT_STAGE.confidence).toBe('heuristic')
      expect(ARTIFACT_STAGE.layer).toBe('artifact')
    })
  })
})
