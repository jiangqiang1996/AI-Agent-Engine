import { describe, it, expect, beforeAll } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const outputPath = join(repoRoot, 'docs', 'ae', 'asset-graph.md')

describe('资产可达性图谱集成测试', () => {
  let output: string

  beforeAll(async () => {
    const distDir = join(repoRoot, 'dist', 'src')
    if (!existsSync(distDir)) {
      throw new Error('编译产物不存在，请先运行 npm run build')
    }

    // @ts-expect-error .mjs 脚本无类型声明
    const { generateAssetGraph } = await import('../scripts/asset-graph.mjs')
    await generateAssetGraph()

    expect(existsSync(outputPath)).toBe(true)
    output = readFileSync(outputPath, 'utf8')
  })

  it('应该生成包含 Mermaid 代码块的文档', () => {
    const mermaidBlocks = output.match(/```mermaid\n[\s\S]*?\n```/g)
    expect(mermaidBlocks).not.toBeNull()
    expect(mermaidBlocks!.length).toBeGreaterThanOrEqual(3)
  })

  it('应该包含五类风险诊断标题', () => {
    expect(output).toContain('unreachable')
    expect(output).toContain('broken-ref')
    expect(output).toContain('duplicate-entry')
    expect(output).toContain('deprecated')
    expect(output).toContain('low-reach')
  })

  it('应该将 ae:document-review 标记为 deprecated', () => {
    expect(output).toContain('ae:document-review')
    expect(output).toContain('deprecated')
    const deprecatedSection = output.match(/### 4\.\d+ deprecated[\s\S]*?\*\*已检查数据源/)?.[0]
    expect(deprecatedSection).toContain('ae:document-review')
  })

  it('应该将 gilded 代理标记为 low-reach', () => {
    expect(output).toContain('design-iterator')
    expect(output).toContain('figma-design-sync')
    const lowReachSection = output.match(/### 4\.\d+ low-reach[\s\S]*?\*\*已检查数据源/)?.[0]
    expect(lowReachSection).toContain('gilded')
  })

  it('应该检测到 ae-static-preview 幽灵目录', () => {
    const brokenRefSection = output.match(/### 4\.\d+ broken-ref[\s\S]*?\*\*已检查数据源/)?.[0]
    expect(brokenRefSection).toContain('ae-static-preview')
    expect(brokenRefSection).toContain('orphan-directory')
  })

  it('应该包含鲜度声明', () => {
    expect(output).toContain('生成时间')
    expect(output).toContain('npm run asset-graph')
  })

  it('应该区分已覆盖和未覆盖数据源', () => {
    expect(output).toContain('已覆盖数据源')
    expect(output).toContain('未覆盖数据源')
    expect(output).toContain('SKILL.md 正文')
    expect(output).toContain('未覆盖 ≠ 确认安全')
  })

  it('代理可达性表应包含全部 26 个代理', () => {
    const agentTableMatch = output.match(/## 5\. 代理可达性表[\s\S]*?## 6\./)
    expect(agentTableMatch).not.toBeNull()
    const agentRows = agentTableMatch![0].match(/\| \w+-\w+.*\|/g)
    expect(agentRows!.length).toBeGreaterThanOrEqual(26)
  })

  it('Mermaid 子图 ID 不包含特殊字符', () => {
    const mermaidBlocks = output.match(/```mermaid\n([\s\S]*?)\n```/g) || []
    for (const block of mermaidBlocks) {
      const nodeIds = block.match(/^\s+([a-zA-Z_]\w*)\[/gm) || []
      for (const id of nodeIds) {
        const cleaned = id.trim().replace(/\[$/, '')
        expect(cleaned).not.toContain(':')
        expect(cleaned).not.toContain('.')
      }
    }
  })
})
