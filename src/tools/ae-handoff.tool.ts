import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'

import { executeHandoff } from '../services/handoff.service.js'

export const aeHandoffTool: ToolDefinition = tool({
  description: [
    '从当前会话创建独立的新交接会话，自动提取核心上下文注入新会话，并直接在终端打开新会话窗口。',
    '',
    '功能说明：',
    '- 自动提取当前会话的核心结论、已做决策、待办事项、项目上下文',
    '- 自动脱敏所有敏感信息（API密钥、密码、个人信息、私钥等）',
    '- 创建完全独立的新会话，与原会话无历史关联',
    '- 优先注入为系统提示词，不支持时降级为系统消息',
    '- 自动导航终端到新会话窗口，类似执行 /new 的效果',
    '',
    '适用场景：',
    '- 需要将会话交给其他团队成员处理时',
    '- 需要开启新会话但不想重复解释当前上下文时',
    '- 需要保存当前工作状态并在新会话中继续时',
    '',
    '权限要求：',
    '- 仅会话所有者可以触发交接操作',
  ].join('\n'),
  args: {},
  async execute(args, context) {
    return Effect.runPromise(
      executeHandoff(context, (context as any).client).pipe(
        Effect.map(result => {
          if (!result.success) {
            return `❌ 会话交接失败: ${result.error}`
          }
          
          const lines = [
            '✅ 会话交接成功！已自动切换到新会话窗口。',
            '',
            `新会话地址: ${result.sessionUrl}`,
            result.fallbackMode ? '⚠️  已使用降级模式，上下文以普通消息注入' : '',
            '',
            '已提取核心信息:',
            `核心结论: ${result.extractedSummary.coreConclusions.slice(0, 100)}${result.extractedSummary.coreConclusions.length > 100 ? '...' : ''}`,
            `已做决策: ${result.extractedSummary.decisionsMade.slice(0, 100)}${result.extractedSummary.decisionsMade.length > 100 ? '...' : ''}`,
            `待办事项: ${result.extractedSummary.todoItems.slice(0, 100)}${result.extractedSummary.todoItems.length > 100 ? '...' : ''}`,
            `项目上下文: ${result.extractedSummary.projectContext.slice(0, 100)}${result.extractedSummary.projectContext.length > 100 ? '...' : ''}`,
            result.extractedSummary.truncated ? '⚠️  会话内容过长，已自动截断部分历史' : '',
          ]
          
          return lines.filter(Boolean).join('\n')
        })
      )
    )
  },
})
