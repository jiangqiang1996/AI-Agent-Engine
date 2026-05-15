import { tool } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'
import { z } from 'zod'

import { COMMAND, SKILL } from '../schemas/ae-asset-schema.js'
import { isSetupCompleted, writeSetupProof } from '../services/setup-proof-service.js'

function resolveWorktree(context: unknown): string {
  const worktree = (context as { worktree?: unknown }).worktree
  return typeof worktree === 'string' && worktree.length > 0 ? worktree : process.cwd()
}

function resolveSessionId(context: unknown): string | undefined {
  const sessionID = (context as { sessionID?: unknown }).sessionID
  if (typeof sessionID === 'string' && sessionID.length > 0) {
    return sessionID
  }

  const sessionId = (context as { sessionId?: unknown }).sessionId
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

function extractHistoryText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map(extractHistoryText).join('\n')
  }

  if (value && typeof value === 'object') {
    const record = value as { text?: unknown; content?: unknown }
    return extractHistoryText(record.text ?? record.content)
  }

  return ''
}

function hasSetupInvocation(context: unknown): boolean {
  const history = (context as { history?: unknown }).history
  if (!Array.isArray(history)) {
    return true
  }

  const setupPattern = new RegExp(`(^|\\s)(${SKILL.SETUP}|/${COMMAND.SETUP})(?=\\s|$|[^\\w:/-])`)

  return history.some((entry) => {
    const candidate = entry as { role?: unknown; message?: { role?: unknown; content?: unknown; text?: unknown }; content?: unknown; text?: unknown }
    const role = candidate.role ?? candidate.message?.role
    const content = extractHistoryText(candidate.content ?? candidate.text ?? candidate.message?.content ?? candidate.message?.text)
    const isForgeryRequest = /(伪造|跳过|不要运行|不要执行|不用运行|无需运行|直接.*证明)/.test(content)
    return role === 'user' && !isForgeryRequest && setupPattern.test(content)
  })
}

/**
 * 记录 ae:setup 完成证明，供浏览器能力消费方做机器校验。
 */
export const aeSetupProofTool = tool({
  description: [
    '写入或检查 ae:setup 的完成证明。',
    '',
    '功能说明：',
    '- complete：在当前工作区写入 `.opencode/ae/setup-proof.json`，记录 agent-browser 版本和完成时间',
    '- check：检查当前工作区是否存在可跨会话复用的合法证明',
    '',
    '适用场景：',
    '- ae:setup 完成 agent-browser 验证后记录机器可校验证明',
    '- 浏览器能力消费方在执行 agent-browser 前确认当前工作区已完成 setup',
    '',
    '注意事项：',
    '- complete 只能在 ae:setup 已真实完成安装和版本验证后调用',
    '- 该工具不自行执行 agent-browser 命令，也不能证明调用前确实执行过验证命令',
    '',
    '不适用场景：',
    '- 不负责安装 agent-browser，也不替代 ae:setup 的真实 CLI 验证',
  ].join('\n'),
  args: {
    action: z.enum(['complete', 'check']).describe('操作类型：complete 写入证明，check 检查证明'),
    version: z.string().optional().describe('agent-browser 版本号；action=complete 时必填，使用实际验证命令输出'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: args.action === 'complete' ? '写入 ae:setup 完成证明...' : '检查 ae:setup 完成证明...' })

    const worktree = resolveWorktree(ctx)
    if (args.action === 'check') {
      const completed = isSetupCompleted(worktree)
      return {
        output: completed ? '当前工作区已完成 ae:setup。' : '当前工作区尚未完成 ae:setup。请先运行 ae:setup / /ae-setup。',
        metadata: { completed },
      }
    }

    if (!args.version || args.version.trim().length === 0) {
      return '写入 ae:setup 完成证明需要提供 agent-browser 版本号。请先运行 `agent-browser --version` 并传入实际输出。'
    }

    const sessionId = resolveSessionId(ctx)
    if (!sessionId) {
      return '无法获取当前会话 ID，不能写入 ae:setup 完成证明。请在支持 sessionID 的 opencode 运行时中重试。'
    }

    if (!hasSetupInvocation(ctx)) {
      return '写入 ae:setup 完成证明必须发生在用户明确触发 ae:setup / /ae-setup 的会话流程中。请先运行 ae:setup / /ae-setup。'
    }

    try {
      await Effect.runPromise(ctx.ask({
        permission: 'file',
        patterns: ['.opencode/ae/setup-proof.json'],
        always: [],
        metadata: {
          action: '写入 ae:setup 完成证明',
          target: '.opencode/ae/setup-proof.json',
        },
      }))

      writeSetupProof(worktree, {
        sessionId,
        completedAt: new Date().toISOString(),
        version: args.version.trim(),
      })
    } catch {
      return '写入 ae:setup 完成证明失败。请确认当前工作区允许写入 `.opencode/ae/setup-proof.json` 后重试。'
    }

    return {
      output: '已写入 ae:setup 完成证明。',
      metadata: { completed: true },
    }
  },
})
