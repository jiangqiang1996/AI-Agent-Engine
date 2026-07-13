import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { aeWorktreeHandoffTool } from '../../src/tools/ae-worktree-handoff.tool.js'

interface ToolLike {
  execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string>
}

const tempRoots: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ae-worktree-handoff-tool-'))
  tempRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempRoots) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
  tempRoots.length = 0
})

describe('ae-worktree-handoff 工具', () => {
  it('应该公开图谱和 AE 项目配置路径参数', () => {
    const tool = aeWorktreeHandoffTool as unknown as { args: Record<string, unknown> }

    expect(tool.args.graph_path).toBeDefined()
    expect(tool.args.ae_config_path).toBeDefined()
    expect(tool.args.design_path).toBeDefined()
  })

  it('应该在 design_path 为空字符串时拒绝执行', async () => {
    const targetDir = createTempDir()
    const tool = aeWorktreeHandoffTool as unknown as ToolLike
    const output = await tool.execute({
      source_session_id: 'sess-123',
      source_worktree: 'D:\\proj\\main',
      target_worktree: targetDir,
      branch: 'feat/test',
      head: 'abc1234',
      head_message: 'test',
      authorization_source: 'test',
      authorization_scope: 'test',
      covered_command_args: 'test',
      final_command_args: 'test',
      creation_result: 'test',
      design_path: '',
      execution_baseline: 'test',
      verification_requirements: 'test',
    }, { metadata: () => {} })

    expect(output).toContain('design_path 和 task_brief 至少传入一个')
  })

  it('应该在 design_path 为纯空白时拒绝执行', async () => {
    const targetDir = createTempDir()
    const tool = aeWorktreeHandoffTool as unknown as ToolLike
    const output = await tool.execute({
      source_session_id: 'sess-123',
      source_worktree: 'D:\\proj\\main',
      target_worktree: targetDir,
      branch: 'feat/test',
      head: 'abc1234',
      head_message: 'test',
      authorization_source: 'test',
      authorization_scope: 'test',
      covered_command_args: 'test',
      final_command_args: 'test',
      creation_result: 'test',
      design_path: '   ',
      execution_baseline: 'test',
      verification_requirements: 'test',
    }, { metadata: () => {} })

    expect(output).toContain('design_path 和 task_brief 至少传入一个')
  })

  it('应该把图谱和 AE 项目配置路径转发到交接文件', async () => {
    const targetDir = createTempDir()
    const tool = aeWorktreeHandoffTool as unknown as ToolLike
    const output = await tool.execute({
      source_session_id: 'sess-123',
      source_worktree: 'D:\\proj\\main',
      target_worktree: targetDir,
      branch: 'feat/graph-config',
      head: 'abc1234',
      head_message: 'feat(scope): 初始提交',
      authorization_source: '用户选择创建 worktree 并授权',
      authorization_scope: '仅授权 git worktree add',
      covered_command_args: 'git worktree add ../worktrees/feat-graph-config -b feat/graph-config HEAD',
      final_command_args: 'git worktree add "../worktrees/feat-graph-config" -b "feat/graph-config" HEAD',
      creation_result: 'Git worktree 创建成功',
      design_path: 'ae/designs/test/design.md',
      graph_path: 'ae/graphs/',
      ae_config_path: '.opencode/ae.jsonc',
      execution_baseline: '必须从阶段 1 继续执行',
      verification_requirements: '交付前运行 Vitest 和 typecheck',
    }, { metadata: () => {} })

    expect(output).toContain('✅ 交接文件已生成并写入。')
    const match = output.match(/文件路径：(.+)/)
    expect(match).not.toBeNull()
    if (match === null) return

    const content = readFileSync(match[1].trim(), 'utf-8')
    expect(content).toContain('- graph: `ae/graphs/`')
    expect(content).toContain('- ae_config: `.opencode/ae.jsonc`')
    expect(content).toContain('  - graph: `ae/graphs/`')
    expect(content).toContain('  - ae_config: `.opencode/ae.jsonc`')
  })
})
