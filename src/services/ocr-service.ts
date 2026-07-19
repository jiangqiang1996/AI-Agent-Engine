import { spawn } from 'node:child_process'
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import { getGlobalClient } from './client-holder.js'
import { getModelScenarioRoutingContext } from './model-scenario-holder.js'
import { getModelByScenario } from './model-scenario-routing-service.js'
import { MODEL_SCENARIO } from '../schemas/model-scenario-schema.js'

/**
 * OCR 审查发现项（来自 --format json 输出）
 */
export interface OcrFinding {
  path?: string
  content?: string
  start_line?: number
  end_line?: number
  suggestion_code?: string
  existing_code?: string
  thinking?: string
  category?: string
  severity?: string
}

/**
 * OCR JSON 输出结构
 *
 * OCR CLI 的 --format json 输出格式（见 output.go jsonOutput）：
 * {
 *   "status": "success",
 *   "comments": [...],
 *   "summary": { "files_reviewed": 9, "comments": 3, ... },
 *   "session_id": "xxx"
 * }
 */
export interface OcrJsonResult {
  status?: string
  message?: string
  comments?: OcrFinding[]
  summary?: {
    files_reviewed?: number
    comments?: number
    total_tokens?: number
    input_tokens?: number
    output_tokens?: number
    elapsed?: string
  }
  session_id?: string
  warnings?: Array<{ file?: string; message?: string }>
  [key: string]: unknown
}

/**
 * 从 opencode 获取 LLM 凭据，映射为 OCR 环境变量。
 *
 * 模型选择优先级：
 * 1. ae.jsonc modelScenarios.deep 指定的 provider/model
 * 2. opencode 默认模型（从 provider.list() 返回的 default 映射提取）
 */
export async function resolveOcrLlmEnv(): Promise<Record<string, string>> {
  const client = getGlobalClient()
  if (!client) {
    throw new Error('opencode client 不可用，无法获取 provider 配置')
  }

  let providers: Array<{
    id: string
    key?: string
    options?: Record<string, unknown>
    models?: Record<string, { api?: { npm?: string } }>
  }>
  let defaultModelMap: Record<string, string> | undefined
  let connectedProviders: string[] | undefined

  try {
    const result = await Promise.race([
      client.provider.list(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('provider.list 超时')), 10000),
      ),
    ])
    const raw = result as unknown as Record<string, unknown>
    const dataField = raw?.data as Record<string, unknown> | undefined
    providers = (dataField?.all ?? raw?.all ?? []) as typeof providers
    const defaultRaw = dataField?.default
    if (defaultRaw && typeof defaultRaw === 'object' && !Array.isArray(defaultRaw)) {
      defaultModelMap = defaultRaw as Record<string, string>
    }
    const connectedRaw = dataField?.connected
    if (Array.isArray(connectedRaw)) {
      connectedProviders = connectedRaw.filter((p): p is string => typeof p === 'string')
    }
    if (providers.length === 0) {
      throw new Error('provider.list 返回空')
    }
  } catch (e) {
    throw new Error(`无法从 opencode 获取 provider 列表: ${e instanceof Error ? e.message : String(e)}`)
  }

  let providerID: string | undefined
  let modelID: string | undefined

  // 优先级 1：ae.jsonc modelScenarios.deep 指定的模型
  const deepModel = getModelByScenario(getModelScenarioRoutingContext() ?? undefined, MODEL_SCENARIO.DEEP)
  if (deepModel) {
    const slashIndex = deepModel.indexOf('/')
    if (slashIndex > 0) {
      providerID = deepModel.slice(0, slashIndex)
      modelID = deepModel.slice(slashIndex + 1)
    }
  }

  // 优先级 2：opencode 默认模型（从已获取的 provider.list 返回的 default 映射提取）
  // default 映射是每个 provider 的默认模型，不是全局唯一默认。
  // 优先从 connected provider 中选择第一个可用的默认模型，
  // 若无 connected provider 则回退到 default 映射中字典序第一个。
  if (!providerID || !modelID) {
    if (!defaultModelMap) {
      throw new Error('无法从 opencode 获取默认模型：provider.list 未返回 default 映射')
    }
    const defaultEntries = Object.entries(defaultModelMap)
      .filter(([, mid]) => typeof mid === 'string' && mid)
      .sort(([a], [b]) => a.localeCompare(b))
    if (defaultEntries.length === 0) {
      throw new Error('无法从 opencode 获取默认模型：default 映射为空或条目无效')
    }
    // 优先选择 connected provider 的默认模型
    const connectedEntry = connectedProviders
      ? defaultEntries.find(([pid]) => connectedProviders.includes(pid))
      : undefined
    const [defaultProviderID, defaultModelID] = connectedEntry ?? defaultEntries[0]
    if (!defaultProviderID || !defaultModelID) {
      throw new Error('无法从 opencode 获取默认模型：default 映射条目无效')
    }
    providerID = defaultProviderID
    modelID = defaultModelID
  }

  const configured = providers.find((p) => p.id === providerID)
  if (!configured) {
    throw new Error(`provider ${providerID} 不在 provider 列表中`)
  }

  const apiKey = (configured.options?.apiKey as string | undefined) ?? configured.key ?? ''
  if (!apiKey || apiKey === 'public' || apiKey === 'none' || apiKey === 'dummy') {
    throw new Error(`provider ${configured.id} 缺少有效的 API key`)
  }

  if (!modelID) {
    throw new Error(`provider ${configured.id} 没有可用模型`)
  }

  const npm = configured.models?.[modelID]?.api?.npm
  const protocol = inferProtocolFromNpm(npm, configured.id)

  const rawBaseURL = (configured.options?.baseURL as string | undefined) ?? inferBaseURL(configured.id)
  const ocrURL = rawBaseURL ? opencodeBaseURLToOcrURL(rawBaseURL, protocol) : undefined

  const env: Record<string, string> = {
    OCR_LLM_TOKEN: apiKey,
    OCR_LLM_MODEL: modelID,
    OCR_LLM_PROTOCOL: protocol,
  }

  if (ocrURL) {
    env.OCR_LLM_URL = ocrURL
  }

  return env
}

/**
 * 根据 model.api.npm 精确推断 LLM 协议。
 * npm 字段来自 opencode provider.list() 返回的 model.api.npm，
 * 标识 AI SDK 包名（如 @ai-sdk/anthropic、@ai-sdk/openai-compatible）。
 *
 * 降级：npm 缺失时用 provider.id 粗匹配。
 */
function inferProtocolFromNpm(npm: string | undefined, providerID: string): string {
  if (npm) {
    if (npm.includes('anthropic')) return 'anthropic'
    return 'openai'
  }
  const id = providerID.toLowerCase()
  if (id === 'anthropic' || id.includes('claude')) return 'anthropic'
  return 'openai'
}

/**
 * 将 opencode provider 的 baseURL 转换为 OCR 期望的 URL 格式。
 *
 * opencode baseURL 是 base 格式（含 /v1，不含端点路径如 /messages 或 /chat/completions）。
 * OCR 期望完整端点 URL：
 * - anthropic 协议：需要 /v1/messages 后缀
 * - openai 协议：需要 /v1/chat/completions 后缀
 *
 * 已包含正确后缀的 URL 原样返回，避免重复拼接。
 */
export function opencodeBaseURLToOcrURL(baseURL: string, protocol: string): string {
  const url = baseURL.replace(/\/+$/, '')

  if (protocol === 'anthropic') {
    if (url.endsWith('/v1/messages')) return url
    if (url.endsWith('/messages')) return url
    return `${url}/messages`
  }

  if (protocol === 'openai') {
    if (url.endsWith('/chat/completions')) return url
    return `${url}/chat/completions`
  }

  return url
}

/**
 * 根据 provider ID 推断默认 baseURL（仅在 provider.options.baseURL 缺失时使用）。
 * 返回 opencode base 格式（含 /v1，不含端点路径）。
 */
function inferBaseURL(providerID: string): string | undefined {
  const id = providerID.toLowerCase()
  if (id === 'anthropic') return 'https://api.anthropic.com/v1'
  if (id.includes('openai')) return 'https://api.openai.com/v1'
  return undefined
}

/**
 * ESM 兼容的 require.resolve。
 * ocr-service 运行在 ESM 上下文，需要 createRequire 才能使用 require.resolve。
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
 * 1. 平台特定子包（如 @alibaba-group/ocr-win32-x64）bin/ 目录中的原生二进制
 * 2. 主包 bin/ 目录中的二进制（postinstall 下载的旧式布局）
 * 3. PATH 中的 ocr 命令（最终降级，官方返回 null，此处扩展为 PATH 查找）
 */
export function resolveOcrBinary(): { path: string; source: string } | null {
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

  // 最终降级到 PATH 中的 ocr
  return { path: 'ocr', source: 'path' }
}

/**
 * 以后台 detached 进程启动 ocr viewer，立即返回 PID 和日志路径。
 *
 * 参考 ae-async-bash 的平台原生后台机制：
 * - Windows: start /B "title" powershell -Command "command 2>&1 | Tee-Object -FilePath log -Append"
 * - Unix: sh -c 'command 2>&1 | tee -a log &'
 *
 * shell 自行管理子进程后台运行和日志写入，同时输出继承到父进程 stdout，
 * Node.js 只负责 spawn shell，不参与 I/O 转发。
 *
 * ocr 二进制随项目打包，resolveOcrBinary 始终有返回值。
 */
export function spawnOcrViewer(
  args: string[],
  opts?: {
    cwd?: string
    logPath?: string
  },
): { pid: number; logPath: string } {
  const binary = resolveOcrBinary()!

  const logFile = opts?.logPath ?? path.join(opts?.cwd ?? process.cwd(), 'ae', 'logs', `ocr-viewer-${formatLogTimestamp()}.log`)
  const logDir = path.dirname(logFile)
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }
  // 预创建日志文件，确保调用方可立即读取
  const touchFd = openSync(logFile, 'a')
  closeSync(touchFd)

  const quotedLog = `"${logFile}"`
  const isWin32 = process.platform === 'win32'

  // 构建完整命令字符串
  const rawCommand = `${binary.path} ${args.join(' ')}`
  const fullCommand = isWin32
    ? `start /B "ocr-viewer" powershell -NoProfile -Command "${rawCommand} 2>&1 | Tee-Object -FilePath '${logFile}' -Append"`
    : `${rawCommand} 2>&1 | tee -a ${quotedLog} &`

  const child = spawn(fullCommand, {
    cwd: opts?.cwd,
    detached: true,
    shell: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  })

  child.on('error', (err) => {
    try {
      appendFileSync(logFile, `\n[spawn error] ${err.message}\n`)
    } catch {
      // 忽略写入错误
    }
  })

  child.unref()

  return { pid: child.pid ?? -1, logPath: logFile }
}

function formatLogTimestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/**
 * 执行 ocr 命令并返回结果。
 *
 * 自动注入 LLM 环境变量，设置超时，捕获 stdout/stderr。
 */
export async function runOcr(
  args: string[],
  opts?: {
    cwd?: string
    timeoutMs?: number
    extraEnv?: Record<string, string>
    skipLlmEnv?: boolean
  },
): Promise<{ stdout: string; stderr: string; exitCode: number; llmEnvError?: string }> {
  const binary = resolveOcrBinary()
  if (!binary) {
    throw new Error('ocr 二进制未找到。请运行 npm install @alibaba-group/open-code-review 安装')
  }

  let env: Record<string, string> = { ...process.env as Record<string, string> }
  let llmEnvError: string | undefined

  if (!opts?.skipLlmEnv) {
    try {
      const llmEnv = await resolveOcrLlmEnv()
      env = { ...env, ...llmEnv }
    } catch (e) {
      llmEnvError = e instanceof Error ? e.message : String(e)
    }
  }

  if (opts?.extraEnv) {
    env = { ...env, ...opts.extraEnv }
  }

  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000

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
        resolve({ stdout, stderr, exitCode: code ?? -1, llmEnvError })
      }
    })
  })
}

/**
 * 解析 ocr --format json 输出
 */
export function parseOcrJson(stdout: string): OcrJsonResult {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return { comments: [], summary: { files_reviewed: 0 } }
  }

  try {
    return JSON.parse(trimmed) as OcrJsonResult
  } catch {
    // OCR 可能输出非纯 JSON（如前后有日志），尝试提取 JSON 块
    const jsonStart = trimmed.indexOf('{')
    const jsonEnd = trimmed.lastIndexOf('}')
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)) as OcrJsonResult
      } catch {
        // 仍然失败
      }
    }
    throw new Error('ocr 输出无法解析为 JSON')
  }
}

/**
 * 将 OCR 命令执行的完整反馈信息写入 ae/logs/ 目录。
 *
 * 日志文件名格式：ocr-{sessionId}-{YYYYMMDD}.log
 * 同一会话同一天的多次执行追加写入同一文件。
 *
 * 记录内容：时间戳、命令、CLI 参数、退出码、stdout、stderr、LLM 环境错误。
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
    llmEnvError?: string
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
    if (record.llmEnvError) {
      lines.push(`LLM 环境错误: ${record.llmEnvError}`)
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
  if (!binary) {
    return { installed: false }
  }

  try {
    const { stdout, exitCode } = await runOcr(['version'], { skipLlmEnv: true, timeoutMs: 10000 })
    if (exitCode === 0) {
      return { installed: true, version: stdout.trim(), source: binary.source }
    }
  } catch {
    // version 命令失败
  }

  return { installed: false }
}
