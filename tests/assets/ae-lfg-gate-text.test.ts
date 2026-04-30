import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-lfg/SKILL.md', 'utf8')
const routingText = readFileSync('src/assets/skills/ae-lfg/references/task-routing.md', 'utf8')

describe('ae:lfg 门禁文本契约', () => {
  it('应该同步最终门禁的新证据字段', () => {
    expect(skillText).toContain('review_evidence:{...}')
    expect(skillText).toContain('git_operation_args')
    expect(skillText).toContain('git_authorization_evidence')
    expect(skillText).toContain('worktree_decision:<created|rejected|not_applicable>')
    expect(skillText).toContain('`worktree_decision` 必须沿用步骤 6 的结果')
    expect(skillText).toContain('不能只依赖 `user_authorized_git_write`')
  })

  it('应该要求 S3 正式交付记录 worktree 决策', () => {
    expect(routingText).toContain('worktree 决策')
    expect(routingText).toContain('修改项目文件前完成 worktree 决策')
    expect(routingText).toContain('未创建 worktree 不等于允许直接在默认分支实现')
  })

  it('应该要求 lfg 透传显式模式并默认 auto', () => {
    expect(skillText).toContain('显式 worktree 模式：`worktree`、`current-worktree`、`auto`')
    expect(skillText).toContain('未识别到三值时默认补齐为 `auto`')
    expect(skillText).toContain('兼容输入 `--no-worktree`')
    expect(skillText).toContain('映射为 `current-worktree`')
    expect(skillText).toContain('`ae:lfg` worktree 模式透传策略')
    expect(skillText).toContain('显式 `worktree`、`current-worktree`、`auto` 原样传递')
    expect(skillText).toContain('未显式时传递 `auto`')
    expect(skillText).toContain('`ae:lfg` 不维护独立 worktree 推荐逻辑')
    expect(skillText).toContain('worktree 模式：auto')
    expect(skillText).toContain('--no-worktree')
    expect(routingText).toContain('通过 `ae:lfg` 进入正式实现时')
    expect(routingText).toContain('未显式声明时默认传递 `auto`')
    expect(routingText).toContain('由 `ae:work` 根据 S3/S4、影响范围和风险信号推荐 worktree 或当前工作区')
    expect(routingText).toContain('不再作为默认策略中心')
  })

  it('不应该保留旧的默认创建 worktree 语义', () => {
    expect(skillText).not.toContain('默认创建独立 worktree')
    expect(skillText).not.toContain('一律准备创建独立 worktree')
    expect(skillText).not.toContain('不询问用户是否创建 worktree')
    expect(skillText).not.toContain('显式声明不使用 worktree')
    expect(skillText).not.toContain('未显式禁用 worktree')
    expect(routingText).not.toContain('默认创建独立 worktree')
    expect(routingText).not.toContain('一律准备创建独立 worktree')
    expect(routingText).not.toContain('不询问用户是否创建 worktree')
    expect(routingText).not.toContain('显式声明不使用 worktree')
    expect(routingText).not.toContain('未显式禁用 worktree')
  })

  it('应该要求 lfg 前置少量询问后尽可能静默执行', () => {
    expect(skillText).toContain('静默执行原则')
    expect(skillText).toContain('除了一开始为澄清目标、确认关键约束、确认 worktree 模式和 Git 写操作授权范围进行少量询问之外')
    expect(skillText).toContain('后续尽可能静默执行到结束')
    expect(skillText).toContain('不得在每个阶段重复询问“是否继续”')
    expect(skillText).toContain('一次性收集后续静默执行所需的关键决策')
    expect(skillText).toContain('worktree 模式和 Git 写操作授权边界')
    expect(routingText).toContain('Git 写操作授权应尽量在前置澄清阶段一次性取得')
    expect(routingText).toContain('默认分支、脏工作区、detached HEAD 或授权不足不得因 `ae:lfg auto` 静默跳过')
  })

  it('应该要求 A 到 B 转移后停止主管道', () => {
    expect(skillText).toContain('worktree_decision: transferred')
    expect(skillText).toContain('当前 A 会话必须停止主管道')
    expect(skillText).toContain('不得继续步骤 7、步骤 8 或最终功能交付 gate')
    expect(skillText).toContain('最终交付必须在 B 会话中完成')
    expect(skillText).toContain('worktree_decision: cancelled')
    expect(skillText).toContain('当前主管道立即停止')
    expect(skillText).toContain('不运行后续步骤或最终功能交付 gate')
  })
})
