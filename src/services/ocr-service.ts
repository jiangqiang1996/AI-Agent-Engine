import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

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
 * 2. opencode 默认模型（client.v2.model.default()）
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

  // 优先级 2：opencode 默认模型
  if (!providerID || !modelID) {
    const defaultResult = await Promise.race([
      (client as unknown as { v2: { model: { default: (opts?: unknown) => Promise<unknown> } } }).v2.model.default(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('model.default 超时')), 5000),
      ),
    ])
    const data = (defaultResult as { data?: { data?: { providerID?: string; id?: string } | null } | null })?.data?.data
    if (!data?.providerID || !data?.id) {
      throw new Error('无法从 opencode 获取默认模型')
    }
    providerID = data.providerID
    modelID = data.id
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
 * 定位 ocr 二进制。
 *
 * 优先使用 npm 包 @alibaba-group/open-code-review 安装时下载的二进制，
 * 降级到 PATH 中的 ocr 命令。
 */
export function resolveOcrBinary(): { path: string; source: string } | null {
  try {
    const pkgPath = require.resolve('@alibaba-group/open-code-review')
    const pkgDir = path.dirname(pkgPath)
    const platform = process.platform
    const arch = process.arch

    let binaryName: string
    let osPart: string
    let archPart: string

    if (platform === 'win32') {
      osPart = 'windows'
      archPart = arch === 'arm64' ? 'arm64' : 'amd64'
      binaryName = `opencodereview-${osPart}-${archPart}.exe`
    } else if (platform === 'darwin') {
      osPart = 'darwin'
      archPart = arch === 'arm64' ? 'arm64' : 'amd64'
      binaryName = `opencodereview-${osPart}-${archPart}`
    } else {
      osPart = 'linux'
      archPart = arch === 'arm64' ? 'arm64' : 'amd64'
      binaryName = `opencodereview-${osPart}-${archPart}`
    }

    const candidates = [
      path.join(pkgDir, 'bin', binaryName),
      path.join(pkgDir, binaryName),
      path.join(pkgDir, '..', 'bin', binaryName),
    ]

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return { path: candidate, source: 'npm' }
      }
    }
  } catch {
    // npm 包未安装或无法解析
  }

  // 降级到 PATH 中的 ocr
  return { path: 'ocr', source: 'path' }
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
