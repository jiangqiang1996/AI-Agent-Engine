import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { z } from 'zod'
import { Effect } from 'effect'

import { getGlobalClient } from '../services/client-holder.js'
import { executeHandoff } from '../services/handoff.service.js'

export const aeHandoffTool: ToolDefinition = tool({
  description: [
    '从当前会话创建独立的新交接会话，自动提取核心上下文注入新会话，并直接在终端打开新会话窗口。',
    '',
    '功能说明：',
    '- 自动提取当前会话的核心结论、已做决策、待办事项、项目上下文',
    '- 自动脱敏所有敏感信息（API密钥、密码、个人信息、私钥等）',
    '- 创建完全独立的新会话，与原会话无历史关联',
    '- 支持压缩等级参数（1-5，默认1）：1=最详细（最长，默认），5=最简洁（最短）',
    '- 优先注入为系统提示词，不支持时降级为系统消息',
    '- 自动导航终端到新会话窗口，类似执行 /new 的效果',
    '- 返回完整提取内容，不限制显示长度',
    '',
    '适用场景：',
    '- 需要将会话交给其他团队成员处理时',
    '- 需要开启新会话但不想重复解释当前上下文时',
    '- 需要保存当前工作状态并在新会话中继续时',
  ].join('\n'),
  args: {
    core_conclusions: z.string().describe('核心结论：会话达成的最终结论、问题解决方案、关键结果'),
    decisions_made: z.string().describe('已做决策：确定的技术选型、方案选择、优先级决策'),
    todo_items: z.string().describe('待办事项：未完成的任务清单、下一步计划、需要跟进的事项'),
    project_context: z.string().describe('项目上下文：项目基本信息、环境配置、参数约定、已完成的工作内容'),
    compression_level: z.number().min(1).max(5).default(1).describe('压缩等级：1=最详细（最长内容，默认），2=详细，3=中等，4=简洁，5=最简洁（最短内容）'),
  },
  async execute(args, context) {
    const client = getGlobalClient()
    if (!client) {
      return '❌ SDK client 不可用，无法创建新会话。请重启 opencode 后重试。'
    }

    const extractResult = {
      coreConclusions: args.core_conclusions,
      decisionsMade: args.decisions_made,
      todoItems: args.todo_items,
      projectContext: args.project_context,
    }

    return Effect.runPromise(
      executeHandoff(context, client, extractResult).pipe(
        Effect.map((result) => {
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
             `核心结论: ${result.extractedSummary.coreConclusions}`,
             `已做决策: ${result.extractedSummary.decisionsMade}`,
             `待办事项: ${result.extractedSummary.todoItems}`,
             `项目上下文: ${result.extractedSummary.projectContext}`,
            result.extractedSummary.truncated ? '⚠️  会话内容过长，已自动截断部分历史' : '',
          ]

          return lines.filter(Boolean).join('\n')
        })
      )
    )
  },
})
