import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import { getGlobalClient } from '../services/client-holder.js'

const MCP_NAME = 'chrome-devtools'
const DEFAULT_COMMAND = ['npx', '-y', 'chrome-devtools-mcp@latest'] as const

function resolveWorktree(context: unknown): string {
  const worktree = (context as { worktree?: unknown }).worktree
  return typeof worktree === 'string' && worktree.length > 0 ? worktree : process.cwd()
}

async function checkMcpStatus(name: string, worktree: string): Promise<{ connected: boolean; status: string; error?: string }> {
  const client = getGlobalClient()
  if (!client) {
    return { connected: false, status: 'unavailable', error: 'opencode 客户端不可用' }
  }

  try {
    const result = await client.mcp.status({ query: { directory: worktree } })
    const statuses = result.data as Record<string, { status: string; error?: string }> | undefined
    if (!statuses || !(name in statuses)) {
      return { connected: false, status: 'not_registered' }
    }

    const entry = statuses[name]
    if (entry.status === 'connected') {
      return { connected: true, status: 'connected' }
    }

    return { connected: false, status: entry.status, error: entry.error }
  } catch {
    return { connected: false, status: 'check_failed', error: '无法获取 MCP 状态' }
  }
}

export const aeChromeDevtoolsMcpTool = tool({
  description: [
    '动态注册或检查 chrome-devtools-mcp 服务。',
    '',
    '功能说明：',
    '- check：检查 chrome-devtools MCP 是否已注册且已连接',
    '- register-new：注册并启动新浏览器实例的 chrome-devtools MCP',
    '- register-connect：注册并连接到已有浏览器的 chrome-devtools MCP（需要 CDP 端口或 URL）',
    '- disconnect：断开 chrome-devtools MCP 连接',
    '',
    '适用场景：',
    '- ae:chrome-devtools 技能在使用浏览器工具前确认或注册 MCP 服务',
    '- 需要根据使用场景（新建浏览器 vs 连接已有浏览器）动态切换 MCP 参数',
    '',
    '不适用场景：',
    '- 不负责直接执行浏览器操作，只管理 MCP 服务的生命周期',
  ].join('\n'),
  args: {
    action: z.enum(['check', 'register-new', 'register-connect', 'disconnect']).describe(
      '操作类型：check 检查状态，register-new 注册新浏览器，register-connect 连接已有浏览器，disconnect 断开连接',
    ),
    cdp_url: z.string().optional().describe(
      '已有浏览器的 CDP 端点 URL（如 http://localhost:9222）；action=register-connect 时必填',
    ),
  },
  execute: async (args, ctx) => {
    const worktree = resolveWorktree(ctx)
    const client = getGlobalClient()

    if (args.action === 'check') {
      ctx.metadata({ title: '检查 chrome-devtools MCP 状态...' })
      const result = await checkMcpStatus(MCP_NAME, worktree)
      if (result.connected) {
        return {
          output: 'chrome-devtools MCP 已注册且已连接，浏览器工具可用。',
          metadata: { connected: true, status: result.status },
        }
      }

      const hints: string[] = ['chrome-devtools MCP 未就绪。']
      if (result.status === 'not_registered') {
        hints.push('请使用 action=register-new 注册新浏览器，或 action=register-connect 连接已有浏览器。')
      } else if (result.status === 'disabled') {
        hints.push('MCP 已注册但被禁用，请在 opencode 配置中启用 chrome-devtools。')
      } else if (result.status === 'failed') {
        hints.push(`MCP 连接失败：${result.error ?? '未知错误'}。可尝试 disconnect 后重新 register。`)
      } else if (result.error) {
        hints.push(result.error)
      }

      return {
        output: hints.join(' '),
        metadata: { connected: false, status: result.status },
      }
    }

    if (!client) {
      return 'opencode 客户端不可用，无法动态注册 chrome-devtools MCP。请确认在 opencode 运行时环境中使用。'
    }

    if (args.action === 'register-new') {
      ctx.metadata({ title: '注册 chrome-devtools MCP（新浏览器）...' })

      const existingStatus = await checkMcpStatus(MCP_NAME, worktree)
      if (existingStatus.connected) {
        return {
          output: 'chrome-devtools MCP 已注册且已连接。如需重新注册，请先 disconnect 再 register-new。',
          metadata: { connected: true, status: existingStatus.status },
        }
      }

      try {
        const result = await client.mcp.add({
          body: {
            name: MCP_NAME,
            config: {
              type: 'local',
              command: [...DEFAULT_COMMAND],
            },
          },
          query: { directory: worktree },
        })

        const statuses = result.data as Record<string, { status: string }> | undefined
        const newStatus = statuses?.[MCP_NAME]
        if (newStatus?.status === 'connected') {
          return {
            output: '已注册 chrome-devtools MCP 并启动新浏览器实例，工具可用。',
            metadata: { connected: true, status: 'connected' },
          }
        }

        return {
          output: `chrome-devtools MCP 已注册，当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等 MCP 连接完成后重试 check。`,
          metadata: { connected: false, status: newStatus?.status },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `注册 chrome-devtools MCP 失败：${message}。请检查 npx 和网络环境后重试。`
      }
    }

    if (args.action === 'register-connect') {
      ctx.metadata({ title: '注册 chrome-devtools MCP（连接已有浏览器）...' })

      if (!args.cdp_url || args.cdp_url.trim().length === 0) {
        return '连接已有浏览器需要提供 cdp_url 参数（如 http://localhost:9222）。请先以 remote debugging 模式启动 Chrome，并传入 CDP 端点 URL。'
      }

      const cdpUrl = args.cdp_url.trim()
      try {
        new URL(cdpUrl)
      } catch {
        return `cdp_url "${cdpUrl}" 不是有效的 URL。请提供格式如 http://localhost:9222 的 CDP 端点。`
      }

      const existingStatus = await checkMcpStatus(MCP_NAME, worktree)
      if (existingStatus.connected) {
        return {
          output: 'chrome-devtools MCP 已注册且已连接。如需切换到连接已有浏览器，请先 disconnect 再 register-connect。',
          metadata: { connected: true, status: existingStatus.status },
        }
      }

      try {
        const result = await client.mcp.add({
          body: {
            name: MCP_NAME,
            config: {
              type: 'local',
              command: [...DEFAULT_COMMAND],
              environment: { CHROME_CDP_URL: cdpUrl },
            },
          },
          query: { directory: worktree },
        })

        const statuses = result.data as Record<string, { status: string }> | undefined
        const newStatus = statuses?.[MCP_NAME]
        if (newStatus?.status === 'connected') {
          return {
            output: `已注册 chrome-devtools MCP 并连接到已有浏览器（${cdpUrl}），工具可用。`,
            metadata: { connected: true, status: 'connected', cdpUrl },
          }
        }

        return {
          output: `chrome-devtools MCP 已注册（连接 ${cdpUrl}），当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请确认 CDP 端点可达后重试 check。`,
          metadata: { connected: false, status: newStatus?.status, cdpUrl },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `注册 chrome-devtools MCP 失败：${message}。请确认 CDP 端点 ${cdpUrl} 可达后重试。`
      }
    }

    if (args.action === 'disconnect') {
      ctx.metadata({ title: '断开 chrome-devtools MCP...' })

      try {
        await client.mcp.disconnect({
          path: { name: MCP_NAME },
          query: { directory: worktree },
        })

        return {
          output: '已断开 chrome-devtools MCP 连接。如需重新使用，请调用 register-new 或 register-connect。',
          metadata: { connected: false, status: 'disconnected' },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `断开 chrome-devtools MCP 失败：${message}。可能 MCP 尚未注册。`
      }
    }

    return `不支持的操作类型：${args.action}`
  },
})
