/**
 * 文生图模型调用客户端（零依赖，Node 标准库）
 *
 * 支持的 provider：
 *   - openai    ：OpenAI 兼容的 POST {baseUrl}/images/generations
 *                 （OpenAI / 硅基流动 / OneAPI / NewAPI / vLLM 网关等）
 *   - gemini    ：POST {baseUrl}/models/{model}:generateContent（responseModalities=IMAGE）
 *   - dashscope ：POST {baseUrl}/services/aigc/text2image/image-synthesis（阿里云百炼）
 *   - custom    ：自建 / 本地 HTTP 服务，请求体为 OpenAI 风格，响应按常见键位提取
 *
 * 安全约定：
 *   - 密钥只从环境变量读取，配置文件里只写环境变量名
 *   - 密钥不会出现在日志、报错信息或 --dry-run 输出中
 *   - 下载远程图片时，只有当图片地址与 baseUrl 同源才会附带鉴权头
 */

import { getSkillConfig } from './ae-config.mjs'

/** 支持的 provider 列表 */
export const SUPPORTED_PROVIDERS = ['openai', 'gemini', 'dashscope', 'custom']

/** 各 provider 的默认密钥环境变量名 */
const DEFAULT_KEY_ENV = {
  openai: 'OPENAI_API_KEY',
  custom: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  dashscope: 'DASHSCOPE_API_KEY',
}

/** 各 provider 的默认 baseUrl */
const DEFAULT_BASE_URL = {
  openai: 'https://api.openai.com/v1',
  custom: 'http://127.0.0.1:8188',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  dashscope: 'https://dashscope.aliyuncs.com/api/v1',
}

/** 各 provider 的默认请求路径 */
const DEFAULT_PATH = {
  openai: '/images/generations',
  custom: '/images/generations',
  gemini: '',
  dashscope: '/services/aigc/text2image/image-synthesis',
}

function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

function joinUrl(baseUrl, path) {
  const base = normalizeBaseUrl(baseUrl)
  const suffix = String(path ?? '')
  if (!suffix) {
    return base
  }
  return suffix.startsWith('/') ? base + suffix : base + '/' + suffix
}

/**
 * 读取并规范化图片模型配置。
 *
 * @param {object} [options]
 * @param {string} [options.skillKey] ae.jsonc 中的顶层 key，默认取技能自身
 * @param {string} [options.cwd]
 * @param {object} [options.env]
 * @returns {object} 规范化后的配置 + 状态信息
 */
export function resolveImageModelConfig(options = {}) {
  const env = options.env ?? process.env
  const skillKey = options.skillKey ?? 'ae-pptx'
  const { value, configPath, source, parseError } = getSkillConfig(skillKey, { cwd: options.cwd, env })

  const raw = value.imageModel && typeof value.imageModel === 'object' && !Array.isArray(value.imageModel)
    ? value.imageModel
    : {}

  const provider = String(raw.provider ?? '').trim().toLowerCase()
  const model = String(raw.model ?? '').trim()
  const baseUrl = normalizeBaseUrl(raw.baseUrl || DEFAULT_BASE_URL[provider] || '')
  const path = raw.path === undefined || raw.path === null || raw.path === ''
    ? (DEFAULT_PATH[provider] ?? '/images/generations')
    : String(raw.path)
  const apiKeyEnv = String(raw.apiKeyEnv ?? DEFAULT_KEY_ENV[provider] ?? '').trim()

  const problems = []
  if (parseError) {
    problems.push(parseError)
  }
  if (!provider) {
    problems.push('ae.jsonc 中未配置 ae-pptx.imageModel.provider')
  } else if (!SUPPORTED_PROVIDERS.includes(provider)) {
    problems.push('不支持的 provider：' + provider + '（可用：' + SUPPORTED_PROVIDERS.join(' / ') + '）')
  }
  if (!model) {
    problems.push('ae.jsonc 中未配置 ae-pptx.imageModel.model')
  }
  if (!baseUrl) {
    problems.push('ae.jsonc 中未配置 ae-pptx.imageModel.baseUrl')
  }

  const apiKey = apiKeyEnv ? (env[apiKeyEnv] ?? '') : ''
  if (provider && model && baseUrl && apiKeyEnv && !apiKey) {
    problems.push('环境变量 ' + apiKeyEnv + ' 未设置（密钥只从环境变量读取，不写进配置文件）')
  }

  return {
    configured: problems.length === 0,
    provider,
    model,
    baseUrl,
    path,
    apiKeyEnv,
    apiKey,
    size: String(raw.size ?? '1536x1024'),
    quality: String(raw.quality ?? ''),
    style: String(raw.style ?? ''),
    negativePrompt: String(raw.negativePrompt ?? ''),
    timeoutSec: Number(raw.timeoutSec) > 0 ? Number(raw.timeoutSec) : 180,
    outputDir: String(raw.outputDir ?? ''),
    responsePath: String(raw.responsePath ?? ''),
    extraBody: raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body) ? raw.body : {},
    extraHeaders: raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers) ? raw.headers : {},
    configPath,
    configSource: source,
    problems,
  }
}

/** 从响应对象中按路径取值（支持 a.b[0].c 记法） */
function readPath(source, path) {
  if (!path) {
    return undefined
  }
  const steps = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cursor = source
  for (const step of steps) {
    if (cursor === null || cursor === undefined) {
      return undefined
    }
    cursor = cursor[step]
  }
  return cursor
}

/** 常见响应结构里的图片位置 */
const IMAGE_KEY_PATHS = [
  'data.0.b64_json',
  'data.0.image_base64',
  'data.0.url',
  'data.0.image_url',
  'data.0.b64',
  'output.results.0.b64_json',
  'output.results.0.url',
  'output.choices.0.message.content.0.image',
  'candidates.0.content.parts.0.inlineData.data',
  'images.0',
  'image',
  'b64_json',
  'url',
]

/** 从响应中提取图片（base64 或 URL） */
export function extractImageFromResponse(payload) {
  const candidates = [].concat(IMAGE_KEY_PATHS)
  for (const path of candidates) {
    const value = readPath(payload, path)
    if (typeof value === 'string' && value.trim() !== '') {
      const trimmed = value.trim()
      if (/^data:([^;,]+)?(;base64)?,/.test(trimmed)) {
        return { kind: 'dataUri', value: trimmed }
      }
      if (/^https?:\/\//i.test(trimmed)) {
        return { kind: 'url', value: trimmed }
      }
      return { kind: 'base64', value: trimmed }
    }
  }
  // Gemini 的 parts 是数组，逐个找 inlineData
  const parts = readPath(payload, 'candidates.0.content.parts')
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const inline = part?.inlineData?.data
      if (typeof inline === 'string' && inline) {
        return { kind: 'base64', value: inline, mimeType: part.inlineData.mimeType }
      }
    }
  }
  return null
}

/**
 * 组装最终提示词。
 * style / negativePrompt 对所有 provider 生效（多数模型没有独立的风格与反向提示参数），
 * 需要 provider 专有字段时用配置里的 body 追加。
 */
export function buildPrompt(config, options) {
  let prompt = String(options.prompt ?? '').trim()
  const style = String(options.style || config.style || '').trim()
  const negative = String(options.negativePrompt || config.negativePrompt || '').trim()
  if (style) {
    prompt += (prompt ? '。' : '') + '风格：' + style
  }
  if (negative) {
    prompt += (prompt ? '。' : '') + '避免出现：' + negative
  }
  return prompt
}

/** 组装请求（provider 相关） */
export function buildRequest(config, options) {
  const prompt = buildPrompt(config, options)
  const size = String(options.size || config.size || '').trim()
  const headers = {
    'Content-Type': 'application/json',
    ...config.extraHeaders,
  }

  if (config.provider === 'gemini') {
    headers['x-goog-api-key'] = config.apiKey
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
      ...config.extraBody,
    }
    if (options.aspect) {
      body.generationConfig.imageConfig = { aspectRatio: String(options.aspect) }
    }
    const url = joinUrl(config.baseUrl, '/models/' + config.model + ':generateContent')
    return { url, method: 'POST', headers, body }
  }

  headers.Authorization = 'Bearer ' + config.apiKey
  const body = {
    model: config.model,
    prompt: prompt,
    n: 1,
    ...config.extraBody,
  }
  if (size) {
    body.size = size
  }
  if (config.quality) {
    body.quality = config.quality
  }
  if (config.provider === 'dashscope') {
    body.input = { prompt, ...(config.negativePrompt ? { negative_prompt: config.negativePrompt } : {}) }
    body.parameters = {
      size: size || '1328*1328',
      n: 1,
      ...(config.extraBody.parameters || {}),
    }
    if (config.negativePrompt) {
      body.parameters.negative_prompt = config.negativePrompt
    }
    delete body.prompt
    delete body.n
  }
  return {
    url: joinUrl(config.baseUrl, config.path),
    method: 'POST',
    headers,
    body,
  }
}

/** 十六进制 MIME → 扩展名 */
function extensionFor(mimeType, fallback = 'png') {
  const type = String(mimeType ?? '').toLowerCase()
  if (type.includes('jpeg') || type.includes('jpg')) {
    return 'jpg'
  }
  if (type.includes('webp')) {
    return 'webp'
  }
  if (type.includes('svg')) {
    return 'svg'
  }
  return fallback
}

/** 下载远程图片（同源才附带鉴权头，避免把密钥外发） */
async function downloadImage(url, config, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const headers = {}
    let sameOrigin = false
    try {
      sameOrigin = new URL(url).origin === new URL(config.baseUrl).origin
    } catch {
      sameOrigin = false
    }
    if (sameOrigin && config.apiKey) {
      if (config.provider === 'gemini') {
        headers['x-goog-api-key'] = config.apiKey
      } else {
        headers.Authorization = 'Bearer ' + config.apiKey
      }
    }
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      throw new Error('下载图片失败：HTTP ' + response.status)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    const mimeType = response.headers.get('content-type') ?? ''
    return { buffer, mimeType }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 调用文生图模型生成图片。
 *
 * @param {object} options
 * @param {string} options.prompt 提示词
 * @param {object} options.config resolveImageModelConfig 的结果
 * @param {string} [options.size]
 * @param {string} [options.aspect]
 * @param {boolean} [options.dryRun] 只构造请求，不发出
 * @returns {Promise<object>} { buffer, mimeType, provider, model, url, request }
 */
export async function generateImage(options) {
  const config = options.config
  if (!config || !config.configured) {
    const reasons = config?.problems?.length ? config.problems.join('；') : '未配置图片模型'
    throw new Error('图片模型不可用：' + reasons)
  }
  const request = buildRequest(config, options)
  if (options.dryRun) {
    return {
      dryRun: true,
      provider: config.provider,
      model: config.model,
      url: request.url,
      method: request.method,
      body: request.body,
      headers: Object.keys(request.headers),
    }
  }

  const timeoutMs = Math.max(5, Number(options.timeoutSec || config.timeoutSec)) * 1000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    })
  } catch (error) {
    clearTimeout(timer)
    if (error.name === 'AbortError') {
      throw new Error('图片模型调用超时（' + Math.round(timeoutMs / 1000) + 's）')
    }
    throw new Error('图片模型调用失败：' + error.message)
  }
  clearTimeout(timer)

  const text = await response.text()
  if (!response.ok) {
    throw new Error('图片模型返回 HTTP ' + response.status + '：' + text.slice(0, 400))
  }

  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('图片模型响应不是合法 JSON：' + text.slice(0, 200))
  }

  const found = config.responsePath
    ? (() => {
      const value = readPath(payload, config.responsePath)
      if (typeof value === 'string' && value) {
        return /^https?:\/\//i.test(value) ? { kind: 'url', value } : { kind: 'base64', value }
      }
      return null
    })()
    : extractImageFromResponse(payload)

  if (!found) {
    throw new Error('图片模型响应中未找到图片数据（可用 responsePath 指定取值路径）')
  }

  if (found.kind === 'url') {
    const downloaded = await downloadImage(found.value, config, timeoutMs)
    return {
      buffer: downloaded.buffer,
      mimeType: downloaded.mimeType || 'image/png',
      extension: extensionFor(downloaded.mimeType),
      provider: config.provider,
      model: config.model,
      url: found.value,
    }
  }

  let base64 = found.value
  let mimeType = found.mimeType || 'image/png'
  if (found.kind === 'dataUri') {
    const commaIndex = base64.indexOf(',')
    const meta = base64.slice(5, commaIndex)
    const isBase64 = /;base64/i.test(meta)
    mimeType = meta.split(';')[0] || mimeType
    base64 = base64.slice(commaIndex + 1)
    if (!isBase64) {
      base64 = Buffer.from(decodeURIComponent(base64), 'binary').toString('base64')
    }
  }
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) {
    throw new Error('图片模型返回的图片数据为空')
  }
  return {
    buffer,
    mimeType,
    extension: extensionFor(mimeType),
    provider: config.provider,
    model: config.model,
  }
}
