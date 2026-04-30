import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')

function expectTextIncludes(text: string, phrases: string[]): void {
  for (const phrase of phrases) {
    expect(text).toContain(phrase)
  }
}

describe('ae:work worktree 启动文本契约', () => {
  it('应该要求每次正式实现型任务先解析三种 worktree 模式', () => {
    expectTextIncludes(skillText, [
      '每次正式实现型任务',
      '修改项目文件前',
      '先解析 worktree 模式',
      '`worktree`、`current-worktree`、`auto`',
      '`--no-worktree` 映射为 `current-worktree`',
    ])
  })

  it('应该要求单独使用 ae:work 且未传模式时明确询问', () => {
    expectTextIncludes(skillText, [
      '单独使用 `ae:work` 且未显式传入 worktree 模式时',
      '必须基于任务上下文给出推荐依据并明确询问是否创建新的 worktree',
      '不得默认采用 `auto`',
    ])
  })

  it('应该要求 auto 复用任务复杂度和风险信号给出推荐依据', () => {
    expectTextIncludes(skillText, [
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

  it('应该保留交互式降级或普通确认选项', () => {
    expectTextIncludes(skillText, [
      '需要交互式降级或普通确认时',
      '创建 worktree',
      '不创建新 worktree 并直接在当前分支执行',
      '取消任务',
      '同步创建对应分支',
    ])
  })

  it('应该支持不创建新 worktree 直接在当前分支执行', () => {
    expectTextIncludes(skillText, [
      '用户选择不创建新 worktree',
      '`current-worktree` 模式或 `auto` 推荐当前工作区时',
      '继续在当前 `ctx.worktree` 和当前分支执行任务',
      'worktree_decision: rejected',
      '表示未创建新 worktree 并留在当前工作区',
      '如果当前会话是 A→B 后在 B worktree 中继续执行',
      '必须优先按 B 会话最终交付规则记录 `worktree_decision: created`',
    ])
  })

  it('应该只让调用方透传模式而不维护独立 worktree 决策', () => {
    expectTextIncludes(skillText, [
      '如果调用方是 `ae:lfg` 或 `ae:task-loop`',
      '只接收其透传的 `worktree`、`current-worktree`、`auto` 模式',
      '调用方未显式传入时由调用方补齐并传入 `auto`',
      '不维护调用方专属的独立 worktree 决策规则',
    ])
  })

  it('应该在非 Git 项目中跳过 worktree 询问', () => {
    expectTextIncludes(skillText, [
      '当前项目不是 Git 仓库',
      '显式 `worktree` 模式停止或请求降级确认',
      '`current-worktree` 可继续当前目录但说明风险',
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
      '若当前 `ctx.worktree` 匹配 A→B 交接文件或启动证明中的目标 B worktree',
      '最终功能交付 gate 也必须记录 `worktree_decision: created`',
      '不得沿用 A 的 `transferred` 或普通当前工作区的 `rejected`',
    ])
  })

  it('不应该保留旧的默认创建 worktree 语义', () => {
    expect(skillText).not.toContain('未显式声明时默认使用 `auto`')
    expect(skillText).not.toContain('一律准备创建独立 worktree')
    expect(skillText).not.toContain('默认创建独立 worktree')
    expect(skillText).not.toContain('显式声明不使用 worktree')
    expect(skillText).not.toContain('未显式禁用 worktree')
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

  it('应该说明未创建 worktree 不等于直接修改默认分支', () => {
    expectTextIncludes(skillText, [
      '未创建 worktree 不等于允许直接在默认分支实现',
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
