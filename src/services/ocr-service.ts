import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * OCR delegate preview 输出结构（--format json）
 *
 * delegate preview 输出可审查文件清单，不调用 LLM。
 * 宿主代理拿到清单后自行读取 diff 并审查。
 */
export interface OcrDelegatePreview {
  schema_version?: string
  mode?: string
  repository?: string
  from?: string
  to?: string
  merge_base?: string
  commit?: string
  background?: string
  total_files?: number
  reviewable_count?: number
  excluded_count?: number
  total_insertions?: number
  total_deletions?: number
  reviewable_files?: Array<{
    path: string
    status: string
    insertions: number
    deletions: number
  }>
  excluded_files?: Array<{
    path: string
    status: string
    insertions: number
    deletions: number
    exclude_reason: string
  }>
  [key: string]: unknown
}

/**
 * OCR delegate rule 输出结构（--format json）
 *
 * delegate rule 输出按 glob pattern 分组的审查规则，
 * 宿主代理拿到规则后按分组审查对应文件。
 */
export interface OcrDelegateRule {
  schema_version?: string
  groups?: Array<{
    group_id: number
    source: string
    pattern: string
    files: string[]
    rule: string
  }>
  [key: string]: unknown
}

/**
 * ESM 兼容的 require.resolve。
 */
const require = createRequire(import.meta.url)

const OCR_MAIN_PKG = '@alibaba-group/open-code-review'
const OCR_BINARY_FILENAME = process.platform === 'win32' ? 'opencodereview.exe' : 'opencodereview'

/**
 * 平台特定二进制包名映射（与官方 platform.js PLATFORM_PKG 一致）。
 */
const OCR_PLATFORM_PACKAGES: Record<string, string> = {
  'darwin-arm64': '@alibaba-group/ocr-darwin-arm64',
  'darwin-x64': '@alibaba-group/ocr-darwin-x64',
  'linux-arm64': '@alibaba-group/ocr-linux-arm64',
  'linux-x64': '@alibaba-group/ocr-linux-x64',
  'win32-arm64': '@alibaba-group/ocr-win32-arm64',
  'win32-x64': '@alibaba-group/ocr-win32-x64',
}

/**
 * 从主包 package.json 的 optionalDependencies 动态发现平台子包名。
 * 与官方 platform.js getPlatformPackageName 逻辑一致。
 */
function getPlatformPackageName(): string | null {
  const key = `${process.platform}-${process.arch}`
  try {
    const mainPkgDir = path.dirname(require.resolve(`${OCR_MAIN_PKG}/package.json`))
    const pkgJson = JSON.parse(readFileSync(path.join(mainPkgDir, 'package.json'), 'utf-8'))
    const optDeps = (pkgJson?.optionalDependencies ?? {}) as Record<string, string>
    for (const name of Object.keys(optDeps)) {
      if (name.endsWith(`-${key}`)) return name
    }
  } catch {
    // 主包未安装或无法读取
  }
  return OCR_PLATFORM_PACKAGES[key] ?? null
}

/**
 * 定位 ocr 二进制。
 *
 * 与官方 platform.js resolveNativeBinary 解析顺序一致：
 * 1. 平台特定子包 bin/ 目录中的原生二进制
 * 2. 主包 bin/ 目录中的二进制（postinstall 下载的旧式布局）
 * 3. PATH 中的 ocr 命令（最终降级，始终有返回值）
 */
export function resolveOcrBinary(): { path: string; source: string } {
  // 优先从平台特定子包解析
  const platformPkg = getPlatformPackageName()
  if (platformPkg) {
    try {
      const pkgDir = path.dirname(require.resolve(`${platformPkg}/package.json`))
      const binPath = path.join(pkgDir, 'bin', OCR_BINARY_FILENAME)
      if (existsSync(binPath)) {
        return { path: binPath, source: 'npm' }
      }
    } catch {
      // 平台特定包未安装
    }
  }

  // 降级：主包 bin/ 目录中的二进制（postinstall 下载）
  try {
    const mainPkgDir = path.dirname(require.resolve(`${OCR_MAIN_PKG}/package.json`))
    const legacyPath = path.join(mainPkgDir, 'bin', OCR_BINARY_FILENAME)
    if (existsSync(legacyPath)) {
      return { path: legacyPath, source: 'npm' }
    }
  } catch {
    // 主包未安装
  }

  // 最终降级到 PATH 中的 ocr（始终有返回值）
  return { path: 'ocr', source: 'path' }
}

/**
 * 执行 ocr 命令并返回结果。
 *
 * delegate 模式下 ocr 不调用 LLM，无需注入 LLM 环境变量。
 */
export async function runOcr(
  args: string[],
  opts?: {
    cwd?: string
    timeoutMs?: number
  },
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const binary = resolveOcrBinary()

  const env = { ...process.env } as Record<string, string>
  const timeoutMs = opts?.timeoutMs ?? 60 * 1000

  return new Promise((resolve, reject) => {
    const child = spawn(binary.path, args, {
      cwd: opts?.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: binary.source === 'path',
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true
        child.kill('SIGTERM')
        reject(new Error(`ocr 命令超时（${timeoutMs / 1000}秒）`))
      }
    }, timeoutMs)

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(`ocr 进程启动失败: ${err.message}`))
      }
    })

    child.on('close', (code) => {
      if (!settled) {
        settled = true
        clearTimeout(timer)
        resolve({ stdout, stderr, exitCode: code ?? -1 })
      }
    })
  })
}

/**
 * 解析 ocr --format json 输出
 */
export function parseOcrJson<T = unknown>(stdout: string): T {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error('ocr 输出为空')
  }

  try {
    return JSON.parse(trimmed) as T
  } catch {
    // OCR 可能输出非纯 JSON（如前后有日志），尝试提取 JSON 块
    const jsonStart = trimmed.indexOf('{')
    const jsonEnd = trimmed.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as T
      } catch {
        // 仍然失败
      }
    }
    throw new Error('ocr 输出无法解析为 JSON')
  }
}

/**
 * 将 OCR 命令执行的完整反馈信息写入 ae/logs/ 目录。
 */
export function writeOcrExecutionLog(
  cwd: string,
  sessionId: string | undefined,
  record: {
    command: string
    cliArgs: string[]
    exitCode?: number
    stdout?: string
    stderr?: string
    error?: string
  },
): string | undefined {
  try {
    const date = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const dateStr = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
    const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    const sid = sessionId ?? 'no-session'
    const fileName = `ocr-${sid}-${dateStr}.log`
    const logDir = path.join(cwd, 'ae', 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    const logPath = path.join(logDir, fileName)

    const lines: string[] = [
      `\n[${timeStr}] === ocr ${record.command} ===`,
      `CLI 参数: ${record.cliArgs.join(' ')}`,
    ]
    if (record.exitCode !== undefined) {
      lines.push(`退出码: ${record.exitCode}`)
    }
    if (record.error) {
      lines.push(`执行异常: ${record.error}`)
    }
    if (record.stdout) {
      lines.push(`--- stdout ---`)
      lines.push(record.stdout)
    }
    if (record.stderr) {
      lines.push(`--- stderr ---`)
      lines.push(record.stderr)
    }
    lines.push(`[${timeStr}] === end ===\n`)

    appendFileSync(logPath, lines.join('\n'), 'utf8')
    return logPath
  } catch {
    // 日志写入失败不影响主流程
    return undefined
  }
}

/**
 * 检查 ocr 是否已安装且可用
 */
export async function checkOcrInstalled(): Promise<{ installed: boolean; version?: string; source?: string }> {
  const binary = resolveOcrBinary()

  try {
    const { stdout, exitCode } = await runOcr(['version'], { timeoutMs: 10000 })
    if (exitCode === 0) {
      return { installed: true, version: stdout.trim(), source: binary.source }
    }
  } catch {
    // version 命令失败
  }

  return { installed: false }
}
