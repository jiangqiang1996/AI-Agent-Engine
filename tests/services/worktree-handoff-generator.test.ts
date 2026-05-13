import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  generateHandoffMarkdown,
  writeHandoffFile,
  type WorktreeHandoffInput,
} from '../../src/services/worktree-handoff-generator.js'

const tempRoots: string[] = []

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ae-worktree-handoff-'))
  tempRoots.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempRoots) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
  tempRoots.length = 0
})

function validInput(overrides?: Partial<WorktreeHandoffInput>): WorktreeHandoffInput {
  return {
    source_session_id: 'sess-123',
    source_worktree: 'D:\\proj\\main',
    target_worktree: 'D:\\proj\\worktrees\\feat-xyz',
    branch: 'feat/xyz',
    head: 'abc1234',
    head_message: 'feat(scope): 初始提交',
    authorization_source: '用户选择创建 worktree 并授权',
    authorization_scope: '仅授权 git worktree add',
    covered_command_args: 'git worktree add ../worktrees/feat-xyz -b feat/xyz HEAD',
    final_command_args: 'git worktree add "../worktrees/feat-xyz" -b "feat/xyz" HEAD',
    creation_result: 'Git worktree 创建成功',
    plan_path: 'docs/ae/plans/test-plan.md',
    requirements_path: 'docs/ae/brainstorms/test-req.md',
    design_borne_by_plan: true,
    execution_baseline: '必须从阶段 1 继续执行',
    verification_requirements: '交付前运行 Vitest 和 typecheck',
    ...overrides,
  }
}

describe('worktree-handoff-generator', () => {
  describe('generateHandoffMarkdown', () => {
    it('正常输入应生成完整 Markdown', () => {
      const result = generateHandoffMarkdown(validInput())
      expect('error' in result).toBe(false)
      if ('error' in result) return

      const { markdown, canonicalContinuePrompt, handoffRelPath } = result

      expect(handoffRelPath).toMatch(/^docs\/ae\/handoffs\/\d{4}-\d{2}-\d{2}-\d{6}-worktree-handoff\.md$/)
      expect(markdown).toContain('type: worktree-handoff')
      expect(markdown).toContain('status: transferred')
      expect(markdown).toContain('## A→B Startup Proof')
      expect(markdown).toContain('## Migrated Artifacts')
      expect(markdown).toContain('## Execution Baseline')
      expect(markdown).toContain('## Continue Prompt')
      expect(canonicalContinuePrompt).toContain('你现在已经位于目标 B worktree')
      expect(canonicalContinuePrompt).toContain('ae:work')
    })

    it('Continue Prompt 只出现一次', () => {
      const result = generateHandoffMarkdown(validInput())
      if ('error' in result) return
      const { markdown, canonicalContinuePrompt } = result

      const promptCount = markdown.split(canonicalContinuePrompt).length - 1
      expect(promptCount).toBe(1)
    })

    it('A→B Startup Proof 包含 continue_prompt_ref 而非重复提示词', () => {
      const result = generateHandoffMarkdown(validInput())
      if ('error' in result) return
      const { markdown } = result

      expect(markdown).toContain('continue_prompt_ref: 见 ## Continue Prompt 章节')
    })

    it('source_session_id=unavailable 且无 session_evidence 时应报错', () => {
      const result = generateHandoffMarkdown(validInput({
        source_session_id: 'unavailable',
        session_evidence: undefined,
      }))
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('session_evidence')
      }
    })

    it('source_session_id=unavailable 且有 session_evidence 时应通过', () => {
      const result = generateHandoffMarkdown(validInput({
        source_session_id: 'unavailable',
        session_evidence: '消息 ID msg-456',
      }))
      expect('error' in result).toBe(false)
      if ('error' in result) return
      expect(result.markdown).toContain('session_evidence: 消息 ID msg-456')
    })

    it('target_worktree 为空时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ target_worktree: '' }))
      expect('error' in result).toBe(true)
    })

    it('plan_path 为空时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ plan_path: '' }))
      expect('error' in result).toBe(true)
    })

    it('design_borne_by_plan=true 时应在 Migrated Artifacts 中体现', () => {
      const result = generateHandoffMarkdown(validInput({ design_borne_by_plan: true }))
      if ('error' in result) return
      expect(result.markdown).toContain('由计划文档承载')
    })

    it('design_borne_by_plan=false 且有 design_path 时应在 Migrated Artifacts 中体现', () => {
      const result = generateHandoffMarkdown(validInput({
        design_borne_by_plan: false,
        design_path: 'docs/ae/designs/test-design.md',
      }))
      if ('error' in result) return
      expect(result.markdown).toContain('docs/ae/designs/test-design.md')
    })

    it('Startup Proof 应包含所有必填字段', () => {
      const result = generateHandoffMarkdown(validInput())
      if ('error' in result) return
      const { markdown } = result

      expect(markdown).toContain('source_session_id: sess-123')
      expect(markdown).toContain('source_worktree')
      expect(markdown).toContain('target_worktree')
      expect(markdown).toContain('branch: `feat/xyz`')
      expect(markdown).toContain('head: `abc1234')
      expect(markdown).toContain('authorization_source')
      expect(markdown).toContain('authorization_scope')
      expect(markdown).toContain('covered_command_args')
      expect(markdown).toContain('final_command_args')
      expect(markdown).toContain('creation_result')
      expect(markdown).toContain('migrated_artifacts')
      expect(markdown).toContain('execution_baseline')
    })

    it('分支名前缀应被净化为 worktree 标题', () => {
      const result = generateHandoffMarkdown(validInput({ branch: 'feat/deep-refactor-graph' }))
      if ('error' in result) return
      expect(result.markdown).toContain('# Worktree Handoff: deep-refactor-graph')
    })
  })

  describe('writeHandoffFile', () => {
    it('应写入文件并返回路径和提示词', async () => {
      const targetDir = createTempDir()
      const result = await writeHandoffFile(
        validInput({ target_worktree: targetDir }),
        targetDir,
      )

      expect('error' in result).toBe(false)
      if ('error' in result) return

      expect(existsSync(result.filePath)).toBe(true)
      expect(result.filePath).toMatch(/worktree-handoff\.md$/)
      expect(result.canonicalContinuePrompt).toContain('你现在已经位于目标 B worktree')

      const content = readFileSync(result.filePath, 'utf-8')
      expect(content).toContain('type: worktree-handoff')
    })

    it('校验失败时应返回错误而不写文件', async () => {
      const targetDir = createTempDir()
      const result = await writeHandoffFile(
        validInput({ source_session_id: 'unavailable', session_evidence: undefined }),
        targetDir,
      )

      expect('error' in result).toBe(true)
    })
  })
})
