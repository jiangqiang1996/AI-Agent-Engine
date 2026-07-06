import { promises as fs } from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { getGlobalClient } from '../services/client-holder.js'

const MCP_NAME = 'chrome-devtools'
const BASE_COMMAND = ['npx', '-y', 'chrome-devtools-mcp@latest'] as const
const AUTOCONNECT_COMMAND = ['npx', '-y', 'chrome-devtools-mcp@latest', '--autoConnect'] as const

const BROWSER_NAMES = ['Chrome', 'Edge', 'Brave', 'Vivaldi'] as const

function getBrowserUserDataDir(browser: string): string | null {
  const platform = process.platform
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir() || ''

  const dirMap: Record<string, Record<string, string>> = {
    win32: {
      Chrome: path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data'),
      Edge: path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'User Data'),
      Brave: path.join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware', 'Brave-Browser', 'User Data'),
      Vivaldi: path.join(process.env.LOCALAPPDATA ?? '', 'Vivaldi', 'User Data'),
    },
    darwin: {
      Chrome: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
      Edge: path.join(home, 'Library', 'Application Support', 'Microsoft Edge'),
      Brave: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
      Vivaldi: path.join(home, 'Library', 'Application Support', 'Vivaldi'),
    },
    linux: {
      Chrome: path.join(home, '.config', 'google-chrome'),
      Edge: path.join(home, '.config', 'microsoft-edge'),
      Brave: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
      Vivaldi: path.join(home, '.config', 'vivaldi'),
    },
  }

  return dirMap[platform]?.[browser] ?? null
}

async function readDevToolsActivePort(userDataDir: string): Promise<{ port: number; wsPath: string } | null> {
  const filePath = path.join(userDataDir, 'DevToolsActivePort')
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')
    if (lines.length >= 2) {
      const port = parseInt(lines[0], 10)
      const wsPath = lines[1]
      if (!isNaN(port) && wsPath) {
        return { port, wsPath }
      }
    }
  } catch {
    // 文件不存在或无法读取，静默降级
  }
  return null
}

function getBrowserExecutablePaths(browser: string): string[] {
  const platform = process.platform
  const pf86 = process.env['ProgramFiles(x86)'] ?? ''
  const pf = process.env['ProgramFiles'] ?? ''
  const localAppData = process.env['LOCALAPPDATA'] ?? ''

  const pathMap: Record<string, Record<string, string[]>> = {
    win32: {
      Edge: [
        path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ],
      Brave: [
        path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      ],
      Vivaldi: [
        path.join(localAppData, 'Vivaldi', 'Application', 'vivaldi.exe'),
        path.join(pf, 'Vivaldi', 'Application', 'vivaldi.exe'),
      ],
    },
    darwin: {
      Edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      Brave: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
      Vivaldi: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
    },
    linux: {
      Edge: ['/usr/bin/microsoft-edge-stable', '/usr/bin/microsoft-edge'],
      Brave: ['/usr/bin/brave-browser-stable', '/usr/bin/brave-browser'],
      Vivaldi: ['/usr/bin/vivaldi-stable', '/usr/bin/vivaldi'],
    },
  }

  return pathMap[platform]?.[browser] ?? []
}

async function findBrowserExecutable(browser: string): Promise<string | null> {
  if (browser === 'Chrome') return null
  const candidates = getBrowserExecutablePaths(browser)
  for (const p of candidates) {
    try {
      await fs.access(p)
      return p
    } catch {
      // 继续检查下一个候选路径
    }
  }
  return null
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
    '- register：注册 chrome-devtools MCP，连接模式必须指定浏览器和调试端口',
    '- disconnect：断开 chrome-devtools MCP 连接',
    '',
    '注册模式：',
    '- mode=connect（默认）：通过用户指定的浏览器调试端口连接已有浏览器实例，需提供 browser 和 port 参数；自动检测 DevToolsActivePort 优先使用 WebSocket 连接，兼容浏览器内置 inspect#remote-debugging 模式',
    '- mode=autoConnect：自动发现并连接已运行的浏览器实例，无需 --remote-debugging-port；指定 browser 参数可连接 Edge、Brave、Vivaldi 等非 Chrome 浏览器',
    '- mode=isolated：启动独立的新浏览器实例（独立配置文件，适合自动化测试）；指定 browser 参数可启动非 Chrome 浏览器（如 Edge）',
    '',
    '浏览器启动选项（仅 mode=isolated 时生效，连接已有浏览器的模式不适用）：',
    '- headless=true：以无头模式运行（不显示浏览器窗口），适合 CI 环境或无需视觉观察的自动化任务',
    '',
    '连接活跃浏览器的步骤（connect 模式）：',
    '1. 在浏览器中访问 inspect#remote-debugging 页面启用远程调试（推荐），或以命令行参数启动：Chrome 运行 `chrome --remote-debugging-port=<端口>`，Edge 运行 `msedge --remote-debugging-port=<端口>`',
    '2. 调用 register 并指定 browser 和 port，例如 `action=register browser=Edge port=54522`',
    '',
    '连接活跃浏览器的步骤（autoConnect 模式）：',
    '1. 确保浏览器已运行并启用了远程调试（浏览器内置 inspect#remote-debugging 页面或命令行 --remote-debugging-port）',
    '2. 调用 `action=register mode=autoConnect`（Chrome）或 `action=register mode=autoConnect browser=Edge`（Edge 等非 Chrome 浏览器）',
    '3. 浏览器弹出对话框时点击"允许"',
    '',
    '适用场景：',
    '- ae:chrome-devtools 技能在使用浏览器工具前确认或注册 MCP 服务',
    '- 需要连接活跃浏览器复用登录态和调试会话',
    '- 需要启动独立浏览器进行自动化测试（可配合 headless 选项）',
    '',
    '不适用场景：',
    '- 不负责直接执行浏览器操作，只管理 MCP 服务的生命周期',
    '',
    '注册后验证：',
    '- register 成功后，必须立即调用 chrome-devtools_list_pages 列出当前页面以验证连接可用',
    '- 如果 list_pages 调用失败，说明注册未生效，需要排查或重试',
  ].join('\n'),
  args: {
    action: z.enum(['check', 'register', 'disconnect']).describe(
      '操作类型：check 检查状态，register 注册 MCP，disconnect 断开连接',
    ),
    mode: z.enum(['connect', 'autoConnect', 'isolated']).default('connect').describe(
      '注册模式：connect 连接已有浏览器（需指定 browser 和 port），autoConnect 自动发现已运行的浏览器（无需调试端口，指定 browser 可连接非 Chrome 浏览器），isolated 启动独立新浏览器（指定 browser 可启动非 Chrome 浏览器）',
    ),
    browser: z.enum(BROWSER_NAMES).optional().describe(
      '浏览器类型：mode=connect 时必填（Chrome、Edge、Brave 或 Vivaldi）；mode=autoConnect 时可选，指定后可连接非 Chrome 浏览器；mode=isolated 时可选，指定后启动对应浏览器（未指定则默认启动 Chrome）',
    ),
    port: z.number().int().min(1).max(65535).optional().describe(
      '浏览器远程调试端口号（mode=connect 时必填），由用户以 --remote-debugging-port 启动浏览器后提供',
    ),
    headless: z.boolean().optional().describe(
      '是否以无头模式运行浏览器（不显示浏览器窗口）。仅 mode=isolated 时生效；mode=connect 和 autoConnect 连接的是已有浏览器实例，此参数不适用。适合 CI 环境、服务器环境或无需视觉观察的自动化任务',
    ),
  },
  execute: async (args, ctx) => {
    const worktree = ctx.worktree
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
        hints.push('请使用 action=register 注册 MCP。')
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

    if (args.action === 'register') {
      const existingStatus = await checkMcpStatus(MCP_NAME, worktree)
      if (existingStatus.connected) {
        return {
          output: 'chrome-devtools MCP 已注册且已连接。如需重新注册，请先 disconnect 再 register。',
          metadata: { connected: true, status: existingStatus.status },
        }
      }

      if (args.headless && args.mode !== 'isolated') {
        return [
          `headless 选项仅在 mode=isolated 时生效，当前模式为 ${args.mode}（连接已有浏览器实例，无法控制其是否显示窗口）。`,
          '如需使用无头模式，请改用 action=register mode=isolated。',
        ].join('\n')
      }

      if (args.mode === 'isolated') {
        const browserLabel = args.browser ?? 'Chrome'
        const modeSuffix = args.headless ? ' 无头' : ''
        ctx.metadata({ title: `注册 chrome-devtools MCP（独立 ${browserLabel}${modeSuffix}）...` })

        let isolatedCommand: string[] = [...BASE_COMMAND, '--isolated=true']
        if (args.browser && args.browser !== 'Chrome') {
          const execPath = await findBrowserExecutable(args.browser)
          if (execPath) {
            isolatedCommand = [...isolatedCommand, '--executablePath', execPath]
          }
        }
        if (args.headless) {
          isolatedCommand = [...isolatedCommand, '--headless=true']
        }

        try {
          const result = await client.mcp.add({
            body: {
              name: MCP_NAME,
              config: {
                type: 'local',
                command: isolatedCommand,
              },
            },
            query: { directory: worktree },
          })

          const statuses = result.data as Record<string, { status: string }> | undefined
          const newStatus = statuses?.[MCP_NAME]
          if (newStatus?.status === 'connected') {
            const suffix = args.headless ? '（无头模式）' : ''
            return {
              output: `已注册 chrome-devtools MCP 并启动独立 ${browserLabel} 实例${suffix}，工具可用。请立即调用 chrome-devtools_list_pages 验证连接。`,
              metadata: { connected: true, status: 'connected', mode: 'isolated', browser: args.browser, headless: args.headless },
            }
          }

          return {
            output: `chrome-devtools MCP 已注册，当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等 MCP 连接完成后重试 check。`,
            metadata: { connected: false, status: newStatus?.status, mode: 'isolated' },
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return `注册 chrome-devtools MCP 失败：${message}。请检查 npx 和网络环境后重试。`
        }
      }

      // mode === 'autoConnect': 自动发现并连接已运行的浏览器
      if (args.mode === 'autoConnect') {
        ctx.metadata({ title: '注册 chrome-devtools MCP（autoConnect 自动发现浏览器）...' })

        // 非 Chrome 浏览器：从 DevToolsActivePort 读取 WebSocket 端点，兼容 inspect#remote-debugging 模式
        let autoCommand: string[]
        if (args.browser && args.browser !== 'Chrome') {
          const udDir = getBrowserUserDataDir(args.browser)
          const ap = udDir ? await readDevToolsActivePort(udDir) : null
          if (ap) {
            autoCommand = [...BASE_COMMAND, '--wsEndpoint', `ws://127.0.0.1:${ap.port}${ap.wsPath}`]
          } else {
            autoCommand = [...AUTOCONNECT_COMMAND]
          }
        } else {
          autoCommand = [...AUTOCONNECT_COMMAND]
        }

        try {
          const result = await client.mcp.add({
            body: {
              name: MCP_NAME,
              config: {
                type: 'local',
                command: autoCommand,
              },
            },
            query: { directory: worktree },
          })

          const statuses = result.data as Record<string, { status: string }> | undefined
          const newStatus = statuses?.[MCP_NAME]
          if (newStatus?.status === 'connected') {
            return {
              output: '已注册 chrome-devtools MCP 并通过 autoConnect 连接到活跃浏览器，工具可用。请立即调用 chrome-devtools_list_pages 验证连接。',
              metadata: { connected: true, status: 'connected', mode: 'autoConnect' },
            }
          }

          const needsAuthHint = newStatus?.status === 'needs_auth' || newStatus?.status === 'needs_client_registration'
          const browserLabel = args.browser ?? 'Chrome'
          const hint = needsAuthHint
            ? `${browserLabel} 可能未启用远程调试或拒绝了连接请求。请确认：1) ${browserLabel} 已运行；2) 已在浏览器内置 inspect#remote-debugging 页面启用远程调试；3) 浏览器弹出对话框时点击"允许"。`
            : `当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等或检查浏览器远程调试设置。`

          return {
            output: `chrome-devtools MCP 已注册，${hint}`,
            metadata: { connected: false, status: newStatus?.status, mode: 'autoConnect' },
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return [
            `注册 chrome-devtools MCP（autoConnect）失败：${message}。`,
            '请确认：',
            `  1. ${args.browser ?? 'Chrome'} 已运行并启用远程调试`,
            '  2. 已在浏览器内置 inspect#remote-debugging 页面启用远程调试',
            '  3. 网络环境可访问 npx',
            '如仍无法连接，可使用 action=register mode=connect 通过调试端口连接，或 mode=isolated 启动独立浏览器。',
          ].join('\n')
        }
      }

      // mode === 'connect': 通过用户指定的端口连接活跃浏览器
      if (!args.browser) {
        return '连接模式必须指定 browser 参数（Chrome、Edge、Brave 或 Vivaldi）。'
      }
      if (!args.port) {
        return `连接模式必须指定 port 参数。请先以远程调试模式启动 ${args.browser}（例如 ${args.browser === 'Edge' ? 'msedge' : args.browser.toLowerCase()} --remote-debugging-port=<端口>），然后提供端口号。`
      }

      ctx.metadata({ title: `注册 chrome-devtools MCP（连接 ${args.browser} 端口 ${args.port}）...` })

      // 优先从浏览器用户数据目录读取 DevToolsActivePort 构造 WebSocket 端点
      // 浏览器内置 inspect#remote-debugging 仅暴露 WebSocket、不暴露 HTTP 端点，
      // --browserUrl 会因 /json/version 返回 404 而失败；--wsEndpoint 可同时兼容两种调试模式
      let command: string[]
      const userDataDir = getBrowserUserDataDir(args.browser)
      const activePort = userDataDir ? await readDevToolsActivePort(userDataDir) : null

      if (activePort && activePort.port === args.port) {
        const wsEndpoint = `ws://127.0.0.1:${activePort.port}${activePort.wsPath}`
        command = [...BASE_COMMAND, '--wsEndpoint', wsEndpoint]
      } else {
        const browserUrl = `http://127.0.0.1:${args.port}`
        command = [...BASE_COMMAND, '--browserUrl', browserUrl]
      }

      try {
        const result = await client.mcp.add({
          body: {
            name: MCP_NAME,
            config: {
              type: 'local',
              command,
            },
          },
          query: { directory: worktree },
        })

        const statuses = result.data as Record<string, { status: string }> | undefined
        const newStatus = statuses?.[MCP_NAME]
        if (newStatus?.status === 'connected') {
          return {
            output: `已注册 chrome-devtools MCP 并连接到 ${args.browser}（端口 ${args.port}），工具可用。请立即调用 chrome-devtools_list_pages 验证连接。`,
            metadata: { connected: true, status: 'connected', mode: 'connect', browser: args.browser, port: args.port },
          }
        }

        const needsAuthHint = newStatus?.status === 'needs_auth' || newStatus?.status === 'failed'
        const hint = needsAuthHint
          ? `${args.browser}（端口 ${args.port}）可能未启用远程调试或拒绝了连接请求。请确认：1) 已在浏览器内置 inspect#remote-debugging 页面启用远程调试，或以 --remote-debugging-port=${args.port} 参数启动；2) 浏览器弹出对话框时点击"允许"。`
          : `当前状态：${newStatus?.status ?? '未知'}。如果状态不是 connected，请稍等或检查浏览器远程调试设置。`

        return {
          output: `chrome-devtools MCP 已注册，${hint}`,
          metadata: { connected: false, status: newStatus?.status, mode: 'connect' },
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return [
          `注册 chrome-devtools MCP 失败：${message}。`,
          '请确认：',
          `  1. ${args.browser} 已以 --remote-debugging-port=${args.port} 参数启动并正在运行`,
          `  2. 端口 ${args.port} 可访问（可尝试在浏览器中访问 http://127.0.0.1:${args.port}/json/version 验证）`,
          '如仍无法连接，可使用 action=register mode=autoConnect 自动发现浏览器（无需调试端口，需 Chrome >= M144），或 mode=isolated 启动独立浏览器。',
        ].join('\n')
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
          output: '已断开 chrome-devtools MCP 连接。如需重新使用，请调用 register。',
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
