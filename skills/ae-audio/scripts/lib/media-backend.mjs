/**
 * 媒体描述后端（零依赖，可复制到任意技能内部使用）
 *
 * 为图片 / 音频 / 视频提供"把媒体转成文字"的确定性降级链：
 *
 *   1. 视觉/转写 LLM 端点（OpenAI 兼容接口，配置在 ae.jsonc 的技能 key 下）
 *   2. 本地命令行工具（tesseract / whisper）
 *   3. 纯元数据兜底（只给出可确定的客观信息，不编造内容）
 *
 * 共享真源：tools/shared/media-backend.mjs
 * 同步到：skills/<skill>/scripts/lib/media-backend.mjs（由 tools/sync-shared.mjs 分发）
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

/* ------------------------------------------------------------------ *
 * MIME 识别
 * ------------------------------------------------------------------ */

const MAGIC = [
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/bmp', ext: 'bmp', bytes: [0x42, 0x4d] },
  { mime: 'image/tiff', ext: 'tiff', bytes: [0x49, 0x49, 0x2a, 0x00] },
  { mime: 'audio/mpeg', ext: 'mp3', bytes: [0x49, 0x44, 0x33] },
  { mime: 'audio/flac', ext: 'flac', bytes: [0x66, 0x4c, 0x61, 0x43] },
  { mime: 'audio/ogg', ext: 'ogg', bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: 'application/octet-stream', ext: 'mp4', bytes: [0x1a, 0x45, 0xdf, 0xa3] },
]

/**
 * 通过魔数识别媒体类型。
 * @returns {{ mime: string, ext: string, kind: 'image'|'audio'|'video'|'unknown' }}
 */
export function detectMediaType(filePath) {
  const buffer = readFileSync(filePath)
  const head = buffer.subarray(0, 16)

  // RIFF 容器：WAV / AVI / WEBP
  if (head.subarray(0, 4).toString('ascii') === 'RIFF') {
    const type = head.subarray(8, 12).toString('ascii')
    if (type === 'WAVE') {
      return { mime: 'audio/wav', ext: 'wav', kind: 'audio' }
    }
    if (type === 'AVI ') {
      return { mime: 'video/x-msvideo', ext: 'avi', kind: 'video' }
    }
    if (type === 'WEBP') {
      return { mime: 'image/webp', ext: 'webp', kind: 'image' }
    }
  }

  // ISO BMFF 容器：ftyp
  if (head.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = head.subarray(8, 12).toString('ascii').trim()
    if (brand.startsWith('qt')) {
      return { mime: 'video/quicktime', ext: 'mov', kind: 'video' }
    }
    if (brand.startsWith('M4A') || brand.startsWith('M4B')) {
      return { mime: 'audio/mp4', ext: 'm4a', kind: 'audio' }
    }
    if (brand.startsWith('avif') || brand.startsWith('avis')) {
      return { mime: 'image/avif', ext: 'avif', kind: 'image' }
    }
    return { mime: 'video/mp4', ext: 'mp4', kind: 'video' }
  }

  for (const entry of MAGIC) {
    if (entry.bytes.every((byte, index) => head[index] === byte)) {
      const kind = entry.mime.startsWith('image/')
        ? 'image'
        : entry.mime.startsWith('audio/')
          ? 'audio'
          : entry.mime.startsWith('video/')
            ? 'video'
            : 'unknown'
      return { mime: entry.mime, ext: entry.ext, kind }
    }
  }

  // 魔数未命中时按扩展名兜底
  const ext = extname(filePath).slice(1).toLowerCase()
  const byExt = {
    png: ['image/png', 'image'], jpg: ['image/jpeg', 'image'], jpeg: ['image/jpeg', 'image'],
    gif: ['image/gif', 'image'], webp: ['image/webp', 'image'], bmp: ['image/bmp', 'image'],
    mp3: ['audio/mpeg', 'audio'], wav: ['audio/wav', 'audio'], ogg: ['audio/ogg', 'audio'],
    flac: ['audio/flac', 'audio'], m4a: ['audio/mp4', 'audio'], aac: ['audio/aac', 'audio'],
    mp4: ['video/mp4', 'video'], webm: ['video/webm', 'video'], avi: ['video/x-msvideo', 'video'],
    mov: ['video/quicktime', 'video'], mkv: ['video/x-matroska', 'video'], flv: ['video/x-flv', 'video'],
  }
  if (byExt[ext]) {
    return { mime: byExt[ext][0], ext, kind: byExt[ext][1] }
  }
  return { mime: 'application/octet-stream', ext, kind: 'unknown' }
}

/* ------------------------------------------------------------------ *
 * 外部命令定位
 * ------------------------------------------------------------------ */

export function commandExists(command) {
  if (!command) {
    return false
  }
  const probe = process.platform === 'win32' ? 'where' : 'which'
  const result = spawnSync(probe, [command], { encoding: 'utf8', shell: process.platform === 'win32' })
  return result.status === 0 && `${result.stdout ?? ''}`.trim().length > 0
}

/* ------------------------------------------------------------------ *
 * LLM 端点（OpenAI 兼容）
 * ------------------------------------------------------------------ */

function resolveApiKey(config) {
  const envName = config.apiKeyEnv
  if (!envName) {
    return null
  }
  return process.env[envName] ?? null
}

async function callChatCompletion({ config, prompt, dataUrl }) {
  const endpoint = config.endpoint
  const apiKey = resolveApiKey(config)
  if (!endpoint || !apiKey) {
    return { ok: false, reason: '未配置 endpoint 或缺少 API Key 环境变量' }
  }

  const content = dataUrl
    ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }]
    : [{ type: 'text', text: prompt }]

  const body = {
    model: config.model || 'gpt-4o-mini',
    messages: [{ role: 'user', content }],
    max_tokens: config.maxTokens ?? 1200,
  }

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    return { ok: false, reason: `请求端点失败: ${error.message}` }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return { ok: false, reason: `端点返回 ${response.status}: ${detail.slice(0, 300)}` }
  }

  const payload = await response.json().catch(() => null)
  const text = payload?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, reason: '端点响应中没有可用的文本内容' }
  }
  return { ok: true, text: text.trim(), backend: 'llm' }
}

async function callTranscription({ config, filePath, mime }) {
  const endpoint = config.endpoint
  const apiKey = resolveApiKey(config)
  if (!endpoint || !apiKey) {
    return { ok: false, reason: '未配置 endpoint 或缺少 API Key 环境变量' }
  }

  const form = new FormData()
  const buffer = readFileSync(filePath)
  form.append('file', new Blob([buffer], { type: mime || 'application/octet-stream' }), basename(filePath))
  form.append('model', config.model || 'whisper-1')

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
    })
  } catch (error) {
    return { ok: false, reason: `请求端点失败: ${error.message}` }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    return { ok: false, reason: `端点返回 ${response.status}: ${detail.slice(0, 300)}` }
  }

  const payload = await response.json().catch(() => null)
  const text = payload?.text
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, reason: '端点响应中没有转写文本' }
  }
  return { ok: true, text: text.trim(), backend: 'llm' }
}

/* ------------------------------------------------------------------ *
 * 本地命令行工具
 * ------------------------------------------------------------------ */

function runOcr(filePath, config) {
  const command = config.ocrCommand || 'tesseract'
  if (!commandExists(command)) {
    return { ok: false, reason: `未找到本地 OCR 命令: ${command}` }
  }
  try {
    const output = execFileSync(command, [filePath, 'stdout', '-l', config.ocrLanguage || 'chi_sim+eng'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    if (!output.trim()) {
      return { ok: false, reason: 'OCR 未识别出文本' }
    }
    return { ok: true, text: output.trim(), backend: `ocr:${command}` }
  } catch (error) {
    return { ok: false, reason: `OCR 执行失败: ${error.message}` }
  }
}

function runWhisper(filePath, config) {
  const command = config.whisperCommand || 'whisper'
  if (!commandExists(command)) {
    return { ok: false, reason: `未找到本地转写命令: ${command}` }
  }
  try {
    const output = execFileSync(command, [filePath, '--output_format', 'txt', '--output_dir', config.tmpDir ?? '.'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const produced = config.tmpDir
      ? readFileSync(join(config.tmpDir, stripExtension(basename(filePath)) + '.txt'), 'utf8')
      : output
    if (!produced || !produced.trim()) {
      return { ok: false, reason: '本地转写未产出文本' }
    }
    return { ok: true, text: produced.trim(), backend: `whisper:${command}` }
  } catch (error) {
    return { ok: false, reason: `本地转写失败: ${error.message}` }
  }
}

/* ------------------------------------------------------------------ *
 * 公开 API
 * ------------------------------------------------------------------ */

const DEFAULT_IMAGE_PROMPT = [
  '请用中文详细描述这张图片的内容，包括：',
  '1. 画面主体与场景',
  '2. 文字内容（逐字转写，保留原始语言）',
  '3. 界面元素、布局、配色',
  '4. 图表、代码、表格等需要精确转录的部分',
  '5. 任何异常、错误提示或可疑细节',
].join('\n')

const DEFAULT_AUDIO_PROMPT = [
  '请用中文转写这段音频的全部内容，包含说话人信息、语气要点与重要背景音。',
  '若包含技术术语、命令、报错信息，请原样保留。',
].join('\n')

/**
 * 描述图片。
 * @returns {Promise<{ text: string, backend: string, warnings: string[] }>}
 */
export async function describeImage({ filePath, config = {}, prompt }) {
  const warnings = []
  const media = detectMediaType(filePath)
  if (media.kind !== 'image') {
    throw new Error(`不是图片文件（识别为 ${media.mime}）`)
  }

  // 后端 1：视觉端点
  if (config.endpoint) {
    const dataUrl = `data:${media.mime};base64,${readFileSync(filePath).toString('base64')}`
    const result = await callChatCompletion({
      config,
      prompt: prompt || config.prompt || DEFAULT_IMAGE_PROMPT,
      dataUrl,
    })
    if (result.ok) {
      return { text: result.text, backend: result.backend, warnings, media }
    }
    warnings.push(`视觉端点不可用：${result.reason}`)
  }

  // 后端 2：本地 OCR
  const ocr = runOcr(filePath, config)
  if (ocr.ok) {
    return { text: ocr.text, backend: ocr.backend, warnings, media }
  }
  if (config.ocrCommand || config.endpoint) {
    warnings.push(`本地 OCR 不可用：${ocr.reason}`)
  }

  // 后端 3：元数据兜底
  const size = statSync(filePath).size
  warnings.push(
    '未配置可用的描述后端，仅输出文件元信息。请在 ae.jsonc 中配置该技能的 endpoint（OpenAI 兼容视觉/转写接口），或安装本地 tesseract / whisper。',
  )
  return {
    text: [
      `文件：${basename(filePath)}`,
      `类型：${media.mime}`,
      `大小：${size} 字节`,
      '内容：无法在本地判定（未配置描述后端）。',
    ].join('\n'),
    backend: 'metadata',
    warnings,
    media,
  }
}

/**
 * 转写音频。
 */
export async function transcribeAudio({ filePath, config = {}, prompt }) {
  const warnings = []
  const media = detectMediaType(filePath)
  if (media.kind !== 'audio' && media.kind !== 'unknown') {
    throw new Error(`不是音频文件（识别为 ${media.mime}）`)
  }

  if (config.endpoint) {
    const result = await callTranscription({ config, filePath, mime: media.mime })
    if (result.ok) {
      return { text: result.text, backend: result.backend, warnings, media }
    }
    warnings.push(`转写端点不可用：${result.reason}`)
  }

  const whisper = runWhisper(filePath, config)
  if (whisper.ok) {
    return { text: whisper.text, backend: whisper.backend, warnings, media }
  }
  if (config.whisperCommand || config.endpoint) {
    warnings.push(`本地转写不可用：${whisper.reason}`)
  }

  const size = statSync(filePath).size
  warnings.push(
    '未配置可用的转写后端，仅输出文件元信息。请在 ae.jsonc 中配置该技能的 endpoint（OpenAI 兼容转写接口），或安装本地 whisper。',
  )
  return {
    text: [
      `文件：${basename(filePath)}`,
      `类型：${media.mime}`,
      `大小：${size} 字节`,
      '内容：无法在本地判定（未配置转写后端）。',
    ].join('\n'),
    backend: 'metadata',
    warnings,
    media,
  }
}

/**
 * 读取媒体元信息（ffprobe 优先，缺失则回退到文件属性）。
 */
export function probeMedia(filePath, config = {}) {
  const media = detectMediaType(filePath)
  const info = { mime: media.mime, kind: media.kind, size: statSync(filePath).size }
  const ffprobe = config.ffprobe || 'ffprobe'

  if (!commandExists(ffprobe)) {
    info.ffprobeAvailable = false
    return info
  }
  info.ffprobeAvailable = true

  try {
    const output = execFileSync(ffprobe, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath,
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })

    const parsed = JSON.parse(output)
    const format = parsed.format ?? {}
    info.durationSeconds = format.duration ? Number(format.duration) : undefined
    info.bitrate = format.bit_rate ? Number(format.bit_rate) : undefined
    info.formatName = format.format_name

    const videoStream = (parsed.streams ?? []).find((s) => s.codec_type === 'video')
    const audioStream = (parsed.streams ?? []).find((s) => s.codec_type === 'audio')
    if (videoStream) {
      info.width = videoStream.width
      info.height = videoStream.height
      info.frameRate = videoStream.r_frame_rate
      info.videoCodec = videoStream.codec_name
    }
    if (audioStream) {
      info.channels = audioStream.channels
      info.sampleRate = audioStream.sample_rate
      info.audioCodec = audioStream.codec_name
    }
  } catch (error) {
    info.probeError = error.message
  }

  return info
}

/**
 * 用 ffmpeg 抽取视频关键帧。
 * @returns {string[]} 抽取出的帧文件路径
 */
export function extractVideoFrames({ filePath, outputDir, intervalSeconds = 5, maxFrames = 12, ffmpeg = 'ffmpeg' }) {
  if (!commandExists(ffmpeg)) {
    throw new Error(`未找到 ffmpeg 命令（${ffmpeg}）`)
  }
  mkdirSafe(outputDir)
  const pattern = join(outputDir, 'frame-%04d.png')
  try {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-i', filePath,
      '-vf', `fps=1/${Math.max(1, intervalSeconds)}`,
      '-frames:v', String(Math.max(1, maxFrames)),
      '-y', pattern,
    ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (error) {
    throw new Error(`ffmpeg 抽帧失败: ${error.message}`)
  }
  return listFiles(outputDir).filter((f) => f.endsWith('.png')).sort()
}

/**
 * 用 ffmpeg 抽取音轨为 wav。
 */
export function extractAudioTrack({ filePath, outputPath, ffmpeg = 'ffmpeg' }) {
  if (!commandExists(ffmpeg)) {
    throw new Error(`未找到 ffmpeg 命令（${ffmpeg}）`)
  }
  mkdirSafe(join(outputPath, '..'))
  try {
    execFileSync(ffmpeg, [
      '-hide_banner', '-loglevel', 'error',
      '-i', filePath,
      '-vn',
      '-ac', '1', '-ar', '16000',
      '-y', outputPath,
    ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch (error) {
    throw new Error(`ffmpeg 抽取音轨失败: ${error.message}`)
  }
  return outputPath
}


/** 去掉文件名扩展名（不做正则，避免模板字面量中的转义问题）。 */
function stripExtension(fileName) {
  const index = fileName.lastIndexOf('.')
  return index > 0 ? fileName.slice(0, index) : fileName
}

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function mkdirSafe(dir) {
  mkdirSync(dir, { recursive: true })
}

function listFiles(dir) {
  if (!existsSync(dir)) {
    return []
  }
  return readdirSync(dir).map((name) => join(dir, name))
}
