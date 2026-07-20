import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { getGlobalClient } from '../services/client-holder.js'
import {
  BROWSER_NAMES,
  detectBrowser,
  summarizeDetection,
  buildDetectionAdvice,
} from '../services/browser-detect.js'

const MCP_NAME = 'playwright'
const BASE_COMMAND = ['npx', '-y', '@playwright/mcp@latest'] as const

// MCP 注册后轮询等待连接就绪的参数
const POLL_INTERVAL_MS = 1000
const POLL_MAX_ATTEMPTS = 15

// 浏览器内核名映射：browser 参数 → @playwright/mcp --browser CLI 值
const BROWSER_KERNEL_MAP: Record<string, string> = {
  Chrome: 'chrome',
  Edge: 'msedge',
  Chromium: 'chrome',
  Firefox: 'firefox',
  WebKit: 'webkit',
}

// 浏览器优先级（用于自动选择）
const BROWSER_PRIORITY: Record<string, number> = {
  Chrome: 5,
  Edge: 4,
  Chromium: 3,
  Firefox: 2,
  WebKit: 1,
}

async function checkMcpStatus(
  name: string,
  worktree: string,
): Promise<{ connected: boolean; status: string; error?: string }> {
  const client = getGlobalClient()
  if (!client) {
    return { connected: false, status: 'unavailable', error: 'opencode 客户端不可用' }
  }

  try {
    const result = await client.mcp.status({ directory: worktree })
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
    if (result.status === 'failed' || result.status === 'disabled') {
      return result
    }
    ctx.metadata({
      title: `等待 Playwright MCP 就绪（${attempt}/${POLL_MAX_ATTEMPTS}，当前状态：${result.status}）...`,
    })
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  const last = await checkMcpStatus(name, worktree)
  const timeoutSec = (POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS) / 1000
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

/**
 * 自动发现可调试的浏览器（用于 attach 模式）
 */
async function discoverDebuggableBrowser(
  browser?: string,
): Promise<{ browser: string; port: number; wsEndpoint: string } | null> {
  const targets = browser ? [browser] : [...BROWSER_NAMES]
  const results = await Promise.all(targets.map((b) => detectBrowser(b)))
  const debuggable = results.filter((r) => r.debuggable && r.port && r.wsEndpoint)
  if (debuggable.length === 0) return null
  debuggable.sort(
    (a, b) => (BROWSER_PRIORITY[b.browser] ?? 0) - (BROWSER_PRIORITY[a.browser] ?? 0),
  )
  const best = debuggable[0]
  return { browser: best.browser, port: best.port!, wsEndpoint: best.wsEndpoint! }
}

/**
 * 自动发现已安装的浏览器（用于 launch 模式）
 */
async function discoverInstalledBrowser(
  browser?: string,
): Promise<{ browser: string; executablePath: string } | null> {
  const targets = browser ? [browser] : [...BROWSER_NAMES]
  const results = await Promise.all(targets.map((b) => detectBrowser(b)))
  const installed = results.filter((r) => r.installed && r.executablePath)
  if (installed.length === 0) return null
  installed.sort(
    (a, b) => (BROWSER_PRIORITY[b.browser] ?? 0) - (BROWSER_PRIORITY[a.browser] ?? 0),
  )
  const best = installed[0]
  return { browser: best.browser, executablePath: best.executablePath! }
}

/**
 * 根据 mode 和结构化参数构建基础 CLI 参数
 * 返回 null 表示需要向用户报错（附带错误信息）
 */
async function buildModeArgs(
  mode: 'attach' | 'launch' | 'launch-headless',
  browser?: string,
  port?: number,
  executablePath?: string,
  ctx?: { metadata: (m: { title: string }) => void },
): Promise<{ args: string[]; desc: string } | { error: string }> {
  // --- attach：接管现有浏览器 ---
  if (mode === 'attach') {
    let resolvedPort = port
    let discoveredBrowser: string | undefined

    if (!resolvedPort) {
      if (ctx) ctx.metadata({ title: '自动检测可调试的浏览器...' })
      const discovered = await discoverDebuggableBrowser(browser)
      if (!discovered) {
        const browserHint = browser ? `${browser} ` : ''
        return {
          error: [
            `未找到可调试的${browserHint}浏览器。`,
            '',
            '接管现有浏览器需要浏览器已启用远程调试端口。启用方法：',
            '1. Chrome >= M144：在地址栏访问 chrome://inspect/#remote-debugging 启用',
            '2. 命令行启动：chrome --remote-debugging-port=9222 --user-data-dir=<路径>',
            '   或：msedge --remote-debugging-port=9222 --user-data-dir=<路径>',
            '',
            '也可使用 action=detect 查看当前浏览器环境状态。',
            '或使用 mode=launch / mode=launch-headless 启动新浏览器实例。',
          ].join('\n'),
        }
      }
      resolvedPort = discovered.port
      discoveredBrowser = discovered.browser
    }

    const args = ['--cdp-endpoint', `http://127.0.0.1:${resolvedPort}`]
    const desc = `接管浏览器${discoveredBrowser ? `(${discoveredBrowser})` : ''} 端口=${resolvedPort}`
    return { args, desc }
  }

  // --- launch / launch-headless：新开浏览器 ---
  const headless = mode === 'launch-headless'
  let resolvedExePath = executablePath
  let detectedBrowser: string | undefined = browser

  if (!resolvedExePath) {
    if (ctx) ctx.metadata({ title: '自动检测已安装的浏览器...' })
    const discovered = await discoverInstalledBrowser(browser)
    if (!discovered) {
      const browserHint = browser ? `${browser} ` : ''
      return {
        error: [
          `未找到已安装的${browserHint}浏览器。`,
          '',
          '@playwright/mcp 支持 Chromium、Firefox、WebKit 内核，首次使用时 Playwright 会自动下载浏览器二进制。',
          '也可通过 executablePath 参数指定浏览器可执行文件路径，',
          '或使用 action=detect 查看当前浏览器环境状态。',
        ].join('\n'),
      }
    }
    resolvedExePath = discovered.executablePath
    detectedBrowser = discovered.browser
  }

  const args: string[] = ['--isolated']
  if (headless) args.push('--headless')
  const kernel = detectedBrowser ? BROWSER_KERNEL_MAP[detectedBrowser] : undefined
  if (kernel) args.push('--browser', kernel)
  if (resolvedExePath) args.push('--executable-path', resolvedExePath)

  const modeLabel = headless ? '无头' : '有头'
  const desc = `新开${modeLabel}${detectedBrowser ?? '浏览器'}`
  return { args, desc }
}

export const aePlaywrightMcpTool = tool({
  description: [
    '动态注册或检查 @playwright/mcp 服务，支持三种常见连接模式和全部 CLI 参数透传。',
    '',
    '功能说明：',
    '- check：检查 Playwright MCP 是否已注册且已连接',
    '- register：注册 MCP 服务，支持三种常见模式 + 高级参数透传',
    '- disconnect：断开 Playwright MCP 连接',
    '- detect：检测当前环境中已安装和运行中的浏览器（Chrome、Edge、Chromium、Firefox、WebKit），',
    '  返回 executablePath、wsEndpoint、port 等信息供构造 mcpArgs',
    '  仅返回环境信息，不注册 MCP，不连接浏览器',
    '',
    '三种常见连接模式（action=register 时通过 mode 指定）：',
    '1. attach：接管现有浏览器（通过 CDP 端点连接运行中的 Chromium 内核浏览器）',
    '   - 需要浏览器已启用远程调试端口，port 未提供时自动检测',
    '   - 复用已有登录态和浏览器状态',
    '2. launch：新开浏览器（有头模式，可见窗口）',
    '   - browser 指定类型，executablePath 指定路径，未提供时自动检测',
    '3. launch-headless：新开无头浏览器（无 UI，适合 CI/服务器/自动化）',
    '   - 涉及手动登录/验证码/扫码时禁止使用',
    '',
    '高级参数透传：',
    '- mcpArgs 追加到 mode 生成的参数之后，实现 @playwright/mcp 全部 CLI 特性',
    '- mode 省略时 mcpArgs 作为完整参数直接透传（纯 passthrough 模式）',
    '- 支持的完整 CLI 参数列表详见 ae:playwright 技能的 references/configuration.md',
    '- 常用 mcpArgs 示例：',
    '  ["--isolated", "--headless"] 启动独立无头浏览器',
    '  ["--isolated", "--browser", "firefox"] 使用 Firefox 浏览器',
    '  ["--caps", "vision,pdf,devtools"] 启用坐标交互、PDF 和开发者工具能力',
    '  ["--device", "iPhone 15"] 模拟设备',
    '  ["--proxy-server", "http://myproxy:3128"] 使用代理',
    '  ["--storage-state", "path/to/state.json"] 加载存储状态',
    '  ["--config", "path/to/config.json"] 使用 JSON 配置文件',
    '  ["--extension"] 通过 Playwright 扩展连接已运行的 Edge/Chrome',
    '',
    '稳定性保障：',
    '- register 后轮询等待 MCP 进入 connected 状态',
    '- 已有连接时先断开再重新注册，避免端口冲突',
    '',
    '注册后验证：',
    '- register 成功后，必须立即调用 browser_tabs action=list 验证连接可用',
    '',
    '适用场景：',
    '- ae:playwright 技能在使用浏览器工具前确认或注册 MCP 服务',
    '- 需要连接活跃浏览器复用登录态和调试会话（attach）',
    '- 需要启动独立浏览器进行自动化测试（launch / launch-headless）',
    '- 需要检测浏览器环境以智能选择连接方式（detect）',
    '',
    '不适用场景：',
    '- 不负责直接执行浏览器操作，只管理 MCP 服务的生命周期',
  ].join('\n'),
  args: {
    action: z.enum(['check', 'register', 'disconnect', 'detect']).describe(
      '操作类型：check 检查状态，register 注册 MCP，disconnect 断开连接，detect 检测浏览器环境',
    ),
    mode: z
      .enum(['attach', 'launch', 'launch-headless'])
      .optional()
      .describe(
        '注册模式，仅 action=register 时使用。' +
          'attach=接管现有浏览器（需已启用远程调试），' +
          'launch=新开有头浏览器，' +
          'launch-headless=新开无头浏览器。' +
          '省略时使用 mcpArgs 作为完整参数直接透传。',
      ),
    browser: z
      .enum(BROWSER_NAMES)
      .optional()
      .describe(
        '浏览器类型：Chrome、Edge、Chromium、Firefox、WebKit。' +
          'attach 模式指定要接管的浏览器；launch/launch-headless 指定要启动的浏览器。' +
          '未指定时自动检测或选择优先级最高的。',
      ),
    port: z
      .number()
      .int()
      .min(1)
      .max(65535)
      .optional()
      .describe('CDP 远程调试端口号，仅 mode=attach 时使用。未提供时自动检测。'),
    executablePath: z
      .string()
      .optional()
      .describe(
        '浏览器可执行文件路径，仅 mode=launch/launch-headless 时使用。' +
          '未提供时根据 browser 自动检测。',
      ),
    mcpArgs: z
      .array(z.string())
      .optional()
      .describe(
        '追加的 @playwright/mcp CLI 参数数组，追加到 mode 生成的参数之后。' +
          'mode 省略时作为完整参数直接透传。' +
          '用于实现高级特性：--caps、--device、--proxy-server、--storage-state、' +
          '--config、--extension、--init-script 等。' +
          '完整参数列表详见 ae:playwright 技能的 references/configuration.md。',
      ),
  },
  execute: async (args, ctx) => {
    const worktree = ctx.worktree
    const client = getGlobalClient()

    // --- check ---
    if (args.action === 'check') {
      ctx.metadata({ title: '检查 Playwright MCP 状态...' })
      const result = await checkMcpStatus(MCP_NAME, worktree)
      if (result.connected) {
        return {
          output: 'Playwright MCP 已注册且已连接，浏览器工具可用。',
          metadata: { connected: true, status: result.status },
        }
      }

      const hints: string[] = ['Playwright MCP 未就绪。']
      if (result.status === 'not_registered') {
        hints.push('请使用 action=register 注册 MCP。')
      } else if (result.status === 'disabled') {
        hints.push('MCP 已注册但被禁用，请在 opencode 配置中启用 playwright。')
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
          '浏览器环境检测结果：',
          '',
          summary,
          '',
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
        const message = error instanceof Error ? error.message : String(error)
        return `浏览器环境检测失败：${message}。请检查系统环境后重试。`
      }
    }

    if (!client) {
      return 'opencode 客户端不可用，无法动态注册 Playwright MCP。请确认在 opencode 运行时环境中使用。'
    }

    // --- register ---
    if (args.action === 'register') {
      // 注册前检查：已连接或异常状态时先断开
      const existingStatus = await checkMcpStatus(MCP_NAME, worktree)
      if (existingStatus.connected) {
        ctx.metadata({ title: '检测到已有连接，先断开旧连接...' })
        try {
          await client.mcp.disconnect({ name: MCP_NAME, directory: worktree })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return `断开旧连接失败：${message}。请先手动 disconnect 后再 register。`
        }
      } else if (
        existingStatus.status === 'failed' ||
        existingStatus.status === 'needs_auth' ||
        existingStatus.status === 'needs_client_registration'
      ) {
        try {
          await client.mcp.disconnect({ name: MCP_NAME, directory: worktree })
        } catch {
          // 忽略清理失败
        }
      }

      // 构建参数：mode 生成基础参数 + mcpArgs 追加
      let baseArgs: string[] = []
      let modeDesc = '（默认配置）'

      if (args.mode) {
        const modeResult = await buildModeArgs(
          args.mode,
          args.browser,
          args.port,
          args.executablePath,
          ctx,
        )
        if ('error' in modeResult) {
          return {
            output: modeResult.error,
            metadata: { connected: false, status: 'mode_error' },
          }
        }
        baseArgs = modeResult.args
        modeDesc = modeResult.desc
      }

      const extraArgs = args.mcpArgs ?? []
      const mcpArgs = [...baseArgs, ...extraArgs]
      const command = [...BASE_COMMAND, ...mcpArgs]

      const argsDesc =
        mcpArgs.length > 0 ? mcpArgs.join(' ') : '（默认配置）'
      ctx.metadata({ title: `注册 Playwright MCP（${modeDesc}，参数：${argsDesc}）...` })

      try {
        await client.mcp.add({
          name: MCP_NAME,
          config: { type: 'local', command },
          directory: worktree,
        })

        const ready = await waitForMcpReady(MCP_NAME, worktree, ctx)
        if (ready.connected) {
          return {
            output: `已注册 Playwright MCP（${modeDesc}，参数：${argsDesc}），工具可用。请立即调用 browser_tabs action=list 验证连接。`,
            metadata: { connected: true, status: 'connected', mcpArgs, mode: modeDesc },
          }
        }

        return {
          output: `Playwright MCP 已注册，但等待就绪时未进入 connected 状态${ready.error ? '：' + ready.error : '。'}当前状态：${ready.status}。请稍后调用 action=check 重新检查，或调用 browser_tabs action=list 验证连接是否已就绪。`,
          metadata: { connected: false, status: ready.status, mcpArgs, mode: modeDesc },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `注册 Playwright MCP 失败：${message}。请检查 npx 和网络环境后重试。`
      }
    }

    // --- disconnect ---
    if (args.action === 'disconnect') {
      ctx.metadata({ title: '断开 Playwright MCP...' })

      try {
        await client.mcp.disconnect({ name: MCP_NAME, directory: worktree })
        return {
          output: '已断开 Playwright MCP 连接。如需重新使用，请调用 register。',
          metadata: { connected: false, status: 'disconnected' },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return `断开 Playwright MCP 失败：${message}。可能 MCP 尚未注册。`
      }
    }

    return `不支持的操作类型：${args.action}`
  },
})
