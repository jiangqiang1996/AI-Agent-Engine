import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { getGlobalClient } from '../services/client-holder.js'
import {
  BROWSER_NAMES,
  detectBrowser,
  summarizeDetection,
  buildDetectionAdvice,
  findBrowserExecutable,
  getBrowserUserDataDirs,
  readDevToolsActivePortFromDirs,
  resolveSmartRegister,
} from '../services/browser-detect.js'

const MCP_NAME = 'chrome-devtools'
const BASE_COMMAND = ['npx', '-y', 'chrome-devtools-mcp@latest'] as const
const AUTOCONNECT_COMMAND = [
  'npx', '-y', 'chrome-devtools-mcp@latest', '--autoConnect',
] as const

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

export const aeChromeDevtoolsMcpTool = tool({
  description: [
    '动态注册或检查 chrome-devtools-mcp 服务。',
    '',
    '功能说明：',
    '- check：检查 chrome-devtools MCP 是否已注册且已连接',
    '- register：注册 chrome-devtools MCP，连接模式必须指定浏览器和调试端口',
    '- disconnect：断开 chrome-devtools MCP 连接',
    '- detect：检测当前环境中已安装和运行中的 Chromium 内核浏览器，',
    '  用于智能连接决策。仅返回环境信息，不注册 MCP，不连接浏览器',
    '',
    '注册模式：',
    '- mode=connect（默认）：通过用户指定的浏览器调试端口连接已有浏览器实例，',
    '  需提供 browser 和 port 参数；自动检测 DevToolsActivePort 优先使用 WebSocket 连接，',
    '  兼容浏览器内置 inspect#remote-debugging 模式',
    '- mode=autoConnect：自动发现并连接已运行的浏览器实例，',
    '  无需 --remote-debugging-port（需 Chrome >= M144）；',
    '  指定 browser 参数可连接 Edge、Brave、Vivaldi 等非 Chrome 浏览器',
    '- mode=isolated：启动独立的新浏览器实例（独立配置文件，适合自动化测试）；',
    '  指定 browser 参数可启动非 Chrome 浏览器（如 Edge）',
    '',
    '浏览器启动选项（仅 mode=isolated 时生效，连接已有浏览器的模式不适用）：',
    '- headless=true：以无头模式运行（不显示浏览器窗口），',
    '  适合 CI 环境或无需视觉观察的自动化任务',
    '',
    '连接活跃浏览器的步骤（connect 模式）：',
    '1. 在浏览器中访问 inspect#remote-debugging 页面启用远程调试（推荐），',
    '   或以命令行参数启动：',
    '   Chrome 运行 chrome --remote-debugging-port=<端口>，',
    '   Edge 运行 msedge --remote-debugging-port=<端口>',
    '2. 调用 register 并指定 browser 和 port，',
    '   例如 action=register browser=Edge port=54522',
    '',
    '连接活跃浏览器的步骤（autoConnect 模式）：',
    '1. 确保浏览器已运行并启用了远程调试',
    '   （浏览器内置 inspect#remote-debugging 页面或命令行 --remote-debugging-port）',
    '2. 调用 action=register mode=autoConnect（Chrome）或',
    '   action=register mode=autoConnect browser=Edge（Edge 等非 Chrome 浏览器）',
    '3. 浏览器弹出对话框时点击"允许"',
    '',
    '智能连接决策（detect action）：',
    '- 检测当前环境中已安装的 Chromium 内核浏览器',
    '  （Chrome、Edge、Brave、Vivaldi）',
    '- 检测正在运行的浏览器进程，并验证是否启用了远程调试',
    '  （通过 DevToolsActivePort 文件 + 端口可达性验证）',
    '- 返回检测结果和建议的连接方式，',
    '  用于 ae:chrome-devtools 技能的智能决策流程',
    '',
    '适用场景：',
    '- ae:chrome-devtools 技能在使用浏览器工具前确认或注册 MCP 服务',
    '- 需要连接活跃浏览器复用登录态和调试会话',
    '- 需要启动独立浏览器进行自动化测试（可配合 headless 选项）',
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
      '操作类型：check 检查状态，register 注册 MCP，' +
        'disconnect 断开连接，detect 检测浏览器环境（不注册不连接）',
    ),
    mode: z.enum(['connect', 'autoConnect', 'isolated'])
      .optional()
      .describe(
        '注册模式：connect 连接已有浏览器（需指定 browser 和 port），' +
          'autoConnect 自动发现已运行的浏览器（无需调试端口，需 Chrome >= M144，' +
          '指定 browser 可连接非 Chrome 浏览器），' +
          'isolated 启动独立新浏览器（指定 browser 可启动非 Chrome 浏览器）。' +
          '未指定时按智能决策流程自动选择',
      ),
    browser: z.enum(BROWSER_NAMES)
      .optional()
      .describe(
        '浏览器类型：mode=connect 时必填（Chrome、Edge、Brave 或 Vivaldi）；' +
          'mode=autoConnect 时可选，指定后可连接非 Chrome 浏览器；' +
          'mode=isolated 时可选，指定后启动对应浏览器（未指定则默认启动 Chrome）；' +
          'action=detect 时可选，只检测指定浏览器（未指定则检测全部）',
      ),
    port: z.number().int().min(1).max(65535)
      .optional()
      .describe(
        '浏览器远程调试端口号（mode=connect 时必填），' +
          '由用户以 --remote-debugging-port 启动浏览器后提供',
      ),
    headless: z.boolean()
      .optional()
      .describe(
        '是否以无头模式运行浏览器（不显示浏览器窗口）。' +
          '仅 mode=isolated 时生效；mode=connect 和 autoConnect 连接的是已有浏览器实例，' +
          '此参数不适用。适合 CI 环境、服务器环境或无需视觉观察的自动化任务',
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

      if (args.headless && args.mode && args.mode !== 'isolated') {
        return [
          `headless 选项仅在 mode=isolated 时生效，当前模式为 ${args.mode}（连接已有浏览器实例，无法控制其是否显示窗口）。`,
          '如需使用无头模式，请改用 action=register mode=isolated。',
        ].join('\n')
      }

      // 未指定 mode 时，按智能决策流程自动选择
      let resolvedMode: 'connect' | 'autoConnect' | 'isolated' | undefined = args.mode
      let resolvedBrowser: string | undefined = args.browser
      let resolvedPort: number | undefined = args.port
      let resolvedHeadless: boolean | undefined = args.headless

      if (!resolvedMode) {
        ctx.metadata({ title: '智能决策浏览器连接方式...' })
        const smart = await resolveSmartRegister(args.browser, args.headless)

        if ('output' in smart) {
          return {
            output: smart.output,
            metadata: smart.metadata,
          }
        }

        resolvedMode = smart.mode
        if (smart.mode === 'isolated') {
          resolvedBrowser = smart.browser
          resolvedHeadless = smart.headless
        } else {
          resolvedBrowser = smart.browser
          resolvedPort = smart.port
        }

        ctx.metadata({
          title: `注册 chrome-devtools MCP（智能决策 → ${resolvedMode}${resolvedBrowser ? ' ' + resolvedBrowser : ''}${resolvedPort ? ' 端口 ' + resolvedPort : ''}）...`,
        })
      }

      // mode=isolated
      if (resolvedMode === 'isolated') {
        const browserLabel = resolvedBrowser ?? 'Chrome'
        const modeSuffix = resolvedHeadless ? ' 无头' : ''
        ctx.metadata({
          title: `注册 chrome-devtools MCP（独立 ${browserLabel}${modeSuffix}）...`,
        })

        let isolatedCommand: string[] = [...BASE_COMMAND, '--isolated=true']
        if (resolvedBrowser && resolvedBrowser !== 'Chrome') {
          const execPath = await findBrowserExecutable(resolvedBrowser)
          if (execPath) {
            isolatedCommand = [...isolatedCommand, '--executablePath', execPath]
          }
        }
        if (resolvedHeadless) {
          isolatedCommand = [...isolatedCommand, '--headless=true']
        }

        try {
          const result = await client.mcp.add({
            body: {
              name: MCP_NAME,
              config: { type: 'local', command: isolatedCommand },
            },
            query: { directory: worktree },
          })

          const statuses = result.data as
            | Record<string, { status: string }>
            | undefined
          const newStatus = statuses?.[MCP_NAME]
          if (newStatus?.status === 'connected') {
            const suffix = resolvedHeadless ? '（无头模式）' : ''
            return {
              output: `已注册 chrome-devtools MCP 并启动独立 ${browserLabel} 实例${suffix}，工具可用。请立即调用 chrome-devtools_list_pages 验证连接。`,
              metadata: {
                connected: true,
                status: 'connected',
                mode: 'isolated',
                browser: resolvedBrowser,
                headless: resolvedHeadless,
              },
            }
          }

          return {
            output: `chrome-devtools MCP 已注册，当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等 MCP 连接完成后重试 check。`,
            metadata: {
              connected: false,
              status: newStatus?.status,
              mode: 'isolated',
            },
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          return `注册 chrome-devtools MCP 失败：${message}。请检查 npx 和网络环境后重试。`
        }
      }

      // mode=autoConnect
      if (resolvedMode === 'autoConnect') {
        const browserLabel = resolvedBrowser ?? 'Chrome'
        ctx.metadata({
          title: `注册 chrome-devtools MCP（autoConnect → ${browserLabel}）...`,
        })

        let autoCommand: string[]
        if (resolvedBrowser && resolvedBrowser !== 'Chrome') {
          // 非 Chrome 浏览器：chrome-devtools-mcp 的 --autoConnect 只支持 Chrome，
          // 必须通过 --wsEndpoint 从 DevToolsActivePort 读取连接信息
          const udDirs = getBrowserUserDataDirs(resolvedBrowser)
          const ap = await readDevToolsActivePortFromDirs(udDirs)
          if (ap) {
            autoCommand = [
              ...BASE_COMMAND,
              '--wsEndpoint',
              `ws://127.0.0.1:${ap.port}${ap.wsPath}`,
            ]
          } else {
            // 非 Chrome 浏览器读不到 DevToolsActivePort：--autoConnect 只支持 Chrome，
            // 降级到该命令注定失败，直接返回明确的错误提示
            return {
              output: [
                `autoConnect 模式连接 ${resolvedBrowser} 失败：未找到 ${resolvedBrowser} 的 DevToolsActivePort 文件。`,
                `chrome-devtools-mcp 的 --autoConnect 仅支持 Chrome，非 Chrome 浏览器必须通过 DevToolsActivePort 走 wsEndpoint 连接。`,
                '请确认：',
                `  1. ${resolvedBrowser} 已运行`,
                `  2. 已在 ${resolvedBrowser} 内置 inspect#remote-debugging 页面启用远程调试`,
                `  3. 或使用 action=register mode=connect browser=${resolvedBrowser} port=<端口> 显式指定端口连接`,
              ].join('\n'),
              metadata: {
                connected: false,
                status: 'no_devtools_active_port',
                mode: 'autoConnect',
                browser: resolvedBrowser,
              },
            }
          }
        } else {
          // Chrome 或未指定 browser：使用 --autoConnect 自动发现 Chrome
          autoCommand = [...AUTOCONNECT_COMMAND]
        }

        try {
          const result = await client.mcp.add({
            body: {
              name: MCP_NAME,
              config: { type: 'local', command: autoCommand },
            },
            query: { directory: worktree },
          })

          const statuses = result.data as
            | Record<string, { status: string }>
            | undefined
          const newStatus = statuses?.[MCP_NAME]
          if (newStatus?.status === 'connected') {
            const connDesc =
              resolvedBrowser && resolvedBrowser !== 'Chrome' && autoCommand.includes('--wsEndpoint')
                ? `通过 wsEndpoint 连接到 ${browserLabel}`
                : `通过 autoConnect 连接到 ${browserLabel}`
            return {
              output: `已注册 chrome-devtools MCP 并${connDesc}。请立即调用 chrome-devtools_list_pages 验证连接。`,
              metadata: {
                connected: true,
                status: 'connected',
                mode: 'autoConnect',
                browser: browserLabel,
              },
            }
          }

          const needsAuthHint =
            newStatus?.status === 'needs_auth' ||
            newStatus?.status === 'needs_client_registration'
          const hint = needsAuthHint
            ? `${browserLabel} 可能未启用远程调试或拒绝了连接请求。请确认：1) ${browserLabel} 已运行；2) 已在浏览器内置 inspect#remote-debugging 页面启用远程调试；3) 浏览器弹出对话框时点击"允许"。`
            : `当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等或检查浏览器远程调试设置。`

          return {
            output: `chrome-devtools MCP 已注册，${hint}`,
            metadata: {
              connected: false,
              status: newStatus?.status,
              mode: 'autoConnect',
              browser: browserLabel,
            },
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error)
          return [
            `注册 chrome-devtools MCP（autoConnect）失败：${message}。`,
            '请确认：',
            `  1. ${browserLabel} 已运行并启用远程调试`,
            '  2. 已在浏览器内置 inspect#remote-debugging 页面启用远程调试',
            '  3. 网络环境可访问 npx',
            '如仍无法连接，可使用 action=register mode=connect 通过调试端口连接，或 mode=isolated 启动独立浏览器。',
          ].join('\n')
        }
      }

      // mode=connect
      if (!resolvedBrowser) {
        return '连接模式必须指定 browser 参数（Chrome、Edge、Brave 或 Vivaldi）。'
      }
      if (!resolvedPort) {
        return `连接模式必须指定 port 参数。请先以远程调试模式启动 ${resolvedBrowser}（例如 ${resolvedBrowser === 'Edge' ? 'msedge' : resolvedBrowser.toLowerCase()} --remote-debugging-port=<端口>），然后提供端口号。`
      }

      ctx.metadata({
        title: `注册 chrome-devtools MCP（连接 ${resolvedBrowser} 端口 ${resolvedPort}）...`,
      })

      let command: string[]
      const userDataDirs = getBrowserUserDataDirs(resolvedBrowser)
      const activePort = await readDevToolsActivePortFromDirs(userDataDirs)
      let connType = 'browserUrl'

      if (activePort && activePort.port === resolvedPort) {
        const wsEndpoint = `ws://127.0.0.1:${activePort.port}${activePort.wsPath}`
        command = [...BASE_COMMAND, '--wsEndpoint', wsEndpoint]
        connType = 'wsEndpoint'
      } else {
        const browserUrl = `http://127.0.0.1:${resolvedPort}`
        command = [...BASE_COMMAND, '--browserUrl', browserUrl]
      }

      try {
        const result = await client.mcp.add({
          body: {
            name: MCP_NAME,
            config: { type: 'local', command },
          },
          query: { directory: worktree },
        })

        const statuses = result.data as
          | Record<string, { status: string }>
          | undefined
        const newStatus = statuses?.[MCP_NAME]
        if (newStatus?.status === 'connected') {
          return {
            output: `已注册 chrome-devtools MCP 并连接到 ${resolvedBrowser}（端口 ${resolvedPort}，${connType}）。请立即调用 chrome-devtools_list_pages 验证连接。`,
            metadata: {
              connected: true,
              status: 'connected',
              mode: 'connect',
              browser: resolvedBrowser,
              port: resolvedPort,
              connType,
            },
          }
        }

        const needsAuthHint =
          newStatus?.status === 'needs_auth' || newStatus?.status === 'failed'
        const hint = needsAuthHint
          ? `${resolvedBrowser}（端口 ${resolvedPort}）可能未启用远程调试或拒绝了连接请求。请确认：1) 已在浏览器内置 inspect#remote-debugging 页面启用远程调试，或以 --remote-debugging-port=${resolvedPort} 参数启动；2) 浏览器弹出对话框时点击"允许"。`
          : `当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等或检查浏览器远程调试设置。`

        return {
          output: `chrome-devtools MCP 已注册，${hint}`,
          metadata: {
            connected: false,
            status: newStatus?.status,
            mode: 'connect',
          },
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error)
        return [
          `注册 chrome-devtools MCP 失败：${message}。`,
          '请确认：',
          `  1. ${resolvedBrowser} 已以 --remote-debugging-port=${resolvedPort} 参数启动并正在运行`,
          `  2. 端口 ${resolvedPort} 可访问（可尝试在浏览器中访问 http://127.0.0.1:${resolvedPort}/json/version 验证）`,
          '如仍无法连接，可使用 action=register mode=autoConnect 自动发现浏览器（无需调试端口，需 Chrome >= M144），或 mode=isolated 启动独立浏览器。',
        ].join('\n')
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
