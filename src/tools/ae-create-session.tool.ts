import { Effect } from 'effect'
import { tool, type ToolDefinition } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { getGlobalClient } from '../services/client-holder.js'
import { createSessionFlow, type CreateSessionResult } from '../services/session-create.service.js'

export const aeCreateSessionTool: ToolDefinition = tool({
  description: [
    '创建独立新会话并可选注入上下文或自动执行。',
    '',
    '功能说明：',
    '- 创建全新独立会话，可选设置标题',
    '- 可选注入 system 上下文，失败时降级为普通 noReply 上下文消息',
    '- 可选发送 user_prompt 并触发新会话回复；auto_execute 默认 false',
    '- 是否执行前确认完全由 require_confirmation 参数决定，工具不会自行推断',
    '- 通过工具自动执行 user_prompt 时是否请求确认仍由 require_confirmation 决定；调用方必须显式承担该决策',
    '- 自动执行前会强制为浏览器相关提示词注入 chrome-devtools MCP 动态注册门禁',
    '- 导航失败不会阻断会话创建或提示词提交结果',
    '',
    '适用场景：',
    '- 会话中需要主动创建新会话',
    '- 需要把上下文传递到新会话后继续处理',
    '- 需要由调用方显式决定是否确认的新会话自动执行',
    '',
    '不适用场景：',
    '- 需要 ae:handoff 的结构化会话摘要提取',
  ].join('\n'),
  args: {
    title: z.string().optional().describe('新会话标题；不提供或为空时自动生成'),
    system_prompt: z.string().optional().describe('优先作为 system 上下文注入的新会话提示词'),
    context_message: z.string().optional().describe('普通 noReply 上下文消息，或 system 注入失败后的降级内容'),
    user_prompt: z.string().optional().describe('要发送到新会话的用户提示词'),
    auto_execute: z.boolean().default(false).describe('是否发送 user_prompt 并触发目标新会话回复，默认 false'),
    navigate: z.boolean().default(true).describe('是否自动切换到新会话，默认 true'),
    require_confirmation: z.boolean().describe('是否在创建新会话前请求确认；调用方必须显式传入'),
  },
  async execute(args, ctx) {
    if (typeof args.require_confirmation !== 'boolean') {
      return {
        output: '缺少必填参数 require_confirmation。请明确传入 true 或 false，由调用方决定是否在创建新会话前请求确认。',
        metadata: { tool: TOOL.AE_CREATE_SESSION, success: false, missingRequiredArgument: 'require_confirmation' },
      }
    }

    const client = getGlobalClient()
    if (!client) {
      return {
        output: '客户端初始化失败，无法创建新会话，请重启 OpenCode 后重试。',
        metadata: { tool: TOOL.AE_CREATE_SESSION, success: false },
      }
    }

    const willAutoExecute = args.auto_execute === true

    if (args.require_confirmation) {
      try {
        await ctx.ask({
          permission: 'session',
          patterns: [willAutoExecute ? 'create-session-and-prompt' : 'create-session'],
          always: [],
          metadata: {
            action: willAutoExecute ? '创建新会话，并向新会话发送 user_prompt 触发模型回复。' : '创建新会话。',
            navigate: args.navigate !== false,
            auto_execute: willAutoExecute,
            title: summarizePayload(args.title),
            system_prompt: summarizePayload(args.system_prompt),
            context_message: summarizePayload(args.context_message),
            user_prompt: summarizePayload(args.user_prompt),
          },
        })
      } catch (error) {
        const message = formatAskError(error)
        if (!isUserCancelError(message)) {
          return {
            output: `新会话创建确认请求失败：${message}。这通常表示当前运行环境不支持 session 权限确认，或权限请求未能正常展示。`,
            metadata: { tool: TOOL.AE_CREATE_SESSION, success: false, authorizationFailed: true, error: message },
          }
        }

        return {
          output: '用户已取消新会话创建。',
          metadata: { tool: TOOL.AE_CREATE_SESSION, success: false, cancelled: true },
        }
      }
    }

    ctx.metadata({ title: '正在创建新会话...' })

    try {
      const result = await Effect.runPromise(createSessionFlow(client, {
        title: args.title ?? '',
        systemPrompt: args.system_prompt,
        contextMessage: args.context_message,
        userPrompt: args.user_prompt,
        autoExecute: willAutoExecute,
        navigate: args.navigate,
      }))

      ctx.metadata({ title: result.promptSubmitted ? '新会话已创建并执行' : '新会话已创建' })

      return {
        output: formatCreateSessionResult(result),
        metadata: { tool: TOOL.AE_CREATE_SESSION, ...result },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        output: `创建新会话失败：${message}`,
        metadata: { tool: TOOL.AE_CREATE_SESSION, success: false, error: message },
      }
    }
  },
})

function formatAskError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  const message = String(error).trim()
  return message || '未知错误'
}

function summarizePayload(value: string | undefined): { present: boolean; length: number; preview: string } {
  const text = value?.trim() ?? ''
  const normalized = text.replace(/\s+/g, ' ')
  return {
    present: text.length > 0,
    length: text.length,
    preview: normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized,
  }
}

function isUserCancelError(message: string): boolean {
  return /cancel|cancelled|canceled|deny|denied|reject|rejected|abort|aborted|取消|拒绝/i.test(message)
}

function formatCreateSessionResult(result: CreateSessionResult): string {
  const lines = [
    result.success ? '新会话创建完成。' : '新会话已创建，但后续操作未全部完成。',
    result.sessionUrl ? `新会话地址：${result.sessionUrl}` : '',
    result.navigated ? '已自动切换到新会话窗口。' : '未自动切换到新会话窗口。',
    result.contextInjected ? '上下文已注入。' : '',
    result.fallbackMode ? '已使用降级模式：上下文作为普通消息注入。' : '',
    result.promptAttempted ? (result.promptSubmitted ? '提示词已提交并触发目标会话回复。' : '提示词提交失败。') : '',
  ]

  if (result.warnings.length > 0) {
    lines.push('', '警告：', ...result.warnings.map((warning) => `- ${warning}`))
  }

  if (result.recoverablePrompt && !result.promptSubmitted) {
    lines.push('', '可恢复提示词：', result.recoverablePrompt)
  }

  return lines.filter(Boolean).join('\n')
}
