import { tool } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'
import { z } from 'zod'

import { COMMAND, SKILL } from '../schemas/ae-asset-schema.js'
import { hashAgentBrowserOutput, isAgentBrowserProofCompleted, writeAgentBrowserProof } from '../services/agent-browser-proof-service.js'

const REQUIRED_VALIDATION_COMMANDS = [
  'agent-browser --version',
  'agent-browser --help',
  'agent-browser skills get core --full',
] as const

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

function hasAgentBrowserInvocation(context: unknown): boolean {
  const history = (context as { history?: unknown }).history
  if (!Array.isArray(history)) {
    return false
  }

  const pattern = new RegExp(`(^|\\s)(${SKILL.AGENT_BROWSER}|/${COMMAND.AGENT_BROWSER})(?=\\s|$|[^\\w:/-])`)

  return history.some((entry) => {
    const candidate = entry as { role?: unknown; message?: { role?: unknown; content?: unknown; text?: unknown }; content?: unknown; text?: unknown }
    const role = candidate.role ?? candidate.message?.role
    const content = extractHistoryText(candidate.content ?? candidate.text ?? candidate.message?.content ?? candidate.message?.text)
    const isForgeryRequest = /(伪造|跳过|不要运行|不要执行|不用运行|无需运行|直接.*证明)/.test(content)
    return role === 'user' && !isForgeryRequest && pattern.test(content)
  })
}

const ValidationResultInputSchema = z.object({
  command: z.string().min(1).describe('已实际执行的 agent-browser 环境验证命令'),
  exitCode: z.number().int().describe('命令退出码'),
  output: z.string().min(1).describe('命令输出摘要或完整输出，用于写入哈希'),
  executedAt: z.string().optional().describe('ISO 时间戳；缺省时使用当前时间'),
})

/**
 * 记录 agent-browser 环境证明，供浏览器能力消费方做机器校验。
 */
export const aeAgentBrowserProofTool = tool({
  description: [
    '写入或检查 agent-browser 环境证明。',
    '',
    '功能说明：',
    '- complete：在当前工作区写入 `.opencode/ae/agent-browser-proof.json`，记录实际环境验证结果',
    '- check：检查当前工作区是否存在可跨会话复用的合法 agent-browser 环境证明，并复验版本',
    '',
    '适用场景：',
    '- ae:agent-browser 完成 agent-browser 环境验证后记录机器可校验证明',
    '- 浏览器能力消费方在执行 agent-browser 浏览器控制命令前确认环境已验证',
    '',
    '不适用场景：',
    '- 不负责安装 agent-browser，也不替代 ae:agent-browser 的真实 CLI 验证',
  ].join('\n'),
  args: {
    action: z.enum(['complete', 'check']).describe('操作类型：complete 写入证明，check 检查证明'),
    agent_browser_version: z.string().optional().describe('agent-browser 版本号；action=complete 时必填，使用实际验证命令输出'),
    worktree_fingerprint: z.string().optional().describe('当前工作区路径、HEAD 和状态摘要形成的指纹；action=complete 时必填'),
    validation_results: z.array(ValidationResultInputSchema).optional().describe('实际运行过的环境验证命令结果；action=complete 时必填'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: args.action === 'complete' ? '写入 agent-browser 环境证明...' : '检查 agent-browser 环境证明...' })

    const worktree = resolveWorktree(ctx)
    if (args.action === 'check') {
      const completed = isAgentBrowserProofCompleted(worktree, undefined, args.worktree_fingerprint?.trim())
      return {
        output: completed ? '当前工作区已完成 agent-browser 环境验证。' : '当前工作区尚未完成 agent-browser 环境验证。请先运行 ae:agent-browser / /ae-agent-browser。',
        metadata: { completed },
      }
    }

    if (!args.agent_browser_version || args.agent_browser_version.trim().length === 0) {
      return '写入 agent-browser 环境证明需要提供 agent-browser 版本号。请先运行 `agent-browser --version` 并传入实际输出。'
    }

    if (!args.worktree_fingerprint || args.worktree_fingerprint.trim().length === 0) {
      return '写入 agent-browser 环境证明需要提供当前 worktree 指纹。'
    }

    if (!args.validation_results || args.validation_results.length === 0) {
      return '写入 agent-browser 环境证明需要提供实际验证命令结果。'
    }

    const failedValidation = args.validation_results.find((result) => result.exitCode !== 0)
    if (failedValidation) {
      return `验证命令 ${failedValidation.command} 未成功退出，不能写入 agent-browser 环境证明。请修复环境后重新运行验证。`
    }

    const validationCommands = new Set(args.validation_results.map((result) => result.command.trim()))
    const missingCommand = REQUIRED_VALIDATION_COMMANDS.find((command) => !validationCommands.has(command))
    if (missingCommand) {
      return `写入 agent-browser 环境证明前必须实际运行验证命令 ${missingCommand}。请补齐验证结果后重试。`
    }

    const versionValidation = args.validation_results.find((result) => result.command.trim() === 'agent-browser --version')
    if (versionValidation?.output.trim() !== args.agent_browser_version.trim()) {
      return 'agent-browser 版本号必须来自 `agent-browser --version` 的实际输出。请传入匹配的版本输出。'
    }

    const sessionId = resolveSessionId(ctx)
    if (!sessionId) {
      return '无法获取当前会话 ID，不能写入 agent-browser 环境证明。请在支持 sessionID 的 opencode 运行时中重试。'
    }

    if (!hasAgentBrowserInvocation(ctx)) {
      return '写入 agent-browser 环境证明必须发生在用户明确触发 ae:agent-browser / /ae-agent-browser 的会话流程中。请先运行 ae:agent-browser / /ae-agent-browser。'
    }

    try {
      await Effect.runPromise(ctx.ask({
        permission: 'file',
        patterns: ['.opencode/ae/agent-browser-proof.json'],
        always: [],
        metadata: {
          action: '写入 agent-browser 环境证明',
          target: '.opencode/ae/agent-browser-proof.json',
        },
      }))

      const now = new Date().toISOString()
      writeAgentBrowserProof(worktree, {
        sessionId,
        completedAt: now,
        schemaVersion: 1,
        worktreeFingerprint: args.worktree_fingerprint.trim(),
        agentBrowserVersion: args.agent_browser_version.trim(),
        validationResults: args.validation_results.map((result) => ({
          command: result.command,
          exitCode: result.exitCode,
          outputHash: hashAgentBrowserOutput(result.output),
          executedAt: result.executedAt ?? now,
        })),
        proofKind: 'agent-browser-environment',
      })
    } catch {
      return '写入 agent-browser 环境证明失败。请确认当前工作区允许写入 `.opencode/ae/agent-browser-proof.json` 后重试。'
    }

    return {
      output: '已写入 agent-browser 环境证明。',
      metadata: { completed: true },
    }
  },
})
