import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')
const shippingText = readFileSync('src/assets/skills/ae-work/references/shipping-workflow.md', 'utf8')

describe('ae:work 产物与交付文本契约', () => {
  it('应该把产物迁移边界落在技能文本而非仅靠 rules', () => {
    expect(skillText).toContain('worktree_decision')
    expect(skillText).toContain('A→B 启动证明必须包含')
    expect(skillText).toContain('不得调用最终交付门禁')
    expect(skillText).toContain('不得进入普通交付模板')
    expect(shippingText).toContain('A→B 产物迁移')
    expect(shippingText).toContain('不迁移 gate/review 运行时产物')
    expect(shippingText).toContain('不修改 B 中代码、配置、测试或其他项目文件')
    expect(shippingText).toContain('当前任务已确定的需求/计划产物迁移到 B')
  })

  it('应该要求创建 worktree 后输出交接文件和继续提示词', () => {
    expect(skillText).toContain('A 会话只允许在 B 写入当前任务已确定的需求/计划产物')
    expect(skillText).toContain('交接文件必须包含 `## Continue Prompt` 章节')
    expect(skillText).toContain('A→B 启动证明必须包含')
    expect(shippingText).toContain('A→B 交接文件')
    expect(shippingText).toContain('docs/ae/handoffs/<timestamp>-worktree-handoff.md')
    expect(shippingText).toContain('A 的结束提示必须包含在 B 新会话读取该文件继续的提示词')
    expect(shippingText).toContain('A→B 交接文件')
    expect(shippingText).toContain('交接 Markdown 路径')
    expect(shippingText).toContain('目标 B 路径')
  })

  it('应该把 A 会话写入 B 的范围限定为启动交接产物', () => {
    expect(skillText).toContain('创建 B 后，A 会话不得再写入 A worktree 的任何文件')
    expect(skillText).toContain('只允许在 B 写入当前任务已确定的需求/计划产物')
    expect(skillText).toContain('A→B 启动证明必须包含')
    expect(shippingText).toContain('A 会话不得再写入 A worktree 的任何文件')
    expect(shippingText).toContain('不修改 B 中代码、配置、测试或其他项目文件')
  })

  it('应该要求最终交付记录 worktree 决策和结构化证据', () => {
    expect(shippingText).toContain('worktree_decision')
    expect(shippingText).toContain('git_operation_args')
    expect(shippingText).toContain('git_authorization_evidence')
    expect(shippingText).toContain('user_authorized_git_write` 只是声明证据')
    expect(shippingText).toContain('review_evidence')
  })

  it('应该说明 rejected 表示当前工作区交付而不只是用户拒绝', () => {
    expect(shippingText).toContain('`current-worktree` 模式')
    expect(shippingText).toContain('`auto` 推荐当前工作区')
    expect(shippingText).toContain('worktree_decision: rejected')
    expect(shippingText).toContain('表示未创建新 worktree 并留在当前 `ctx.worktree`')
    expect(shippingText).toContain('若当前会话是 A→B 后在目标 B worktree 中执行')
    expect(shippingText).toContain('B 会话最终交付优先记录 `worktree_decision: created`')
  })

  it('应该说明 worktree 不可用时显式 worktree 模式不能静默降级', () => {
    expect(shippingText).toContain('非 Git 项目或 `git worktree` 不可用')
    expect(shippingText).toContain('显式 `worktree` 模式必须停止或请求降级确认')
    expect(shippingText).toContain('不得静默记录 `not_applicable` 后继续')
    expect(shippingText).toContain('`current-worktree` 可继续当前目录但必须说明风险')
    expect(shippingText).toContain('`auto` 降级当前目录时记录 `worktree_decision: not_applicable`')
  })

  it('应该把 A 到 B 转移状态与功能交付完成区分开', () => {
    expect(shippingText).toContain('执行已转移 / 等待用户在 B 重启')
    expect(shippingText).toContain('不是“功能交付完成”')
    expect(shippingText).toContain('A 会话的 `worktree_decision: transferred` 只表示执行已转移')
    expect(shippingText).toContain('若当前 `ctx.worktree` 匹配 A→B 交接文件或启动证明中的目标 B worktree')
    expect(shippingText).toContain('B 会话最终功能交付使用 `worktree_decision: created`')
    expect(shippingText).toContain('覆盖普通当前工作区场景的 `rejected`')
    expect(shippingText).toContain('`transferred` 和 `cancelled` 不得通过最终功能交付 gate')
  })

  it('应该说明单独使用 ae:work 不默认 auto', () => {
    expect(shippingText).toContain('单独使用 `ae:work` 且未显式传入 `worktree`、`current-worktree`、`auto`')
    expect(shippingText).toContain('必须明确询问是否创建新的 worktree')
    expect(shippingText).toContain('不得默认采用 `auto`')
  })

  it('应该说明调用方默认透传 auto 而不是默认创建 worktree', () => {
    expect(shippingText).toContain('`ae:lfg` 或 `ae:task-loop` 调用 `ae:work`')
    expect(shippingText).toContain('调用方未显式传入 `worktree`、`current-worktree`、`auto` 的情况下必须补齐并透传 `auto`')
    expect(shippingText).toContain('`--no-worktree` 仅作为兼容输入映射到 `current-worktree`')
    expect(shippingText).toContain('不再作为默认策略中心')
  })

  it('不应该保留旧的默认创建 worktree 语义', () => {
    expect(shippingText).not.toContain('未显式声明时默认使用 `auto`')
    expect(shippingText).not.toContain('一律准备创建独立 worktree')
    expect(shippingText).not.toContain('默认创建独立 worktree')
    expect(shippingText).not.toContain('显式声明不使用 worktree')
    expect(shippingText).not.toContain('未显式禁用 worktree')
  })
})
