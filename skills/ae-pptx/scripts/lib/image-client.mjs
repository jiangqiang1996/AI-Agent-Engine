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
 *
 * 配置边界（重要）：
 *   - **配置只写「模型接入信息」**：provider / baseUrl / path / model / apiKeyEnv /
 *     timeoutSec / responsePath / headers / body
 *   - **生成参数（尺寸 size、质量 quality、风格 style、反向提示词 negativePrompt）
 *     一律由调用方（技能）在调用时传入**，不写进配置文件。
 *     配置文件里若残留这些字段，会被忽略并给出迁移提示。
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

/**
 * 曾经允许写在配置里的「生成参数」，现已改为调用时传入（由技能按版面需求自主决定）。
 * 配置里若残留这些字段，会被忽略并在检查报告里给出迁移提示。
 */
export const GENERATION_PARAM_KEYS = ['size', 'quality', 'style', 'negativePrompt', 'outputDir']

/** 每个生成参数对应的替代方式提示 */
const GENERATION_PARAM_HINTS = {
  size: '改用命令行 --size <WxH> 或 --aspect <比例>，由技能按版面需求决定',
  quality: '改用命令行 --quality <档位>',
  style: '改用命令行 --style <描述>',
  negativePrompt: '改用命令行 --negative <描述>',
  outputDir: '改用命令行 --out <路径>（默认写到 ae/pptx/assets/）',
}

/** 各 provider 的默认图片尺寸（未显式指定尺寸时使用） */
const DEFAULT_SIZE = {
  openai: '1536x1024',
  custom: '1536x1024',
  gemini: '',
  dashscope: '1664*928',
}

/** 宽高比 → 该 provider 实际支持的尺寸（openai 兼容 / dashscope） */
const ASPECT_TO_SIZE = {
  openai: {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '16:9': '1536x1024',
    '9:16': '1024x1536',
    '4:3': '1536x1024',
  },
  dashscope: {
    '1:1': '1328*1328',
    '16:9': '1664*928',
    '9:16': '928*1664',
    '4:3': '1664*928',
  },
}

/** Gemini 支持的宽高比 */
const GEMINI_ASPECTS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']

function normalizeBaseUrl(value) {
  return String(value ?? '').trim().replace(/\/+$/, '')
}

/** 是否是合法的环境变量名（用于区分「环境变量名」与「密钥本身」） */
export function isEnvVarName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value ?? '').trim())
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
 * 配置里只放「模型接入信息」；尺寸、质量、风格等生成参数由调用方在调用时传入。
 *
 * 密钥有两种写法（`apiKey` 优先）：
 *   1. `apiKey`：密钥本身直接写在配置里（本地私有配置可用；不入库、不进日志）
 *   2. `apiKeyEnv`：环境变量名，密钥从环境变量读取（推荐）
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

  const problems = []
  const warnings = []
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

  // 密钥来源：apiKey（直接配置） > apiKeyEnv（环境变量名，或误写成密钥本身）
  const rawApiKey = String(raw.apiKey ?? '').trim()
  const rawApiKeyEnv = String(raw.apiKeyEnv ?? '').trim()
  let apiKey = ''
  let apiKeyEnv = ''
  let apiKeySource = ''

  if (rawApiKey) {
    apiKey = rawApiKey
    apiKeySource = 'config'
  } else if (rawApiKeyEnv) {
    if (isEnvVarName(rawApiKeyEnv)) {
      apiKeyEnv = rawApiKeyEnv
      apiKey = env[rawApiKeyEnv] ?? ''
      apiKeySource = apiKey ? 'env' : ''
      if (!apiKey) {
        problems.push('环境变量 ' + rawApiKeyEnv + ' 未设置（也可直接在 ae.jsonc 的 apiKey 里写密钥）')
      }
    } else {
      // 不是合法环境变量名 → 当作密钥本身使用
      apiKey = rawApiKeyEnv
      apiKeySource = 'config'
      warnings.push('ae-pptx.imageModel.apiKeyEnv 写的是密钥本身而不是环境变量名，已按字面量使用；建议改用 apiKey 字段')
    }
  } else {
    const fallbackEnv = DEFAULT_KEY_ENV[provider] ?? ''
    if (fallbackEnv) {
      apiKeyEnv = fallbackEnv
      apiKey = env[fallbackEnv] ?? ''
      apiKeySource = apiKey ? 'env' : ''
      if (!apiKey && provider && model && baseUrl) {
        problems.push('环境变量 ' + fallbackEnv + ' 未设置（也可直接在 ae.jsonc 的 apiKey 里写密钥）')
      }
    }
  }

  // 配置里残留的生成参数：忽略 + 提示迁移（不算错误，不阻塞调用）
  for (const key of GENERATION_PARAM_KEYS) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== '') {
      warnings.push('ae-pptx.imageModel.' + key + ' 已废弃并被忽略：' + (GENERATION_PARAM_HINTS[key] ?? '请在调用时传入'))
    }
  }

  return {
    configured: problems.length === 0,
    provider,
    model,
    baseUrl,
    path,
    apiKeyEnv,
    apiKey,
    apiKeySource,
    timeoutSec: Number(raw.timeoutSec) > 0 ? Number(raw.timeoutSec) : 180,
    responsePath: String(raw.responsePath ?? ''),
    extraBody: raw.body && typeof raw.body === 'object' && !Array.isArray(raw.body) ? raw.body : {},
    extraHeaders: raw.headers && typeof raw.headers === 'object' && !Array.isArray(raw.headers) ? raw.headers : {},
    configPath,
    configSource: source,
    problems,
    warnings,
  }
}

/** 尺寸串是否合法（如 1536x1024 / 1664*928） */
export function isValidSize(size) {
  return /^\d{2,5}\s*[x*X]\s*\d{2,5}$/.test(String(size ?? '').trim())
}

/** 把尺寸串按 provider 的分隔符习惯规范化（dashscope 用 *，其余用 x） */
export function normalizeSizeForProvider(provider, size) {
  const text = String(size ?? '').trim()
  if (!text) {
    return ''
  }
  const separator = provider === 'dashscope' ? '*' : 'x'
  return text.replace(/\s*[xX*]\s*/, separator)
}

/** 解析尺寸串为 { width, height } */
export function parseSize(size) {
  const match = String(size ?? '').trim().match(/^(\d{2,5})\s*[xX*]\s*(\d{2,5})$/)
  if (!match) {
    return null
  }
  return { width: Number(match[1]), height: Number(match[2]) }
}

/** 把比例化到最简，如 1536:1024 → 3:2 */
function reduceRatio(width, height) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b))
  const divisor = gcd(width, height) || 1
  return `${width / divisor}:${height / divisor}`
}

/** 数值比例，如 "16:9" → 1.777 */
function ratioValue(aspect) {
  const match = String(aspect ?? '').trim().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  if (!match) {
    return null
  }
  const denominator = Number(match[2])
  if (denominator === 0) {
    return null
  }
  return Number(match[1]) / denominator
}

/** 把任意比例吸附到 Gemini 支持的宽高比 */
function snapToGeminiAspect(aspect) {
  const value = ratioValue(aspect)
  if (value === null) {
    return ''
  }
  let best = ''
  let bestDistance = Infinity
  for (const candidate of GEMINI_ASPECTS) {
    const candidateValue = ratioValue(candidate)
    const distance = Math.abs(candidateValue - value)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate
    }
  }
  return best
}

/** 提示词内嵌参数指令的键名 → 内部字段名 */
const PROMPT_PARAM_KEYS = {
  size: 'size',
  aspect: 'aspect',
  quality: 'quality',
  style: 'style',
  negative: 'negativePrompt',
  negativeprompt: 'negativePrompt',
}

/** 去掉成对引号 */
function stripQuotes(value) {
  const text = String(value ?? '').trim()
  if (text.length >= 2) {
    const first = text[0]
    const last = text[text.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return text.slice(1, -1).trim()
    }
  }
  return text
}

/**
 * 解析提示词里的内嵌参数，并返回清洗后的提示词。
 *
 * 目的：生成参数（尺寸 / 宽高比 / 质量 / 风格 / 反向提示词）可以**写在提示词里当默认值**，
 * 调用方不必每次都拼一长串命令行参数；命令行参数优先级更高，会覆盖提示词里的默认值。
 *
 * 支持两种写法：
 *   1. 行内指令：`一张封面插画 @aspect=16:9 @quality=high @style=极简编辑风`
 *   2. 参数块：  `[params] aspect=16:9 quality=high`（或独占一行的 `[params]` + 若干 `key=value` 行）
 *
 * 指令会被**从提示词里剥离**，不会发给模型。
 *
 * @param {string} prompt 原始提示词
 * @returns {{ prompt: string, params: { size?: string, aspect?: string, quality?: string, style?: string, negativePrompt?: string } }}
 */
export function parsePromptParams(prompt) {
  const params = {}
  const assign = (rawKey, rawValue) => {
    const key = PROMPT_PARAM_KEYS[String(rawKey ?? '').trim().toLowerCase()]
    const value = stripQuotes(rawValue)
    if (key && value) {
      params[key] = value
    }
  }
  const assignPairs = (body) => {
    for (const pair of String(body ?? '').split(/\s+/)) {
      if (!pair) {
        continue
      }
      const index = pair.indexOf('=')
      if (index <= 0) {
        continue
      }
      assign(pair.slice(0, index), pair.slice(index + 1))
    }
  }

  const lines = String(prompt ?? '').split('\n')
  const kept = []
  let inBlock = false

  for (const line of lines) {
    // 参数块独占一行：后面连续的 key=value 行都属于这个块
    if (/^\s*\[params\]\s*$/i.test(line)) {
      inBlock = true
      continue
    }
    if (inBlock) {
      if (/^\s*$/.test(line)) {
        inBlock = false
        kept.push(line)
        continue
      }
      const pair = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*(.+?)\s*$/)
      if (pair) {
        assign(pair[1], pair[2])
        continue
      }
      inBlock = false
    }
    // 单行参数块
    const single = line.match(/^\s*\[params\]\s*(.+?)\s*$/i)
    if (single) {
      assignPairs(single[1])
      continue
    }
    kept.push(line)
  }

  // 行内指令：@key=value（值到下一个 @ 指令或行尾为止）
  const cleaned = kept
    .map((line) => line.replace(
      /@(size|aspect|quality|style|negative|negativeprompt)\s*=\s*("[^"]*"|'[^']*'|[^\n@]*)/gi,
      (match, key, value) => {
        assign(key, value)
        return ''
      },
    ))
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { prompt: cleaned, params }
}

/**
 * 决定本次调用用的图片尺寸与宽高比。
 *
 * 优先级：显式尺寸 > 宽高比（按 provider 支持集换算） > provider 默认尺寸。
 * Gemini 不接受 size，只接受 aspectRatio，此时把 size 的比例折算成 aspectRatio。
 *
 * @param {object} config resolveImageModelConfig 的结果
 * @param {object} [options]
 * @param {string} [options.size] 显式尺寸
 * @param {string} [options.aspect] 宽高比
 * @param {string} [options.source] 参数来源标签：'cli'（命令行）/ 'prompt'（提示词内嵌）
 * @returns {{ size: string, aspect: string, source: 'cli'|'prompt'|'default', via: 'size'|'aspect'|'default', warnings: string[] }}
 */
export function resolveImageSize(config, options = {}) {
  const provider = String(config?.provider ?? 'openai').toLowerCase()
  const explicitSize = String(options.size ?? '').trim()
  const requestedAspect = String(options.aspect ?? '').trim()
  const origin = options.source === 'prompt' ? 'prompt' : 'cli'
  const warnings = []

  if (explicitSize && !isValidSize(explicitSize)) {
    throw new Error('图片尺寸格式非法：' + explicitSize + '（应形如 1536x1024）')
  }

  // Gemini：只认 aspectRatio
  if (provider === 'gemini') {
    let aspect = requestedAspect
    let source = requestedAspect ? origin : 'default'
    let via = requestedAspect ? 'aspect' : 'default'
    if (!aspect && explicitSize) {
      const parsed = parseSize(explicitSize)
      aspect = parsed ? snapToGeminiAspect(reduceRatio(parsed.width, parsed.height)) : ''
      source = origin
      via = 'size'
    }
    if (!aspect) {
      aspect = '16:9'
      source = 'default'
      via = 'default'
    }
    if (explicitSize) {
      warnings.push('Gemini 不接受 size 参数，已按 ' + explicitSize + ' 的比例折算为 aspectRatio=' + aspect)
    }
    return { size: '', aspect, source, via, warnings }
  }

  if (explicitSize) {
    return {
      size: normalizeSizeForProvider(provider, explicitSize),
      aspect: requestedAspect,
      source: origin,
      via: 'size',
      warnings,
    }
  }

  const table = ASPECT_TO_SIZE[provider] ?? ASPECT_TO_SIZE.openai
  if (requestedAspect) {
    const mapped = table[requestedAspect]
    if (!mapped) {
      warnings.push('provider ' + provider + ' 没有与 ' + requestedAspect + ' 对应的标准尺寸，改用默认尺寸')
      return {
        size: normalizeSizeForProvider(provider, DEFAULT_SIZE[provider] ?? DEFAULT_SIZE.openai),
        aspect: requestedAspect,
        source: 'default',
        via: 'default',
        warnings,
      }
    }
    return {
      size: normalizeSizeForProvider(provider, mapped),
      aspect: requestedAspect,
      source: origin,
      via: 'aspect',
      warnings,
    }
  }

  const fallback = DEFAULT_SIZE[provider] ?? DEFAULT_SIZE.openai
  return {
    size: normalizeSizeForProvider(provider, fallback),
    aspect: '',
    source: 'default',
    via: 'default',
    warnings,
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
 * style / negativePrompt 由调用方传入（多数模型没有独立的风格与反向提示参数），
 * 需要 provider 专有字段时用配置的 body 追加。
 */
export function buildPrompt(config, options) {
  let prompt = String(options.prompt ?? '').trim()
  const style = String(options.style ?? '').trim()
  const negative = String(options.negativePrompt ?? '').trim()
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
  const size = String(options.size ?? '').trim()
  const quality = String(options.quality ?? '').trim()
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
  if (quality) {
    body.quality = quality
  }
  if (config.provider === 'dashscope') {
    body.input = { prompt, ...(options.negativePrompt ? { negative_prompt: options.negativePrompt } : {}) }
    body.parameters = {
      size: size || '1328*1328',
      n: 1,
      ...(config.extraBody.parameters || {}),
    }
    if (options.negativePrompt) {
      body.parameters.negative_prompt = options.negativePrompt
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

/**
 * 读取图片的真实像素尺寸。
 *
 * 用途：模型/网关可能忽略请求里的 size 而静默回落成别的尺寸，
 * 拿到真实像素后才知道插入 PPT 时该怎么摆、要不要裁切。
 *
 * @param {Buffer} buffer 图片二进制
 * @returns {{ width: number, height: number, type: string }|null}
 */
export function detectImageSize(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16) {
    return null
  }

  // PNG：IHDR 固定在 8~24 字节
  if (buffer.length >= 24
    && buffer.readUInt32BE(0) === 0x89504e47
    && buffer.readUInt32BE(4) === 0x0d0a1a0a) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), type: 'png' }
  }

  // GIF：逻辑屏幕宽高（小端）
  if (buffer.subarray(0, 3).toString('ascii') === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), type: 'gif' }
  }

  // JPEG：逐段扫描 SOF 标记
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }
      const marker = buffer[offset + 1]
      const isSof = marker >= 0xc0 && marker <= 0xcf
        && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isSof) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
          type: 'jpeg',
        }
      }
      offset += 2 + buffer.readUInt16BE(offset + 2)
    }
    return null
  }

  // WEBP：VP8 / VP8L / VP8X 三种变体
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buffer.subarray(12, 16).toString('ascii')
    if (chunk === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
        type: 'webp',
      }
    }
    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        type: 'webp',
      }
    }
    if (chunk === 'VP8X') {
      return {
        width: 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)),
        height: 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)),
        type: 'webp',
      }
    }
  }

  return null
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
 * @param {string} [options.size] 本次请求的图片尺寸（由调用方决定）
 * @param {string} [options.aspect] 本次请求的宽高比（由调用方决定）
 * @param {string} [options.quality] 质量档位
 * @param {string} [options.style] 风格描述
 * @param {string} [options.negativePrompt] 反向提示词
 * @param {boolean} [options.dryRun] 只构造请求，不发出
 * @returns {Promise<object>} { buffer, mimeType, provider, model, url, request, pixels }
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
      pixels: detectImageSize(downloaded.buffer),
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
    pixels: detectImageSize(buffer),
  }
}
