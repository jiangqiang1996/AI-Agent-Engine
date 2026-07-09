import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { getGlobalClient } from '../services/client-holder.js'
import {
  BROWSER_NAMES,
  detectBrowser,
  summarizeDetection,
  buildDetectionAdvice,
} from '../services/browser-detect.js'

const MCP_NAME = 'chrome-devtools'
const BASE_COMMAND = ['npx', '-y', 'chrome-devtools-mcp@latest'] as const

// MCP 注册后轮询等待连接就绪的参数
// chrome-devtools-mcp 需要时间启动浏览器、建立 WebSocket 连接
const POLL_INTERVAL_MS = 1000
const POLL_MAX_ATTEMPTS = 15 // 最长等待约 15 秒

async function checkMcpStatus(
  name: string,
  worktree: string,
): Promise<{ connected: boolean; status: string; error?: string }> {
  const client = getGlobalClient()
  if (!client) {
    return { connected: false, status: 'unavailable', error: 'opencode 客户端不可用' }
  }

  try {
    const result = await client.mcp.status({ query: { directory: worktree } })
    const statuses = result.data as
      | Record<string, { status: string; error?: string }>
      | undefined
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

/**
 * 注册 MCP 后轮询等待连接就绪
 * 解决「MCP 已注册但工具调用失败」的稳定性问题：
 * chrome-devtools-mcp 启动浏览器和建立 WebSocket 连接需要时间，
 * client.mcp.add 返回时可能状态还是 needs_auth/needs_client_registration
 * 或尚未完成握手，直接返回会导致后续工具调用失败。
 */
async function waitForMcpReady(
  name: string,
  worktree: string,
  ctx: { metadata: (m: { title: string }) => void },
): Promise<{ connected: boolean; status: string; error?: string }> {
  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    const result = await checkMcpStatus(name, worktree)
    if (result.connected) {
      return result
    }

    // 终态判定：failed 和 disabled 不再轮询
    if (result.status === 'failed' || result.status === 'disabled') {
      return result
    }

    // 非终态：needs_auth / needs_client_registration / check_failed 等继续轮询
    ctx.metadata({
      title: `等待 chrome-devtools MCP 就绪（${attempt}/${POLL_MAX_ATTEMPTS}，当前状态：${result.status}）...`,
    })
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  // 轮询超时：根据最后状态提供针对性提示
  const last = await checkMcpStatus(name, worktree)
  const timeoutSec = POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000
  if (last.status === 'connected') {
    return { connected: true, status: 'connected' }
  }
  const hints: Record<string, string> = {
    needs_auth: 'MCP 需要授权，请在 opencode 中确认授权后重试',
    needs_client_registration: 'MCP 需要客户端注册，请检查 opencode MCP 配置',
    not_registered: 'MCP 未注册成功，请检查 npx 和网络环境后重新 register',
    check_failed: '无法获取 MCP 状态，请检查 opencode 客户端连接',
  }
  const hint = hints[last.status] ?? '请稍后调用 action=check 重新检查'
  return {
    connected: false,
    status: 'timeout',
    error: `MCP 注册后等待超时（${timeoutSec}s），最后状态：${last.status}。${hint}。`,
  }
}

export const aeChromeDevtoolsMcpTool = tool({
  description: [
    '动态注册或检查 chrome-devtools-mcp 服务。',
    '',
    '功能说明：',
    '- check：检查 chrome-devtools MCP 是否已注册且已连接',
    '- register：通过 mcpArgs 传入 chrome-devtools-mcp 的 CLI 参数，动态注册 MCP 服务',
    '- disconnect：断开 chrome-devtools MCP 连接',
    '- detect：检测当前环境中已安装和运行中的 Chromium 内核浏览器，',
    '  返回 executablePath、wsEndpoint、port 等信息供调用方构造 mcpArgs',
    '  仅返回环境信息，不注册 MCP，不连接浏览器',
    '',
    '稳定性保障：',
    '- register 调用 client.mcp.add 后会轮询等待 MCP 真正进入 connected 状态，',
    '  避免「已注册但工具调用失败」的问题（chrome-devtools-mcp 启动浏览器和',
    '  建立 WebSocket 连接需要时间，add 返回时可能尚未完成握手）',
    '- 若轮询超时仍未 connected，返回提示让调用方知道需要重试 check',
    '',
    'register 参数透传：',
    '- mcpArgs 是 chrome-devtools-mcp 的 CLI 参数数组，原样追加到',
    '  npx -y chrome-devtools-mcp@latest 之后执行',
    '- 支持的完整 CLI 参数列表详见 ae:chrome-devtools 技能的 references/configuration.md',
    '- 常用参数示例：',
    '  ["--isolated", "--headless"] 启动独立无头浏览器',
    '  ["--wsEndpoint", "ws://127.0.0.1:9222/devtools/browser/abc"] 通过 WebSocket 连接',
    '  ["--browserUrl", "http://127.0.0.1:9222"] 通过 HTTP 连接',
    '  ["--autoConnect"] 自动发现已运行的 Chrome（需 Chrome >= M144）',
    '  ["--isolated", "--executablePath", "C:\\\\path\\\\to\\\\edge.exe"] 启动指定浏览器',
    '- mcpArgs 省略或为空时，以默认配置启动新 Chrome 实例',
    '',
    'detect 检测结果：',
    '- 检测已安装的 Chromium 内核浏览器（Chrome、Edge、Chromium）',
    '  chrome-devtools-mcp 官方正式支持 Chrome 和 Chrome for Testing，',
    '  其他 Chromium 内核浏览器可能可用但不保证',
    '- 返回 executablePath（供 --executablePath 使用）',
    '- 返回 wsEndpoint（供 --wsEndpoint 使用）和 port（供 --browserUrl 使用）',
    '- 返回建议的 mcpArgs 数组，供调用方直接使用',
    '',
    '适用场景：',
    '- ae:chrome-devtools 技能在使用浏览器工具前确认或注册 MCP 服务',
    '- 需要连接活跃浏览器复用登录态和调试会话',
    '- 需要启动独立浏览器进行自动化测试（可配合 --headless）',
    '- 需要检测浏览器环境以智能选择连接方式',
    '',
    '不适用场景：',
    '- 不负责直接执行浏览器操作，只管理 MCP 服务的生命周期',
    '',
    '注册后验证：',
    '- register 成功后，必须立即调用 chrome-devtools_list_pages 列出当前页面以验证连接可用',
    '- 如果 list_pages 调用失败，说明注册未生效，需要排查或重试',
  ].join('\n'),
  args: {
    action: z.enum(['check', 'register', 'disconnect', 'detect']).describe(
      '操作类型：check 检查状态，register 注册 MCP（需提供 mcpArgs），' +
        'disconnect 断开连接，detect 检测浏览器环境（不注册不连接）',
    ),
    mcpArgs: z
      .array(z.string())
      .optional()
      .describe(
        'chrome-devtools-mcp 的 CLI 参数数组，仅 action=register 时使用。' +
          '原样追加到 npx -y chrome-devtools-mcp@latest 之后。' +
          '例如 ["--isolated", "--headless"] 或 ' +
          '["--wsEndpoint", "ws://127.0.0.1:9222/devtools/browser/abc"]。' +
          '支持的完整参数列表详见 ae:chrome-devtools 技能的 references/configuration.md。' +
          '省略或为空时以默认配置启动新 Chrome 实例。',
      ),
    browser: z
      .enum(BROWSER_NAMES)
      .optional()
      .describe(
        '仅 action=detect 时使用，指定只检测某个浏览器（Chrome、Edge 或 Chromium）。' +
          '未指定则检测全部。',
      ),
  },
  execute: async (args, ctx) => {
    const worktree = ctx.worktree
    const client = getGlobalClient()

    // --- check ---
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
        hints.push('请使用 action=register 注册 MCP。')
      } else if (result.status === 'disabled') {
        hints.push('MCP 已注册但被禁用，请在 opencode 配置中启用 chrome-devtools。')
      } else if (result.status === 'failed') {
        hints.push(
          `MCP 连接失败：${result.error ?? '未知错误'}。可尝试 disconnect 后重新 register。`,
        )
      } else if (result.error) {
        hints.push(result.error)
      }

      return {
        output: hints.join(' '),
        metadata: { connected: false, status: result.status },
      }
    }

    // --- detect ---
    if (args.action === 'detect') {
      ctx.metadata({ title: '检测浏览器环境...' })

      try {
        const targets = args.browser ? [args.browser] : [...BROWSER_NAMES]
        const results = await Promise.all(targets.map((b) => detectBrowser(b)))

        const summary = summarizeDetection(results)
        const installed = results.filter((r) => r.installed)
        const debuggable = results.filter((r) => r.debuggable)
        const runningNotDebuggable = results.filter(
          (r) => r.processRunning && !r.debuggable,
        )

        const lines: string[] = [
          '浏览器环境检测结果：', '', summary, '',
          ...buildDetectionAdvice(results),
        ]

        return {
          output: lines.join('\n'),
          metadata: {
            installedBrowsers: installed.map((r) => r.browser),
            debuggableBrowsers: debuggable.map((r) => ({
              browser: r.browser,
              port: r.port,
              wsEndpoint: r.wsEndpoint,
            })),
            runningNotDebuggableBrowsers: runningNotDebuggable.map(
              (r) => r.browser,
            ),
            results,
          },
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        return `浏览器环境检测失败：${message}。请检查系统环境后重试。`
      }
    }

    if (!client) {
      return 'opencode 客户端不可用，无法动态注册 chrome-devtools MCP。请确认在 opencode 运行时环境中使用。'
    }

    // --- register ---
    if (args.action === 'register') {
      const existingStatus = await checkMcpStatus(MCP_NAME, worktree)
      if (existingStatus.connected) {
        return {
          output:
            'chrome-devtools MCP 已注册且已连接。如需重新注册，请先 disconnect 再 register。',
          metadata: { connected: true, status: existingStatus.status },
        }
      }

      // 构建完整命令：npx -y chrome-devtools-mcp@latest [...mcpArgs]
      const mcpArgs = args.mcpArgs ?? []
      const command = [...BASE_COMMAND, ...mcpArgs]

      const argsDesc = mcpArgs.length > 0 ? mcpArgs.join(' ') : '（默认配置）'
      ctx.metadata({
        title: `注册 chrome-devtools MCP（参数：${argsDesc}）...`,
      })

      try {
        await client.mcp.add({
          body: {
            name: MCP_NAME,
            config: { type: 'local', command },
          },
          query: { directory: worktree },
        })

        // 注册后轮询等待 MCP 就绪
        const ready = await waitForMcpReady(MCP_NAME, worktree, ctx)
        if (ready.connected) {
          return {
            output: `已注册 chrome-devtools MCP（${argsDesc}），工具可用。请立即调用 chrome-devtools_list_pages 验证连接。`,
            metadata: {
              connected: true,
              status: 'connected',
              mcpArgs,
            },
          }
        }

        return {
          output: `chrome-devtools MCP 已注册，但等待就绪时未进入 connected 状态${ready.error ? '：' + ready.error : '。'}当前状态：${ready.status}。请稍后调用 action=check 重新检查，或调用 chrome-devtools_list_pages 验证连接是否已就绪。`,
          metadata: {
            connected: false,
            status: ready.status,
            mcpArgs,
          },
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        return `注册 chrome-devtools MCP 失败：${message}。请检查 npx 和网络环境后重试。`
      }
    }

    // --- disconnect ---
    if (args.action === 'disconnect') {
      ctx.metadata({ title: '断开 chrome-devtools MCP...' })

      try {
        await client.mcp.disconnect({
          path: { name: MCP_NAME },
          query: { directory: worktree },
        })

        return {
          output: '已断开 chrome-devtools MCP 连接。如需重新使用，请调用 register。',
          metadata: { connected: false, status: 'disconnected' },
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        return `断开 chrome-devtools MCP 失败：${message}。可能 MCP 尚未注册。`
      }
    }

    return `不支持的操作类型：${args.action}`
  },
})
