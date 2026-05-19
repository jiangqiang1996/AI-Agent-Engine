import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')
const startupWorkflowText = readFileSync('src/assets/skills/ae-work/references/startup-and-worktree-workflow.md', 'utf8')
const worktreeContractText = `${skillText}\n${startupWorkflowText}`

function expectTextIncludes(text: string, phrases: string[]): void {
  for (const phrase of phrases) {
    expect(text).toContain(phrase)
  }
}

describe('ae:work worktree 启动文本契约', () => {
  it('应该要求修改文件前完成输入分流、Git 状态检查和 worktree 决策', () => {
    expectTextIncludes(worktreeContractText, [
      '修改任何项目文件之前，必须完成输入分流、Git 状态检查和 worktree 决策',
      'git status --short',
      'git branch --show-current',
      'git log --oneline -1',
      '非 Git 场景不得伪造 branch 或 HEAD',
    ])
  })

  it('应该解析三种 worktree 模式并支持 --no-worktree 兼容输入', () => {
    expectTextIncludes(startupWorkflowText, [
      '检查调用方是否显式传入 `worktree`、`current-worktree`、`auto`',
      '兼容输入 `--no-worktree` 映射为 `current-worktree`',
      '每次正式实现型任务在修改项目文件前，都必须先解析 worktree 模式',
    ])
  })

  it('应该要求单独使用 ae:work 且未传模式时明确询问', () => {
    expectTextIncludes(startupWorkflowText, [
      '单独使用 `ae:work` 且未显式传入 worktree 模式时',
      '必须基于任务上下文给出推荐依据并明确询问是否创建新的 worktree',
      '不得自行推断或默认采用 `auto`',
    ])
  })

  it('应该记录 auto 模式推荐依据和 S3/S4 分流', () => {
    expectTextIncludes(startupWorkflowText, [
      '显式 `auto` 模式复用阶段 0 的 S3/S4 分流和强制升级停点作为推荐依据',
      'S3 轻量修复',
      '预计不超过 2 个生产文件',
      '推荐 `current-worktree`',
      'S4 多步骤实现',
      '10+ 文件',
      '推荐 `worktree`',
      '最终 gate notes / Git 操作状态中记录推荐依据',
    ])
  })

  it('应该固定处理上游编排器委派和 worktree 交接文件', () => {
    expectTextIncludes(worktreeContractText, [
      '如果调用方是 `ae:lfg` 或 `ae:task-loop`，固定按 `current-worktree` 处理',
      '记录 `worktree_decision: rejected`',
      '不得询问 worktree 模式、不得创建 worktree',
      '若输入为规范 worktree 交接文件且当前目录匹配目标 B worktree',
      '记录 `worktree_decision: created`',
      '不得再次创建 worktree',
    ])
  })

  it('应该在非 Git 项目中降级并记录 not_applicable', () => {
    expectTextIncludes(startupWorkflowText, [
      'git_context: not_git',
      '显式 `worktree` 模式必须停止或请求用户降级确认',
      '`current-worktree` 可继续当前目录但必须说明风险',
      '记录 `worktree_decision: not_applicable`',
    ])
  })

  it('应该声明 A/B worktree 执行归属和产物迁移要求', () => {
    expectTextIncludes(worktreeContractText, [
      'A 会话创建 B worktree 后，不得继续实现',
      'A 会话只允许在 B 写入真实存在且已确定为执行基线的需求/计划/设计产物',
      '`ae/graphs/`、`.opencode/ae.jsonc`',
      '唯一规范交接文件 `ae/handoffs/<timestamp>-worktree-handoff.md`',
      '未迁移的需求/计划/设计、图谱或 AE 项目配置产物不在交接文件中出现',
    ])
  })

  it('应该要求创建 worktree 后调用工具写入交接 Markdown 并停止 A 会话', () => {
    expectTextIncludes(worktreeContractText, [
      '禁止自行拼接交接 Markdown',
      '必须调用 `ae-worktree-handoff` 工具生成交接文件',
      'B worktree 通过 `ae:work <交接文件>` 读取结构化交接文件继续',
      'source_session_id',
      'execution_baseline',
      'verification_requirements',
      'worktree_decision: transferred',
      '不得调用最终交付门禁',
    ])
  })

  it('不应该保留旧的默认创建 worktree 语义', () => {
    expect(worktreeContractText).not.toContain('未显式声明时默认使用 `auto`')
    expect(worktreeContractText).not.toContain('一律准备创建独立 worktree')
    expect(worktreeContractText).not.toContain('默认创建独立 worktree')
    expect(worktreeContractText).not.toContain('显式声明不使用 worktree')
    expect(worktreeContractText).not.toContain('未显式禁用 worktree')
  })
})
