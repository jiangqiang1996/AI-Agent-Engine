import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')

function expectTextIncludes(text: string, phrases: string[]): void {
  for (const phrase of phrases) {
    expect(text).toContain(phrase)
  }
}

describe('ae:work worktree 启动文本契约', () => {
  it('应该要求每次正式实现型任务先完成 worktree 决策', () => {
    expectTextIncludes(skillText, [
      '每次正式实现型任务',
      '修改项目文件前',
      '是否创建独立 worktree',
      '同步创建对应分支',
      '拒绝并继续当前工作区',
      '取消任务',
    ])
  })

  it('应该声明 A/B worktree 执行归属和首版产物迁移边界', () => {
    expectTextIncludes(skillText, [
      '当前 opencode 会话仍属于 A 的 `ctx.worktree`',
      '在 B 目录重新启动 opencode',
      '不得在 A 会话通过 shell 工作目录修改 B',
      '首版不自动迁移 AE 产物',
      '手动携带本次需求/计划',
    ])
  })

  it('应该要求安全校验 Git 输入并生成 A 到 B 启动证明', () => {
    expectTextIncludes(skillText, [
      'git check-ref-format --branch',
      'git rev-parse --verify <base>^{commit}',
      '参数数组',
      '不拼接 shell 字符串',
      'A→B 启动证明',
      'source_session_id',
      'covered_command_args',
      'final_command_args',
    ])
  })

  it('应该说明拒绝 worktree 不等于直接修改默认分支', () => {
    expectTextIncludes(skillText, [
      '用户拒绝 worktree 不等于允许直接在默认分支实现',
      '二次确认风险',
      'gate notes',
    ])
  })

  it('应该要求 S3 轻量修复先完成准备环境再实现', () => {
    expectTextIncludes(skillText, [
      'S3 轻量修复',
      '进入阶段 1',
      '完成准备环境 / worktree 决策后再实现',
    ])
  })
})
