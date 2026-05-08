import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let worktree: string

function createTestFile(relativePath: string, content = '') {
  const absolutePath = join(worktree, relativePath)
  mkdirSync(join(absolutePath, '..'), { recursive: true })
  writeFileSync(absolutePath, content || `// ${relativePath}`)
}

beforeAll(() => {
  worktree = mkdtempSync(join(tmpdir(), 'ae-task-analyzer-test-'))

  createTestFile('src/tools/ae-review-contract.tool.ts')
  createTestFile('src/services/review-selector.ts')
  createTestFile('src/services/review-catalog.ts')
  createTestFile('src/schemas/ae-asset-schema.ts')
  createTestFile('src/utils/path-utils.ts')
  createTestFile('src/index.ts')
  createTestFile('tests/tools/ae-review-contract.tool.test.ts')
  createTestFile('tests/services/review-selector.test.ts')
  createTestFile('src/assets/skills/ae-work/SKILL.md')
  createTestFile('package.json', '{"name":"test"}')
  createTestFile('.env', 'SECRET=123')
})

afterAll(() => {
  rmSync(worktree, { recursive: true, force: true })
})

async function getTool() {
  const mod = await import('../../src/tools/ae-task-analyzer.tool.js')
  return mod.aeTaskAnalyzerTool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
  }
}

function createMockContext() {
  return {
    metadata: () => undefined,
    directory: worktree,
    sessionID: 'test-session',
    worktree,
    abort: new AbortController().signal,
  }
}

describe('ae-task-analyzer 工具', () => {
  describe('mode=scan', () => {
    it('应该从任务描述中识别候选文件并输出任务单元', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改 review-selector 和 review-catalog', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ id: string; files: Array<{ path: string }> }>; warnings: string[] }

      expect(parsed.units.length).toBeGreaterThanOrEqual(1)
      const allFiles = parsed.units.flatMap((u) => u.files.map((f) => f.path))
      expect(allFiles.some((f) => f.includes('review-selector'))).toBe(true)
      expect(allFiles.some((f) => f.includes('review-catalog'))).toBe(true)
    })

    it('应该在单文件任务时输出至少 1 个单元和 1 个并行组', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改 path-utils', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ id: string }>; parallel_groups: Array<{ id: string }> }

      expect(parsed.units.length).toBeGreaterThanOrEqual(1)
      expect(parsed.parallel_groups.length).toBeGreaterThanOrEqual(1)
    })

    it('应该在空描述时返回警告', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { warnings: string[] }

      expect(parsed.warnings.length).toBeGreaterThan(0)
      expect(parsed.warnings[0]).toContain('为空')
    })

    it('应该为每个文件标注来源为 tool_scan', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改 review-selector', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ files: Array<{ source: string }> }> }

      for (const unit of parsed.units) {
        for (const file of unit.files) {
          expect(file.source).toBe('tool_scan')
        }
      }
    })

    it('应该排除 .env 等敏感文件', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改所有文件', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ files: Array<{ path: string }> }> }
      const allFiles = parsed.units.flatMap((u) => u.files.map((f) => f.path))

      expect(allFiles.some((f) => f.includes('.env'))).toBe(false)
    })
  })

  describe('mode=plan', () => {
    it('应该在 plan_path 缺失时返回警告', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'plan', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { warnings: string[] }

      expect(parsed.warnings.length).toBeGreaterThan(0)
      expect(parsed.warnings[0]).toContain('plan_path')
    })

    it('应该在计划文件不存在时返回警告', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'plan', plan_path: 'nonexistent-plan.md', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { warnings: string[] }

      expect(parsed.warnings.length).toBeGreaterThan(0)
      expect(parsed.warnings[0]).toContain('不存在')
    })
  })

  describe('输出结构', () => {
    it('应该包含所有必需字段', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改 review-selector', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as Record<string, unknown>

      expect(parsed).toHaveProperty('units')
      expect(parsed).toHaveProperty('conflict_matrix')
      expect(parsed).toHaveProperty('parallel_groups')
      expect(parsed).toHaveProperty('execution_order')
      expect(parsed).toHaveProperty('warnings')
    })

    it('应该为每个单元包含 suggested_validation', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改 review-selector', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ suggested_validation: string[] }> }

      for (const unit of parsed.units) {
        expect(unit.suggested_validation).toBeDefined()
        expect(Array.isArray(unit.suggested_validation)).toBe(true)
      }
    })
  })
})
