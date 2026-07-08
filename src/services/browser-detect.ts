import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'

const execAsync = promisify(exec)

export const BROWSER_NAMES = ['Chrome', 'Edge', 'Brave', 'Vivaldi'] as const

/** DevToolsActivePort 文件解析结果 */
interface DevToolsActivePort {
  port: number
  wsPath: string
}

/** 浏览器检测结果 */
export interface BrowserDetectionResult {
  browser: string
  installed: boolean
  /** 进程是否正在运行 */
  processRunning: boolean
  /** 运行中且启用了远程调试（DevToolsActivePort 文件存在且端口可达） */
  debuggable: boolean
  port?: number
}

export function getBrowserUserDataDirs(browser: string): string[] {
  const platform = process.platform
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir() || ''
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config')

  const dirMap: Record<string, Record<string, string[]>> = {
    win32: {
      Chrome: [path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data')],
      Edge: [path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'User Data')],
      Brave: [path.join(process.env.LOCALAPPDATA ?? '', 'BraveSoftware', 'Brave-Browser', 'User Data')],
      Vivaldi: [path.join(process.env.LOCALAPPDATA ?? '', 'Vivaldi', 'User Data')],
    },
    darwin: {
      Chrome: [path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')],
      Edge: [path.join(home, 'Library', 'Application Support', 'Microsoft Edge')],
      Brave: [path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser')],
      Vivaldi: [path.join(home, 'Library', 'Application Support', 'Vivaldi')],
    },
    linux: {
      // 标准安装 + Snap + Flatpak 三类路径
      Chrome: [
        path.join(xdgConfig, 'google-chrome'),
        path.join(home, 'snap', 'chromium', 'common', 'chromium'),
        path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome'),
      ],
      Edge: [
        path.join(xdgConfig, 'microsoft-edge'),
        path.join(home, '.var', 'app', 'com.microsoft.Edge', 'config', 'microsoft-edge'),
      ],
      Brave: [
        path.join(xdgConfig, 'BraveSoftware', 'Brave-Browser'),
        path.join(home, 'snap', 'brave', 'common', 'BraveSoftware', 'Brave-Browser'),
        path.join(home, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser'),
      ],
      Vivaldi: [
        path.join(xdgConfig, 'vivaldi'),
        path.join(home, '.var', 'app', 'com.vivaldi.Vivaldi', 'config', 'vivaldi'),
      ],
    },
  }

  return dirMap[platform]?.[browser] ?? []
}

/** wsPath 格式校验：必须以 / 开头，仅含安全字符，防 SSRF */
function isValidWsPath(wsPath: string): boolean {
  return /^\/[A-Za-z0-9/._-]*$/.test(wsPath) && wsPath.length <= 256
}

/**
 * 解析 DevToolsActivePort 文件
 * 对齐官方 chrome-devtools-mcp 实现：filter 空行 + trim 每行 + 端口范围校验
 */
async function readDevToolsActivePort(userDataDir: string): Promise<DevToolsActivePort | null> {
  const filePath = path.join(userDataDir, 'DevToolsActivePort')
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    // 对齐官方实现：按行分割后 trim 每行、过滤空行
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length >= 2) {
      const port = parseInt(lines[0], 10)
      const wsPath = lines[1]
      // 端口范围校验 + wsPath 格式校验
      if (!isNaN(port) && port >= 1 && port <= 65535 && isValidWsPath(wsPath)) {
        return { port, wsPath }
      }
    }
  } catch {
    // 文件不存在或无法读取，静默降级
  }
  return null
}

/** 从多个候选用户数据目录中查找 DevToolsActivePort，返回第一个匹配 */
export async function readDevToolsActivePortFromDirs(dirs: string[]): Promise<DevToolsActivePort | null> {
  for (const dir of dirs) {
    const result = await readDevToolsActivePort(dir)
    if (result) return result
  }
  return null
}

function getBrowserExecutablePaths(browser: string): string[] {
  const platform = process.platform
  const pf86 = process.env['ProgramFiles(x86)'] ?? ''
  const pf = process.env['ProgramFiles'] ?? ''
  const localAppData = process.env.LOCALAPPDATA ?? ''
  const home = os.homedir()

  const pathMap: Record<string, Record<string, string[]>> = {
    win32: {
      Chrome: [
        path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ],
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
      Chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      Edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      Brave: ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
      Vivaldi: ['/Applications/Vivaldi.app/Contents/MacOS/Vivaldi'],
    },
    linux: {
      Chrome: [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/local/bin/google-chrome',
        '/snap/bin/google-chrome',
        '/snap/bin/chromium',
        '/var/lib/flatpak/exports/bin/com.google.Chrome',
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'com.google.Chrome'),
      ],
      Edge: [
        '/usr/bin/microsoft-edge-stable',
        '/usr/bin/microsoft-edge',
        '/usr/local/bin/microsoft-edge',
        '/var/lib/flatpak/exports/bin/com.microsoft.Edge',
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'com.microsoft.Edge'),
      ],
      Brave: [
        '/usr/bin/brave-browser-stable',
        '/usr/bin/brave-browser',
        '/usr/local/bin/brave-browser',
        '/snap/bin/brave',
        '/var/lib/flatpak/exports/bin/com.brave.Browser',
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'com.brave.Browser'),
      ],
      Vivaldi: [
        '/usr/bin/vivaldi-stable',
        '/usr/bin/vivaldi',
        '/usr/local/bin/vivaldi',
        '/opt/vivaldi/vivaldi',
        '/var/lib/flatpak/exports/bin/com.vivaldi.Vivaldi',
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'com.vivaldi.Vivaldi'),
      ],
    },
  }

  return pathMap[platform]?.[browser] ?? []
}

export async function findBrowserExecutable(browser: string): Promise<string | null> {
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

/** 进程名映射表（用于精确匹配） */
const PROC_NAMES: Record<string, Record<string, string>> = {
  win32: {
    Chrome: 'chrome.exe',
    Edge: 'msedge.exe',
    Brave: 'brave.exe',
    Vivaldi: 'vivaldi.exe',
  },
  darwin: {
    Chrome: 'Google Chrome',
    Edge: 'Microsoft Edge',
    Brave: 'Brave Browser',
    Vivaldi: 'Vivaldi',
  },
  linux: {
    Chrome: 'chrome',
    Edge: 'microsoft-edge',
    Brave: 'brave',
    Vivaldi: 'vivaldi',
  },
}

async function isProcessRunning(browser: string): Promise<boolean> {
  const platform = process.platform
  const procName = PROC_NAMES[platform]?.[browser]
  if (!procName) return false

  try {
    if (platform === 'win32') {
      const { stdout } = await execAsync(
        `tasklist /FI "IMAGENAME eq ${procName}" /NH /FO CSV`,
        { timeout: 5000 },
      )
      return stdout.toLowerCase().includes(procName.toLowerCase())
    }

    // darwin + linux：优先 pgrep -x 精确匹配进程名（避免匹配 chrome-devtools-mcp 自身进程）
    try {
      const { stdout } = await execAsync(`pgrep -x "${procName}"`, { timeout: 5000 })
      if (stdout.trim().length > 0) return true
    } catch {
      // pgrep 不可用或无匹配，降级到 ps
    }

    // 降级方案：ps -eo comm= 只输出进程名列，避免全命令行匹配误报
    const { stdout: psOut } = await execAsync(
      `ps -eo comm= | grep -x "${procName}"`,
      { timeout: 5000 },
    )
    return psOut.trim().length > 0
  } catch {
    return false
  }
}

async function isPortReachable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const socket = new net.Socket()
      socket.setTimeout(1000)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('timeout', () => {
        socket.destroy()
        resolve(false)
      })
      socket.once('error', () => {
        socket.destroy()
        resolve(false)
      })
      socket.connect(port, '127.0.0.1')
    } catch {
      resolve(false)
    }
  })
}

export async function detectBrowser(browser: string): Promise<BrowserDetectionResult> {
  const installed = !!(await findBrowserExecutable(browser))
  const udDirs = getBrowserUserDataDirs(browser)
  const activePort = await readDevToolsActivePortFromDirs(udDirs)

  let debuggable = false
  let port: number | undefined
  if (activePort) {
    // .catch 兜底防止同步异常导致 Promise reject
    const reachable = await isPortReachable(activePort.port).catch(() => false)
    if (reachable) {
      debuggable = true
      port = activePort.port
    }
  }

  const processRunning = debuggable || (await isProcessRunning(browser))

  return { browser, installed, processRunning, debuggable, port }
}

export function summarizeDetection(results: BrowserDetectionResult[]): string {
  const lines = results.map((r) => {
    const parts = [r.browser, `installed=${r.installed}`]
    if (r.debuggable && r.port) {
      parts.push(`debuggable=true port=${r.port}`)
    } else if (r.processRunning) {
      parts.push('processRunning=true debuggable=false')
    } else {
      parts.push('processRunning=false')
    }
    return parts.join(' ')
  })
  return lines.join('\n')
}

/** 构建检测建议文本（从 execute 中提取，便于独立测试） */
export function buildDetectionAdvice(results: BrowserDetectionResult[]): string[] {
  const installed = results.filter((r) => r.installed)
  const debuggable = results.filter((r) => r.debuggable)
  const runningNotDebuggable = results.filter(
    (r) => r.processRunning && !r.debuggable,
  )

  const lines: string[] = []

  if (debuggable.length === 1) {
    const rb = debuggable[0]
    lines.push(`建议：检测到 ${rb.browser} 正在运行并启用远程调试（端口 ${rb.port}）。`)
    lines.push(`  接管方式：action=register mode=connect browser=${rb.browser} port=${rb.port}`)
    if (rb.browser !== 'Chrome') {
      lines.push(`  或 autoConnect：action=register mode=autoConnect browser=${rb.browser}`)
    } else {
      lines.push('  或 autoConnect：action=register mode=autoConnect')
    }
  } else if (debuggable.length > 1) {
    lines.push('建议：检测到多个浏览器正在运行并启用远程调试，请选择一个接管：')
    for (const rb of debuggable) {
      lines.push(`  ${rb.browser}（端口 ${rb.port}）：action=register mode=connect browser=${rb.browser} port=${rb.port}`)
    }
  } else if (runningNotDebuggable.length > 0) {
    const names = runningNotDebuggable.map((r) => r.browser).join('、')
    lines.push(`建议：检测到 ${names} 正在运行但未启用远程调试。`)
    lines.push('  请在浏览器中访问 inspect#remote-debugging 页面启用远程调试后重试，')
    lines.push('  或使用 isolated 模式启动独立浏览器：')
    for (const ib of runningNotDebuggable) {
      const browserArg = ib.browser !== 'Chrome' ? ` browser=${ib.browser}` : ''
      lines.push(`  action=register mode=isolated${browserArg}`)
    }
  } else if (installed.length > 0) {
    const names = installed.map((r) => r.browser).join('、')
    lines.push(`建议：未检测到运行中的浏览器，但已安装 ${names}。可启动独立浏览器：`)
    if (installed.length === 1) {
      const ib = installed[0]
      const browserArg = ib.browser !== 'Chrome' ? ` browser=${ib.browser}` : ''
      lines.push(`  action=register mode=isolated${browserArg}`)
      lines.push(`  无头模式：action=register mode=isolated${browserArg} headless=true`)
    } else {
      const preferred = installed[0]
      const preferredArg = preferred.browser !== 'Chrome' ? ` browser=${preferred.browser}` : ''
      lines.push(`  自动选择优先级最高的 ${preferred.browser}：action=register mode=isolated${preferredArg}`)
      lines.push('  其他浏览器：')
      for (const ib of installed.slice(1)) {
        const browserArg = ib.browser !== 'Chrome' ? ` browser=${ib.browser}` : ''
        lines.push(`  ${ib.browser}：action=register mode=isolated${browserArg}`)
      }
      lines.push('  无头模式追加 headless=true')
    }
  } else {
    lines.push('建议：未检测到已安装的 Chromium 内核浏览器。请先安装 Chrome、Edge、Brave 或 Vivaldi。')
  }

  return lines
}

/** 智能注册决策结果 */
export type SmartResolveResult =
  | { mode: 'isolated'; browser?: string; headless?: boolean }
  | { mode: 'connect'; browser: string; port: number }
  | { output: string; metadata: Record<string, unknown> }

/**
 * 按技能 4 场景智能决策注册参数
 *
 * 场景1: browser + headless → isolated
 * 场景2: browser + !headless → detect → debuggable?connect : isolated
 * 场景3: !browser + headless → detect installed → isolated
 * 场景4: !browser + !headless → detect running → one?connect : multi?ask : none?isolated
 */
export async function resolveSmartRegister(
  browser: string | undefined,
  headless: boolean | undefined,
): Promise<SmartResolveResult> {
  // 场景1：指定 browser + headless
  if (browser && headless) {
    return { mode: 'isolated', browser, headless }
  }

  // 场景2：指定 browser + 非无头
  if (browser && !headless) {
    const r = await detectBrowser(browser)
    if (r.debuggable && r.port) {
      return { mode: 'connect', browser, port: r.port }
    }
    if (r.processRunning) {
      return {
        output: `${browser} 正在运行但未启用远程调试。请在浏览器中访问 inspect#remote-debugging 页面启用远程调试后重试，或追加 headless=true 使用无头模式。`,
        metadata: { connected: false, status: 'not_debuggable', browser },
      }
    }
    return { mode: 'isolated', browser }
  }

  // 场景3：未指定 browser + headless
  if (!browser && headless) {
    const results = await Promise.all([...BROWSER_NAMES].map((b) => detectBrowser(b)))
    const installed = results.filter((r) => r.installed)
    if (installed.length === 0) {
      return {
        output: '未检测到已安装的 Chromium 内核浏览器。请先安装 Chrome、Edge、Brave 或 Vivaldi。',
        metadata: { connected: false, status: 'no_browser_installed' },
      }
    }
    return { mode: 'isolated', browser: installed[0].browser, headless }
  }

  // 场景4：未指定 browser + 非无头
  const results = await Promise.all([...BROWSER_NAMES].map((b) => detectBrowser(b)))
  const debuggable = results.filter((r) => r.debuggable)
  if (debuggable.length === 1) {
    return { mode: 'connect', browser: debuggable[0].browser, port: debuggable[0].port! }
  }
  if (debuggable.length > 1) {
    const lines = debuggable.map(
      (r) => `  ${r.browser}（端口 ${r.port}）：action=register mode=connect browser=${r.browser} port=${r.port}`,
    )
    return {
      output: ['检测到多个正在运行且可调试的浏览器，请选择一个接管：', ...lines].join('\n'),
      metadata: { connected: false, status: 'multiple_debuggable' },
    }
  }
  const installed = results.filter((r) => r.installed)
  if (installed.length === 0) {
    return {
      output: '未检测到运行中的浏览器，也未检测到已安装的 Chromium 内核浏览器。请先安装 Chrome、Edge、Brave 或 Vivaldi。',
      metadata: { connected: false, status: 'no_browser_installed' },
    }
  }
  return { mode: 'isolated', browser: installed[0].browser }
}
