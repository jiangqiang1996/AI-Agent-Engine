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
    expect(routingText).toContain('只有明确判定仍属 S3，并在修改项目文件前完成当前工作区执行风险记录后，才允许开始修改')
    expect(routingText).toContain('未创建 worktree 不等于允许直接在默认分支实现')
  })

  it('应该要求 lfg 固定当前工作区执行', () => {
    expect(skillText).toContain('`ae:lfg` 调用 `ae:work` 时固定当前工作区执行，不询问 worktree 模式、不创建 worktree')
    expect(skillText).toContain('在需求探索阶段一次性收集后续静默执行所需的关键决策')
    expect(skillText).toContain('Git 写操作授权边界')
    expect(skillText).toContain('兼容输入 `--no-worktree` 或明确写明“不使用 worktree”时，也只作为当前工作区执行的同义约束记录')
    expect(skillText).toContain('在调用 `ae:work` 前应用 `ae:lfg` 固定当前工作区策略')
    expect(skillText).toContain('不透传 `worktree` 或 `auto`')
    expect(skillText).toContain('不得询问 worktree 模式')
    expect(skillText).toContain('不得创建 worktree')
    expect(routingText).toContain('通过 `ae:lfg` 进入正式实现时')
    expect(routingText).toContain('固定当前工作区执行')
    expect(routingText).toContain('不询问 worktree 模式')
    expect(routingText).toContain('不创建 worktree')
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
    expect(skillText).toContain('除了一开始为澄清目标、确认关键约束和 Git 写操作授权范围进行少量询问之外')
    expect(skillText).toContain('后续尽可能静默执行到结束')
    expect(skillText).toContain('不得在每个阶段重复询问“是否继续”')
    expect(skillText).toContain('一次性收集后续静默执行所需的关键决策')
    expect(skillText).toContain('Git 写操作授权边界')
    expect(routingText).toContain('Git 写操作授权应尽量在前置澄清阶段一次性取得')
    expect(routingText).toContain('默认分支、脏工作区、detached HEAD 或授权不足不得因固定当前工作区策略被静默跳过')
  })

  it('应该要求 A 到 B 转移后停止主管道', () => {
    expect(skillText).toContain('worktree_decision: transferred')
    expect(skillText).toContain('报告 `ae:lfg` 不允许本次 `ae:work` 创建或转移 worktree')
    expect(skillText).toContain('不得继续步骤 7、步骤 8 或最终功能交付 gate')
    expect(skillText).toContain('worktree_decision: cancelled')
    expect(skillText).toContain('当前主管道立即停止')
    expect(skillText).toContain('只输出取消状态、已完成/未完成项和不运行后续步骤或最终功能交付 gate 的说明')
  })
})
