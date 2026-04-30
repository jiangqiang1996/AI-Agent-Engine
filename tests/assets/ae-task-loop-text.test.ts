import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-task-loop/SKILL.md', 'utf8')

describe('ae:task-loop worktree 文本契约', () => {
  it('应该在 ae:work 前缀缺省时注入 auto 模式', () => {
    expect(skillText).toContain('当前缀为 `ae:work` 时')
    expect(skillText).toContain('识别 worktree 模式 `worktree`、`current-worktree`、`auto`')
    expect(skillText).toContain('未显式声明三值时')
    expect(skillText).toContain('委派文本必须附加“worktree 模式：auto”')
  })

  it('应该在 Phase 0 扫描 worktree 与 Git 授权风险节点', () => {
    expect(skillText).toContain('如果执行技能前缀为 `ae:work`')
    expect(skillText).toContain('必须额外扫描 worktree 模式、Git 写授权、默认分支、脏工作区和 detached HEAD 风险节点')
    expect(skillText).toContain('`ae:work` 未显式声明 worktree 模式时，`auto` 属于可默认项')
  })

  it('应该禁止禁言期补问 Git 写授权', () => {
    expect(skillText).toContain('Phase 1/2 禁言期不得执行对应 Git 写操作')
    expect(skillText).toContain('只能瓶颈退出或采用 Phase 0 已确认的无需 Git 写操作降级策略')
    expect(skillText).toContain('不得因 worktree 选择或 Git 授权向用户提问')
    expect(skillText).toContain('授权不足时瓶颈退出或按 Phase 0 已确认策略安全降级')
    expect(skillText).toContain('Phase 0 已确认的 Git 命令参数数组与授权证据')
    expect(skillText).toContain('允许的无 Git 写降级策略')
    expect(skillText).toContain('若需要未授权 Git 写操作或交互确认，必须立即瓶颈退出')
  })

  it('应该把禁言期授权约束写入 ae:work 委派文本', () => {
    expect(skillText).toContain('若执行技能为 `ae:work`，同时附加“worktree 模式：<worktree|current-worktree|auto>”')
    expect(skillText).toContain('Phase 0 已确认的 Git 命令参数数组与授权证据')
    expect(skillText).toContain('允许的无 Git 写降级策略')
    expect(skillText).toContain('Phase 1/2 禁言期不得向用户提问')
    expect(skillText).toContain('若需要未授权 Git 写操作或交互确认，必须立即瓶颈退出')
  })

  it('应该把禁言期授权约束写入 Phase 2 修复委派文本', () => {
    expect(skillText).toContain('Phase 2 修复委派必须继续附加已解析的 worktree 模式（缺省为 `auto`）')
    expect(skillText).toContain('Phase 0 已确认的 Git 命令参数数组与授权证据')
    expect(skillText).toContain('允许的无 Git 写降级策略')
    expect(skillText).toContain('Phase 1/2 禁言期不得向用户提问')
    expect(skillText).toContain('若需要未授权 Git 写操作或交互确认，必须立即瓶颈退出')
  })

  it('不应该保留旧的默认创建 worktree 语义', () => {
    expect(skillText).not.toContain('默认创建独立 worktree')
    expect(skillText).not.toContain('一律准备创建独立 worktree')
    expect(skillText).not.toContain('不询问用户是否创建 worktree')
    expect(skillText).not.toContain('显式声明不使用 worktree')
    expect(skillText).not.toContain('未显式禁用 worktree')
  })

  it('应该要求 Phase 0 确认清单记录 Git 授权证据字段', () => {
    expect(skillText).toContain('确认清单必须包含命令参数数组、授权消息引用、源 worktree、目标 worktree、branch 和 HEAD')
    expect(skillText).toContain('git_authorization_evidence')
    expect(skillText).toContain('worktree 模式：<worktree|current-worktree|auto>')
  })
})
