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
      '先判断当前目录是否为 Git 仓库且 `git worktree` 可用',
      '是否创建独立 worktree',
      '同步创建对应分支',
      '不创建新 worktree 并直接在当前分支执行',
      '取消任务',
    ])
  })

  it('应该支持不创建新 worktree 直接在当前分支执行', () => {
    expectTextIncludes(skillText, [
      '用户选择不创建新 worktree 时',
      '继续在当前 `ctx.worktree` 和当前分支执行任务',
      'worktree_decision: rejected',
    ])
  })

  it('应该在 lfg 调用且未显式禁用时默认创建 worktree', () => {
    expectTextIncludes(skillText, [
      '由 `ae:lfg` 调用',
      '显式声明不使用 worktree',
      '--no-worktree',
      '不展示“是否创建 worktree”的选择',
      '一律准备创建独立 worktree',
    ])
  })

  it('应该在非 Git 项目中跳过 worktree 询问', () => {
    expectTextIncludes(skillText, [
      '当前项目不是 Git 仓库',
      '跳过 worktree 询问',
      'worktree_decision: not_applicable',
    ])
  })

  it('应该声明 A/B worktree 执行归属和产物迁移要求', () => {
    expectTextIncludes(skillText, [
      '当前 opencode 会话仍属于 A 的 `ctx.worktree`',
      '在 B 目录重新启动 opencode',
      '不得在 A 会话通过 shell 工作目录修改 B 中代码、配置、测试或其他项目文件',
      'A 会话只允许执行窄范围启动交接操作',
      '自动迁移当前任务已确定的 AE 需求/计划产物到 B',
      '即使这些文件在 A 中仍未跟踪',
      '保留仓库相对路径并创建缺失目录',
      '不迁移 `docs/ae/gates/*`',
      '`docs/ae/review/*`',
      '`docs/ae/reviews/*`',
    ])
  })

  it('应该要求创建 worktree 后写入交接 Markdown 并提供继续提示词', () => {
    expectTextIncludes(skillText, [
      '当前会话核心交接 Markdown',
      'docs/ae/handoffs/<timestamp>-worktree-handoff.md',
      '用户目标、已确定决策、已迁移产物、待办事项、验证要求、Git/worktree 状态和继续执行约束',
      '交接 Markdown 路径',
      '可直接复制的继续提示词',
      '先读取指定交接文件、需求文档和计划文档',
      'worktree_decision: transferred',
      '立即停止 `ae:work` 阶段 2-4',
    ])
  })

  it('应该要求取消任务后立即停止并传播 cancelled 状态', () => {
    expectTextIncludes(skillText, [
      '用户选择取消任务时',
      '立即终止 `ae:work`',
      'worktree_decision: cancelled',
      '不得修改项目文件',
      '最终功能交付 gate',
    ])
  })

  it('应该要求 worktree 创建到项目根目录同级 worktrees 目录', () => {
    expectTextIncludes(skillText, [
      '../worktrees/<name>',
      '直接子目录',
      '不接受任意外部路径',
      '路径必须解析到 `../worktrees/<name>`',
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
