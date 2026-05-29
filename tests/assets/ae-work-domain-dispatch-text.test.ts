import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const skillText = readFileSync('src/assets/skills/ae-work/SKILL.md', 'utf8')
const taskAnalysisText = readFileSync('src/assets/skills/ae-work/references/task-analysis-workflow.md', 'utf8')
const executionText = readFileSync('src/assets/skills/ae-work/references/execution-workflow.md', 'utf8')
const verificationText = readFileSync('src/assets/skills/ae-work/references/verification-workflow.md', 'utf8')

describe('ae:work 开发域调度文本契约', () => {
  it('应该委托 development-domain 而不是引用旧工作子代理模板', () => {
    const combined = [skillText, taskAnalysisText, executionText, verificationText].join('\n')

    expect(combined).toContain('@development-domain')
    expect(combined).toContain('DomainCallRequest')
    expect(combined).not.toContain('work-subagent-template')
    expect(combined).not.toContain('serial_subagent')
    expect(combined).not.toContain('parallel_subagent')
    expect(existsSync('src/assets/skills/ae-work/references/work-subagent-template.md')).toBe(false)
  })

  it('应该声明主代理只核验域代理结果和真实 Git 状态', () => {
    expect(executionText).toContain('收集开发域代理返回的 `DomainExecutionResult`')
    expect(executionText).toContain('不只依赖域代理自报的 artifacts')
    expect(verificationText).toContain('不只依赖域代理自报')
  })
})
