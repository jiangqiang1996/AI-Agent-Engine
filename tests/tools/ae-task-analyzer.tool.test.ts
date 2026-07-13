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

  describe('mode=design', () => {
    it('应该在 design_path 缺失时返回警告', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { warnings: string[] }

      expect(parsed.warnings.length).toBeGreaterThan(0)
      expect(parsed.warnings[0]).toContain('design_path')
    })

    it('应该在设计文件不存在时返回警告', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', design_path: 'nonexistent-design.md', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { warnings: string[] }

      expect(parsed.warnings.length).toBeGreaterThan(0)
      expect(parsed.warnings[0]).toContain('不存在')
    })

    it('应该解析无标题单元并归一化文件路径', async () => {
      createTestFile('docs/design-no-title.md', [
        '- [ ] **单元 1：**',
        '  **文件**：',
        '  - `./src/tools/../tools/ae-task-analyzer.tool.ts`',
        '  **验证**：',
        '  - `npm run typecheck`',
      ].join('\n'))

      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', design_path: 'docs/design-no-title.md', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ description: string; files: Array<{ path: string }> }> }

      expect(parsed.units).toHaveLength(1)
      expect(parsed.units[0].description).toBe('单元 1')
      expect(parsed.units[0].files[0].path).toBe('src/tools/ae-task-analyzer.tool.ts')
    })

    it('应该拒绝越出工作区的设计路径', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', design_path: '../outside-design.md', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: unknown[]; warnings: string[] }

      expect(parsed.units).toHaveLength(0)
      expect(parsed.warnings[0]).toContain('必须是仓库相对路径')
    })

    it('应该拒绝绝对设计路径', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', design_path: join(worktree, 'docs/design-no-title.md'), worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: unknown[]; warnings: string[] }

      expect(parsed.units).toHaveLength(0)
      expect(parsed.warnings[0]).toContain('必须是仓库相对路径')
    })

    it('应该拒绝跨平台绝对或盘符设计路径', async () => {
      const tool = await getTool()

      for (const designPath of ['/tmp/design.md', 'C:secret.md', 'C:\\secret.md', '\\\\server\\share\\design.md']) {
        const result = await tool.execute(
          { mode: 'design', design_path: designPath, worktree },
          createMockContext(),
        )
        const parsed = JSON.parse(result) as { units: unknown[]; warnings: string[] }

        expect(parsed.units).toHaveLength(0)
        expect(parsed.warnings[0]).toContain('必须是仓库相对路径')
      }
    })

    it('应该忽略设计中的绝对路径和越界文件路径', async () => {
      createTestFile('docs/design-invalid-files.md', [
        '- [ ] **单元 1：** 路径校验',
        '  **文件**：',
        '  - `../secret.ts`',
        '  - `..\\secret.ts`',
        '  - `/tmp/secret.ts`',
        '  - `C:/secret.ts`',
        '  - `C:secret.ts`',
        '  - `C:\\secret.ts`',
        '  - `\\\\server\\share\\secret.ts`',
        '  - `src/tools/ae-task-analyzer.tool.ts`',
      ].join('\n'))

      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', design_path: 'docs/design-invalid-files.md', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as { units: Array<{ files: Array<{ path: string }> }>; warnings: string[] }

      expect(parsed.units[0].files.map((file) => file.path)).toEqual(['src/tools/ae-task-analyzer.tool.ts'])
      expect(parsed.warnings.some((warning) => warning.includes('已忽略无效或越界文件路径'))).toBe(true)
    })

    it('应该把共享配置资源识别为冲突', async () => {
      createTestFile('docs/plan-shared-config.md', [
        '- [ ] **单元 1：** 修改配置一',
        '  **文件**：',
        '  - `tsconfig.json`',
        '- [ ] **单元 2：** 修改配置二',
        '  **文件**：',
        '  - `tsconfig.build.json`',
      ].join('\n'))

      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'design', design_path: 'docs/plan-shared-config.md', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as {
        conflict_matrix: Array<{ shared_files: string[] }>
        parallel_groups: Array<{ is_parallel_safe: boolean; unit_ids: string[] }>
      }

      expect(parsed.conflict_matrix[0].shared_files).toContain('<shared-resource:typescript-config>')
      expect(parsed.parallel_groups.every((group) => group.is_parallel_safe)).toBe(true)
      expect(parsed.parallel_groups.every((group) => group.unit_ids.length === 1)).toBe(true)
    })

    it('应该识别多类共享资源冲突', async () => {
      const cases = [
        ['package.json', 'package-lock.json', '<shared-resource:package-or-lockfile>'],
        ['src/db/migrations/001.sql', 'src/db/migrations/002.sql', '<shared-resource:migration>'],
        ['tests/fixtures/user.json', 'tests/__fixtures__/org.json', '<shared-resource:test-fixture>'],
        ['dist/index.js', 'build/index.js', '<shared-resource:generated-output>'],
      ]

      const tool = await getTool()

      for (const [fileA, fileB, expectedConflict] of cases) {
        const designPath = `docs/design-shared-${expectedConflict.replace(/[^a-z-]/g, '')}.md`
        createTestFile(designPath, [
          '- [ ] **单元 1：** 修改共享资源一',
          '  **文件**：',
          `  - \`${fileA}\``,
          '- [ ] **单元 2：** 修改共享资源二',
          '  **文件**：',
          `  - \`${fileB}\``,
        ].join('\n'))

        const result = await tool.execute(
          { mode: 'design', design_path: designPath, worktree },
          createMockContext(),
        )
        const parsed = JSON.parse(result) as { conflict_matrix: Array<{ shared_files: string[] }> }

        expect(parsed.conflict_matrix[0].shared_files).toContain(expectedConflict)
      }
    })
  })

  describe('输出结构', () => {
    const requiredFields = ['units', 'conflict_matrix', 'parallel_groups', 'execution_order', 'warnings']

    it('应该包含所有必需字段', async () => {
      const tool = await getTool()
      const result = await tool.execute(
        { mode: 'scan', task_description: '修改 review-selector', worktree },
        createMockContext(),
      )
      const parsed = JSON.parse(result) as Record<string, unknown>

      for (const field of requiredFields) {
        expect(parsed).toHaveProperty(field)
      }
    })

    it('应该在 design 模式成功和错误路径都保持输出字段完整', async () => {
      createTestFile('docs/design-output-contract.md', [
        '- [ ] **单元 1：** 输出契约',
        '  **文件**：',
        '  - `src/tools/ae-task-analyzer.tool.ts`',
      ].join('\n'))

      const tool = await getTool()
      const results = await Promise.all([
        tool.execute({ mode: 'design', design_path: 'docs/design-output-contract.md', worktree }, createMockContext()),
        tool.execute({ mode: 'design', design_path: '../outside-design.md', worktree }, createMockContext()),
      ])

      for (const result of results) {
        const parsed = JSON.parse(result) as Record<string, unknown>
        for (const field of requiredFields) {
          expect(parsed).toHaveProperty(field)
        }
      }
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
