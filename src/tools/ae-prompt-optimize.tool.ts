import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import { z } from 'zod'
import { Effect } from 'effect'

import { getGlobalClient } from '../services/client-holder.js'
import { executePromptSubmit } from '../services/prompt-optimize.service.js'
import { showToast } from '../services/toast-holder.js'

export const aePromptOptimizeTool: ToolDefinition = tool({
  description: [
    '将优化后的提示词提交到新会话并自动执行，创建独立会话、发送提示词、触发 AI 回复并导航到新窗口。',
    '',
    '功能说明：',
    '- 创建全新独立会话',
    '- 将优化后的提示词作为用户消息直接发送，触发 AI 自动回复',
    '- 自动导航到新会话窗口',
    '- 失败时返回已确认的提示词原文，便于用户手动复制或重试',
    '',
    '适用场景：',
    '- 提示词优化完成后提交执行',
    '- auto 模式下自动提交，跳过用户确认',
    '',
    '不适用场景：',
    '- 需要注入系统上下文到新会话（使用 ae-handoff）',
    '- 需要多轮交互修改提示词（在 SKILL.md 层面处理）',
  ].join('\n'),
  args: {
    optimized_prompt: z
      .string()
      .min(1)
      .max(50000)
      .describe('优化后的完整提示词，将作为用户消息发送到新会话'),
    session_title: z
      .string()
      .optional()
      .describe('可选的会话标题，不提供时自动从提示词内容生成'),
  },
  async execute(args, context) {
    const client = getGlobalClient()
    if (!client) {
      showToast('客户端初始化失败，无法创建新会话，请重启 OpenCode 后重试')
      return [
        '❌ 客户端初始化失败，无法创建新会话，请重启 OpenCode 后重试。',
        '',
        '已确认的提示词原文：',
        args.optimized_prompt,
      ].join('\n')
    }

    context.metadata({ title: '正在创建新会话...' })

    return Effect.runPromise(
      executePromptSubmit(client, args.optimized_prompt, args.session_title).pipe(
        Effect.map((result) => {
          context.metadata({ title: '优化提示词已提交' })

          const lines = [
            '✅ 提示词已提交到新会话！',
            '',
            `新会话地址：${result.sessionUrl}`,
            result.navigated ? '已自动切换到新会话窗口。' : '⚠️ 导航未成功，请手动切换到新会话窗口。',
          ]

          return lines.filter(Boolean).join('\n')
        }),
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          showToast(`提示词提交失败：${message}`)
          return Effect.succeed([
            `❌ 提交失败（${error instanceof Error ? error.name : '未知错误'}）：${message}`,
            '',
            '已确认的提示词原文：',
            args.optimized_prompt,
            '',
            '请检查错误原因后重试，或手动复制提示词到新会话。',
          ].join('\n'))
        }),
      ),
    )
  },
})
