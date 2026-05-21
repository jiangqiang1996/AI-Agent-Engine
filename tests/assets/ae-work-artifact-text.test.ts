import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')
const continueCommandText = readFileSync('src/assets/commands/ae-work-continue.md', 'utf8')
const shippingText = readFileSync('src/assets/skills/ae-work/references/shipping-workflow.md', 'utf8')
const startupText = readFileSync('src/assets/skills/ae-work/references/startup-and-worktree-workflow.md', 'utf8')
const inputRoutingText = readFileSync('src/assets/skills/ae-work/references/input-routing-workflow.md', 'utf8')
const taskAnalysisText = readFileSync('src/assets/skills/ae-work/references/task-analysis-workflow.md', 'utf8')

describe('ae:work 产物与交付文本契约', () => {
  it('应该把产物迁移边界落在技能文本而非仅靠 rules', () => {
    expect(skillText).toContain('worktree_decision')
    expect(startupText).toContain('A→B 启动证明必须包含')
    expect(skillText).toContain('不得调用最终交付门禁')
    expect(skillText).toContain('不得进入普通交付模板')
    expect(shippingText).toContain('A→B 产物迁移')
    expect(shippingText).toContain('不迁移 gate/review 运行时产物')
    expect(shippingText).toContain('不修改 B 中代码、测试或其他项目文件')
    expect(shippingText).toContain('真实存在的具体需求/计划/设计文件、`ae/graphs/` 和 `.opencode/ae.jsonc` 迁移到 B')
    expect(shippingText).toContain('`.opencode/ae.jsonc` 只能作为已确定的 AE 项目配置上下文迁移')
    expect(shippingText).toContain('在交接文件中逐一显式引用实际迁移的文件或目录')
    expect(shippingText).toContain('未迁移的需求/计划/设计、图谱或 AE 项目配置产物不在交接文件中出现')
    expect(shippingText).toContain('不得声称已复制')
  })

  it('应该要求创建 worktree 后输出结构化交接文件和续执行入口', () => {
    expect(startupText).toContain('A 会话只允许在 B 写入真实存在且已确定为执行基线的需求/计划/设计产物、`ae/graphs/`、`.opencode/ae.jsonc`')
    expect(startupText).toContain('续执行以结构化章节和 `resume_entrypoint` 为真源')
    expect(startupText).toContain('A→B 启动证明必须包含')
    expect(startupText).toContain('resume_entrypoint')
    expect(shippingText).toContain('A→B 交接文件')
    expect(shippingText).toContain('ae/handoffs/<timestamp>-worktree-handoff.md')
    expect(shippingText).toContain('逐字使用 `ae-worktree-handoff` 工具返回的简短交接提示')
    expect(shippingText).toContain('B worktree 通过 `ae:work <交接文件>` 读取结构化交接文件并继续')
    expect(shippingText).toContain('/ae-work-continue')
    expect(shippingText).toContain('A→B 交接文件')
    expect(shippingText).toContain('交接 Markdown 路径')
    expect(shippingText).toContain('目标 B 路径')
  })

  it('应该把 A 会话写入 B 的范围限定为启动交接产物', () => {
    expect(startupText).toContain('创建 B 后，A 会话不得再写入 A worktree 的任何文件')
    expect(startupText).toContain('只允许在 B 写入真实存在且已确定为执行基线的需求/计划/设计产物、`ae/graphs/`、`.opencode/ae.jsonc`')
    expect(startupText).toContain('A→B 启动证明必须包含')
    expect(shippingText).toContain('A 会话不得再写入 A worktree 的任何文件')
    expect(shippingText).toContain('不修改 B 中代码、测试或其他项目文件')
  })

  it('应该要求最终交付记录 worktree 决策和结构化证据', () => {
    expect(shippingText).toContain('worktree_decision')
    expect(shippingText).toContain('git_operation_args')
    expect(shippingText).toContain('git_authorization_evidence')
    expect(shippingText).toContain('user_authorized_git_write` 只是声明证据')
    expect(shippingText).toContain('review_evidence')
    expect(skillText).toContain('在最终交付前必须调用 `ae-gate workflow:work checkpoint:final`')
    expect(skillText).toContain('`validation_results`（每条 `validation_commands` 对应的真实执行结果')
    expect(skillText).toContain('包含 `command`、`exit_code`、`output`、`executed_at`')
    expect(shippingText).toContain('与 `validation_commands` 一一对应的 `validation_results`')
    expect(shippingText).toContain('每条包含 `command`、`exit_code`、`output`、`executed_at`')
    expect(shippingText).toContain('用于通过门禁的 `exit_code` 必须为 0')
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
    expect(shippingText).toContain('不是"功能交付完成"')
    expect(shippingText).toContain('A 会话的 `worktree_decision: transferred` 只表示执行已转移')
    expect(shippingText).toContain('若当前可观察 worktree 匹配 A→B 交接文件或启动证明中的目标 B worktree')
    expect(shippingText).toContain('B 会话最终功能交付使用 `worktree_decision: created`')
    expect(shippingText).toContain('覆盖普通当前工作区场景的 `rejected`')
    expect(shippingText).toContain('`transferred` 和 `cancelled` 不得通过最终功能交付 gate')
  })

  it('应该说明单独使用 ae:work 不默认 auto', () => {
    expect(shippingText).toContain('单独使用 `ae:work` 且未显式传入 `worktree`、`current-worktree`、`auto`')
    expect(shippingText).toContain('必须按任务大小给出推荐并询问是否创建新的 worktree')
    expect(shippingText).toContain('不得默认采用 `auto`')
  })

  it('应该说明调用方默认透传 auto 而不是默认创建 worktree', () => {
    expect(shippingText).toContain('`ae:lfg` 或 `ae:task-loop` 调用 `ae:work`')
    expect(shippingText).toContain('禁止把未显式传入的模式补齐或透传为 `auto`')
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

  it('应该要求当前 worktree 交付提示词保持简洁', () => {
    expect(shippingText).toContain('提示词必须尽可能简洁')
    expect(shippingText).toContain('不要追加“下一步”“后续操作”')
    expect(shippingText).toContain('不输出独立的"下一步"或"后续操作"章节')
    expect(shippingText).not.toContain('## 部署后监控与验证')
  })

  it('应该声明 ae-work-continue 只有交接文件是必需输入', () => {
    expect(continueCommandText).toContain('交接文件是唯一必需文件')
    expect(continueCommandText).toContain('需求文档、计划文档、设计文档、图谱目录和 AE 项目配置只在交接文件明确引用且当前 B worktree 中真实存在时作为可选上下文')
    expect(continueCommandText).toContain('如果交接文件引用的需求/计划/设计路径、图谱目录或 AE 项目配置不存在，不得把续执行判定为失败')
    expect(inputRoutingText).toContain('交接文件是 B worktree 续执行路径的唯一必需输入')
    expect(inputRoutingText).toContain('需求/计划/设计产物、图谱目录和 AE 项目配置作为可选上下文')
    expect(inputRoutingText).toContain('需求、计划、设计路径、图谱目录或 AE 项目配置不存在')
    expect(inputRoutingText).toContain('optional_context_missing')
    expect(startupText).toContain('交接文件是唯一必需文件')
    expect(startupText).toContain('需求、计划、设计、图谱目录和 AE 项目配置只在交接文件引用且当前 B worktree 中真实存在时读取')
    expect(taskAnalysisText).toContain('无计划、计划路径不存在，或工具无法从计划提取单元时')
    expect(taskAnalysisText).toContain('不得因为任务分析工具未识别计划格式而停止续执行')
    expect(shippingText).toContain('对 B 续执行来说只有交接文件是必需输入')
    expect(shippingText).toContain('需求/计划/设计文档、图谱目录和 AE 项目配置只是可选上下文')
  })

  it('应该要求 B 续执行最终门禁记录交接基线而非无需计划', () => {
    expect(shippingText).toContain('handoff_path')
    expect(shippingText).toContain('交接文件作为 B worktree 续执行基线')
    expect(shippingText).toContain('不得写成无需计划')
    expect(shippingText).toContain('不得把 A→B 续执行写成"任务无需计划"')
    expect(continueCommandText).toContain('handoff_path')
    expect(continueCommandText).toContain('不得把 B 续执行描述为无需计划')
    expect(shippingText).toContain('B worktree 续执行且无 `plan_path` 时，必须传入 `handoff_path`')
    expect(continueCommandText).toContain('必须传入 `handoff_path` 指向本交接文件')
    expect(shippingText).not.toContain('B 续执行无需计划')
    expect(continueCommandText).not.toContain('B 续执行无需计划')
    expect(shippingText).not.toContain('或在 `notes` 中说明执行基线')
    expect(continueCommandText).not.toContain('或在 `notes` 中说明执行基线')
  })
})
