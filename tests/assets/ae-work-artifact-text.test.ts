import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')
const shippingText = readFileSync('src/assets/skills/ae-work/references/shipping-workflow.md', 'utf8')

describe('ae:work 产物与交付文本契约', () => {
  it('应该把产物迁移边界落在技能文本而非仅靠 rules', () => {
    expect(skillText).toContain('自动迁移当前任务已确定的 AE 需求/计划产物到 B')
    expect(skillText).toContain('即使这些文件在 A 中仍未跟踪')
    expect(skillText).toContain('迁移时保留仓库相对路径并创建缺失目录')
    expect(skillText).toContain('不迁移 `docs/ae/gates/*`')
    expect(skillText).toContain('`docs/ae/review/*`')
    expect(skillText).toContain('`docs/ae/reviews/*`')
    expect(skillText).toContain('不得靠最近修改时间或相近 topic 批量复制 `docs/ae/*`')
    expect(skillText).toContain('若无法唯一确定当前任务关联需求/计划，必须询问用户')
  })

  it('应该要求创建 worktree 后输出交接文件和继续提示词', () => {
    expect(skillText).toContain('当前会话核心交接 Markdown')
    expect(skillText).toContain('docs/ae/handoffs/<timestamp>-worktree-handoff.md')
    expect(skillText).toContain('用户目标、已确定决策、已迁移产物、待办事项、验证要求、Git/worktree 状态和继续执行约束')
    expect(skillText).toContain('可直接复制的继续提示词')
    expect(skillText).toContain('先读取指定交接文件、需求文档和计划文档')
    expect(shippingText).toContain('A→B 交接文件')
    expect(shippingText).toContain('交接 Markdown 路径')
    expect(shippingText).toContain('目标 B 路径')
  })

  it('应该把 A 会话写入 B 的范围限定为启动交接产物', () => {
    expect(skillText).toContain('A 会话只允许执行窄范围启动交接操作')
    expect(skillText).toContain('A 会话只允许在 B 写入当前会话核心交接 Markdown')
    expect(skillText).toContain('不得在 A 会话通过 shell 工作目录修改 B 中代码、配置、测试或其他项目文件')
    expect(shippingText).toContain('不修改 B 中代码、配置、测试或其他项目文件')
  })

  it('应该要求最终交付记录 worktree 决策和结构化证据', () => {
    expect(shippingText).toContain('worktree_decision')
    expect(shippingText).toContain('git_operation_args')
    expect(shippingText).toContain('git_authorization_evidence')
    expect(shippingText).toContain('user_authorized_git_write` 只是声明证据')
    expect(shippingText).toContain('review_evidence')
  })

  it('应该把 A 到 B 转移状态与功能交付完成区分开', () => {
    expect(shippingText).toContain('执行已转移 / 等待用户在 B 重启')
    expect(shippingText).toContain('不是“功能交付完成”')
  })
})
