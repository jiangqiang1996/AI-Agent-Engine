import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import * as net from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'

const execAsync = promisify(exec)

// chrome-devtools-mcp 官方正式支持 Chrome 和 Chrome for Testing；
// Edge、Chromium 等其他 Chromium 内核浏览器可能可用但不保证
// 本服务检测 Chrome、Edge、Chromium 三种常见浏览器，用于辅助决策连接方式
export const BROWSER_NAMES = ['Chrome', 'Edge', 'Chromium'] as const

/** DevToolsActivePort 文件解析结果 */
interface DevToolsActivePort {
  port: number
  wsPath: string
}

/** 浏览器检测结果 */
export interface BrowserDetectionResult {
  browser: string
  installed: boolean
  /** 浏览器可执行文件路径（供 --executablePath 使用） */
  executablePath: string | null
  /** 进程是否正在运行 */
  processRunning: boolean
  /** 运行中且启用了远程调试（DevToolsActivePort 文件存在且端口可达） */
  debuggable: boolean
  /** 远程调试端口（供 --browserUrl 使用） */
  port?: number
  /** 完整 WebSocket 端点（供 --wsEndpoint 使用） */
  wsEndpoint?: string
}

export function getBrowserUserDataDirs(browser: string): string[] {
  const platform = process.platform
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir() || ''
  const xdgConfig = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config')

  const dirMap: Record<string, Record<string, string[]>> = {
    win32: {
      Chrome: [path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data')],
      Edge: [path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'Edge', 'User Data')],
      Chromium: [path.join(process.env.LOCALAPPDATA ?? '', 'Chromium', 'User Data')],
    },
    darwin: {
      Chrome: [path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')],
      Edge: [path.join(home, 'Library', 'Application Support', 'Microsoft Edge')],
      Chromium: [path.join(home, 'Library', 'Application Support', 'Chromium')],
    },
    linux: {
      Chrome: [
        path.join(xdgConfig, 'google-chrome'),
        path.join(home, 'snap', 'chromium', 'common', 'chromium'),
        path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome'),
      ],
      Edge: [
        path.join(xdgConfig, 'microsoft-edge'),
        path.join(home, '.var', 'app', 'com.microsoft.Edge', 'config', 'microsoft-edge'),
      ],
      Chromium: [
        path.join(xdgConfig, 'chromium'),
        path.join(home, 'snap', 'chromium', 'common', 'chromium'),
        path.join(home, '.var', 'app', 'org.chromium.Chromium', 'config', 'chromium'),
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
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length >= 2) {
      const port = parseInt(lines[0], 10)
      const wsPath = lines[1]
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
      Chromium: [
        path.join(pf, 'Chromium', 'Application', 'chrome.exe'),
        path.join(pf86, 'Chromium', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Chromium', 'Application', 'chrome.exe'),
      ],
    },
    darwin: {
      Chrome: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
      Edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      Chromium: ['/Applications/Chromium.app/Contents/MacOS/Chromium'],
    },
    linux: {
      Chrome: [
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/local/bin/google-chrome',
        '/snap/bin/google-chrome',
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
      Chromium: [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/local/bin/chromium',
        '/snap/bin/chromium',
        '/var/lib/flatpak/exports/bin/org.chromium.Chromium',
        path.join(home, '.local', 'share', 'flatpak', 'exports', 'bin', 'org.chromium.Chromium'),
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
    Chromium: 'chrome.exe',
  },
  darwin: {
    Chrome: 'Google Chrome',
    Edge: 'Microsoft Edge',
    Chromium: 'Chromium',
  },
  linux: {
    Chrome: 'chrome',
    Edge: 'microsoft-edge',
    Chromium: 'chromium',
  },
}

async function isProcessRunning(browser: string): Promise<boolean> {
  const platform = process.platform
  const procName = PROC_NAMES[platform]?.[browser]
  if (!procName) {
    return false
  }

  try {
    if (platform === 'win32') {
      const { stdout } = await execAsync(
        `tasklist /FI "IMAGENAME eq ${procName}" /NH /FO CSV`,
        { timeout: 5000 },
      )
      return stdout.toLowerCase().includes(procName.toLowerCase())
    }

    try {
      const { stdout } = await execAsync(`pgrep -x "${procName}"`, { timeout: 5000 })
      if (stdout.trim().length > 0) {
        return true
      }
    } catch {
      // pgrep 不可用或无匹配，降级到 ps
    }

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
  const executablePath = await findBrowserExecutable(browser)
  const installed = !!executablePath
  const udDirs = getBrowserUserDataDirs(browser)
  const activePort = await readDevToolsActivePortFromDirs(udDirs)

  let debuggable = false
  let port: number | undefined
  let wsEndpoint: string | undefined
  if (activePort) {
    const reachable = await isPortReachable(activePort.port).catch(() => false)
    if (reachable) {
      debuggable = true
      port = activePort.port
      wsEndpoint = `ws://127.0.0.1:${activePort.port}${activePort.wsPath}`
    }
  }

  const processRunning = debuggable || (await isProcessRunning(browser))

  return { browser, installed, executablePath, processRunning, debuggable, port, wsEndpoint }
}

export function summarizeDetection(results: BrowserDetectionResult[]): string {
  const lines = results.map((r) => {
    const parts = [r.browser, `installed=${r.installed}`]
    if (r.debuggable && r.port) {
      parts.push(`debuggable=true port=${r.port}`)
      if (r.wsEndpoint) parts.push(`wsEndpoint=${r.wsEndpoint}`)
    } else if (r.processRunning) {
      parts.push('processRunning=true debuggable=false')
    } else {
      parts.push('processRunning=false')
    }
    if (r.executablePath) parts.push(`executablePath=${r.executablePath}`)
    return parts.join(' ')
  })
  return lines.join('\n')
}

/** 构建检测建议文本 */
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
    if (rb.wsEndpoint) {
      lines.push(`  接管参数：["--wsEndpoint", "${rb.wsEndpoint}"]`)
    }
    lines.push(`  或使用：["--browserUrl", "http://127.0.0.1:${rb.port}"]`)
  } else if (debuggable.length > 1) {
    lines.push('建议：检测到多个浏览器正在运行并启用远程调试，请选择一个接管：')
    for (const rb of debuggable) {
      lines.push(`  ${rb.browser}（端口 ${rb.port}）：["--wsEndpoint", "${rb.wsEndpoint}"]`)
    }
  } else if (runningNotDebuggable.length > 0) {
    const names = runningNotDebuggable.map((r) => r.browser).join('、')
    lines.push(`建议：检测到 ${names} 正在运行但未启用远程调试。`)
    lines.push('  请在浏览器中访问 inspect#remote-debugging 页面启用远程调试后重试，')
    lines.push('  或使用 --isolated 启动独立浏览器：')
    for (const ib of runningNotDebuggable) {
      if (ib.executablePath) {
        lines.push(`  ${ib.browser}：["--isolated", "--executablePath", "${ib.executablePath}"]`)
      }
    }
  } else if (installed.length > 0) {
    const names = installed.map((r) => r.browser).join('、')
    lines.push(`建议：未检测到运行中的浏览器，但已安装 ${names}。可启动独立浏览器：`)
    if (installed.length === 1) {
      const ib = installed[0]
      if (ib.executablePath) {
        lines.push(`  ["--isolated", "--executablePath", "${ib.executablePath}"]`)
        lines.push(`  无头模式：["--isolated", "--headless", "--executablePath", "${ib.executablePath}"]`)
      }
    } else {
      const preferred = installed[0]
      if (preferred.executablePath) {
        lines.push(`  自动选择优先级最高的 ${preferred.browser}：["--isolated", "--executablePath", "${preferred.executablePath}"]`)
      }
      lines.push('  其他浏览器：')
      for (const ib of installed.slice(1)) {
        if (ib.executablePath) {
          lines.push(`  ${ib.browser}：["--isolated", "--executablePath", "${ib.executablePath}"]`)
        }
      }
      lines.push('  无头模式追加 "--headless"')
    }
  } else {
    lines.push('建议：未检测到已安装的 Chromium 内核浏览器。请先安装 Chrome（chrome-devtools-mcp 官方正式支持 Chrome 和 Chrome for Testing，其他 Chromium 浏览器可能可用但不保证）。')
  }

  return lines
}
