import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    requirements_path: 'ae/prds/test-req.md',
    design_path: 'ae/designs/test/design.md',
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

      const { markdown, handoffRelPath } = result

      expect(handoffRelPath).toMatch(/^ae\/handoffs\/\d{4}-\d{2}-\d{2}-\d{9}-worktree-handoff\.md$/)
      expect(markdown).toContain('type: worktree-handoff')
      expect(markdown).toContain('status: transferred')
      expect(markdown).toContain('## A→B Startup Proof')
      expect(markdown).toContain('## Migrated Artifacts')
      expect(markdown).toContain('## Execution Baseline')
      expect(markdown).toContain('resume_entrypoint: ae:work')
    })

    it('应生成唯一续执行入口字段', () => {
      const result = generateHandoffMarkdown(validInput())
      if ('error' in result) return
      const { markdown } = result

      expect(markdown.match(/resume_entrypoint: ae:work/g)).toHaveLength(1)
    })

    it('A→B Startup Proof 包含 resume_entrypoint', () => {
      const result = generateHandoffMarkdown(validInput())
      if ('error' in result) return
      const { markdown } = result

      expect(markdown).toContain('resume_entrypoint: ae:work ae/handoffs/')
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

    it('无需求文档时不应在交接文件中提及需求文件', () => {
      const result = generateHandoffMarkdown(validInput({
        requirements_path: undefined,
      }))
      expect('error' in result).toBe(false)
      if ('error' in result) return

      expect(result.markdown).not.toContain('- requirements:')
      expect(result.markdown).not.toContain('  - requirements:')
      expect(result.markdown).toContain('- design:')
      expect(result.markdown).toContain('设计文档是本次执行的实现基线')
    })

    it('design_path 为空时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ design_path: '', task_brief: undefined }))
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('design_path')
      }
    })

    it('design_path 为空白时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ design_path: '   ' }))
      expect('error' in result).toBe(true)
      if ('error' in result) {
        expect(result.error).toContain('design_path')
      }
    })

    it('source_worktree 为空时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ source_worktree: '' }))
      expect('error' in result).toBe(true)
    })

    it('authorization_scope 为空白时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ authorization_scope: '   ' }))
      expect('error' in result).toBe(true)
    })

    it('final_command_args 为空白时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ final_command_args: '  ' }))
      expect('error' in result).toBe(true)
    })

    it('verification_requirements 为空白时应报错', () => {
      const result = generateHandoffMarkdown(validInput({ verification_requirements: ' ' }))
      expect('error' in result).toBe(true)
    })

    it('有图谱和 AE 配置路径时应在迁移产物中体现', () => {
      const result = generateHandoffMarkdown(validInput({
        graph_path: 'ae/graphs/',
        ae_config_path: '.opencode/ae.jsonc',
      }))
      if ('error' in result) return

      expect(result.markdown).toContain('- graph: `ae/graphs/`')
      expect(result.markdown).toContain('- ae_config: `.opencode/ae.jsonc`')
      expect(result.markdown).toContain('  - graph: `ae/graphs/`')
      expect(result.markdown).toContain('  - ae_config: `.opencode/ae.jsonc`')
    })

    it('无图谱和 AE 配置路径时不应在交接文件中提及这些产物', () => {
      const result = generateHandoffMarkdown(validInput({
        graph_path: '   ',
        ae_config_path: '',
      }))
      if ('error' in result) return

      expect(result.markdown).not.toContain('- graph:')
      expect(result.markdown).not.toContain('- ae_config:')
      expect(result.markdown).not.toContain('  - graph:')
      expect(result.markdown).not.toContain('  - ae_config:')
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
      expect(markdown).toContain('resume_entrypoint')
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
      )

      expect('error' in result).toBe(false)
      if ('error' in result) return

      expect(existsSync(result.filePath)).toBe(true)
      expect(result.filePath).toMatch(/worktree-handoff\.md$/)
      expect(result.userInstruction).toContain('执行已转移到新的 B worktree')
      const handoffRelPath = result.filePath.replace(`${targetDir}\\`, '').replace(/\\/g, '/')
      expect(result.userInstruction).toContain('调用 ae:work，并把交接文件作为唯一任务输入')
      expect(result.userInstruction).toContain(`/ae-work-continue ${handoffRelPath}`)
      expect(result.userInstruction).not.toContain('验证要求：')

      const content = readFileSync(result.filePath, 'utf-8')
      expect(content).toContain('type: worktree-handoff')
    })

    it('校验失败时应返回错误而不写文件', async () => {
      const targetDir = createTempDir()
      const result = await writeHandoffFile(
        validInput({ source_session_id: 'unavailable', session_evidence: undefined, target_worktree: targetDir }),
      )

      expect('error' in result).toBe(true)
    })
  })
})
