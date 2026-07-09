import { fileURLToPath } from 'node:url'

import type { Part } from '@opencode-ai/sdk'

import {
  mimeToModality,
  type ModelMediaCapability,
} from './model-capability-cache.js'

type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>

/**
 * 文本类 MIME 前缀。
 *
 * 这些类型的文件内容可以被 LLM 直接理解，保留 FilePart 让 opencode
 * 以原始内容形式传递给模型。
 */
const TEXT_MIME_PREFIXES = [
  'text/',
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-yaml',
  'application/toml',
  'text/yaml',
  'text/x-toml',
]

function isTextMime(mime: string): boolean {
  const lower = mime.toLowerCase()
  for (const prefix of TEXT_MIME_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return true
    }
  }
  if (lower.includes('+json') || lower.includes('+xml')) {
    return true
  }
  return false
}

/**
 * 判断 FilePart 是否应被降级为路径文本。
 *
 * 决策矩阵：
 * - 文本类文件（text/*、json、xml、yaml 等）→ 不降级
 * - data: URL 内联内容（截图粘贴等，无磁盘路径）→ 不降级
 * - 有 modality 的媒体（image/audio/video/pdf）：
 *   - 模型支持 → 不降级
 *   - 模型不支持 → 降级
 * - 无 modality 的二进制（DOCX/XLSX/ZIP 等）→ 始终降级
 */
export function shouldDegradeForModel(
  part: MutableFilePart,
  caps: ModelMediaCapability,
): boolean {
  const mime = part.mime?.toLowerCase() ?? ''

  if (isTextMime(mime)) {
    return false
  }

  if (part.url?.startsWith('data:')) {
    return false
  }

  const modality = mimeToModality(mime)
  if (modality) {
    return !caps[modality]
  }

  return true
}

function isFilePart(part: Part): part is MutableFilePart {
  return part.type === 'file'
}

function isTextPart(part: Part): part is MutableTextPart {
  return part.type === 'text'
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从 FilePart 提取用户原始引用文本（如 `@docs/file.pdf`）。
 *
 * 优先使用 source.text.value（opencode 解析时记录的原始 token）；
 * 缺失时回退到 `@filename` 模式，用于匹配文本中的引用。
 */
function extractReferenceText(part: MutableFilePart): string | undefined {
  const sourceText = part.source?.text?.value?.trim()
  if (sourceText) {
    return sourceText
  }

  if (part.filename) {
    return `@${part.filename}`
  }

  return undefined
}

/**
 * 从 FilePart 提取文件系统路径（相对或绝对）。
 *
 * 优先使用 source.path（opencode 解析时记录的路径）；
 * 缺失时从 url（file:// URL）转换为文件系统路径。
 */
export function extractFilePath(part: MutableFilePart): string | undefined {
  const sourcePath = part.source?.path?.trim()
  if (sourcePath) {
    return sourcePath
  }

  if (part.url?.startsWith('file:')) {
    try {
      return fileURLToPath(part.url)
    } catch {
      // fileURLToPath 可能因路径非绝对而失败，回退到 filename
    }
  }

  return part.filename
}

/**
 * 在文本中把引用 token（如 `@docs/file.pdf`）替换为纯路径（如 `docs/file.pdf`）。
 */
function replaceReferenceWithPath(text: string, reference: string, path: string): string {
  const pattern = new RegExp(`(?<![\\w])${escapeRegExp(reference)}`, 'g')
  return text.replace(pattern, path)
}

/**
 * 根据 MIME 类型推断应调用的工具名。
 */
function inferToolName(mime: string): string {
  const lower = mime.toLowerCase()
  if (lower.startsWith('image/')) return 'ae-image'
  if (lower.startsWith('audio/')) return 'ae-audio'
  if (lower.startsWith('video/')) return 'ae-video'
  return ''
}

/**
 * 构造降级引导文本。
 *
 * LLM 看到路径和工具名后，按需主动调用 ae-image/ae-audio/ae-video 工具，
 * 通过 prompt 参数传入识别重点。
 */
function buildDegradationHint(degradedFiles: Array<{ path: string; mime: string }>): string {
  const lines = degradedFiles.map((item) => {
    const tool = inferToolName(item.mime)
    if (tool) {
      return `- ${item.path}（${item.mime}）→ 调用 ${tool}（file 参数传入此路径，可用 prompt 指定识别重点）`
    }
    return `- ${item.path}（${item.mime}）`
  })

  return [
    '<media-degradation-hint>',
    '以下媒体文件已转为路径（当前模型不支持直接输入该类型）。如需识别内容，请调用对应工具：',
    ...lines,
    '</media-degradation-hint>',
  ].join('\n')
}

/**
 * 对 parts 执行媒体降级：
 * 1. 根据 status 判断哪些 FilePart 需要降级
 * 2. 收集这些 FilePart 的引用文本、路径和 MIME
 * 3. 移除这些 FilePart
 * 4. 在 TextPart 中把 @file 引用替换为纯路径
 * 5. 追加降级引导文本（带工具调用提示）
 *
 * 文本类文件保留；媒体类按模型能力判断；无 modality 的二进制始终降级。
 */
export function degradeMediaFileParts(
  parts: Part[],
  caps: ModelMediaCapability,
): void {
  const degradableFileParts: MutableFilePart[] = []
  for (const part of parts) {
    if (isFilePart(part) && shouldDegradeForModel(part, caps)) {
      degradableFileParts.push(part)
    }
  }

  if (degradableFileParts.length === 0) {
    return
  }

  // 收集引用文本 → 路径映射和降级文件信息
  const references = new Map<string, string>()
  const degradedFiles: Array<{ path: string; mime: string }> = []

  for (const part of degradableFileParts) {
    const reference = extractReferenceText(part)
    const path = extractFilePath(part)
    if (reference && path) {
      references.set(reference, path)
    } else if (path) {
      references.set(`@${part.filename ?? path}`, path)
    }
    if (path) {
      degradedFiles.push({ path, mime: part.mime })
    }
  }

  // 移除需要降级的 FilePart
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (isFilePart(part) && shouldDegradeForModel(part, caps)) {
      parts.splice(i, 1)
    }
  }

  // 在 TextPart 中把 @file 引用替换为纯路径
  const unmatchedPaths: string[] = []
  for (const [reference, path] of references) {
    let matched = false
    for (const part of parts) {
      if (!isTextPart(part)) {
        continue
      }
      const before = part.text
      part.text = replaceReferenceWithPath(part.text, reference, path)
      if (part.text !== before) {
        matched = true
      }
    }
    if (!matched) {
      unmatchedPaths.push(path)
    }
  }

  // 追加降级引导文本
  const hint = buildDegradationHint(degradedFiles)
  const firstTextIndex = parts.findIndex(isTextPart)
  if (firstTextIndex >= 0) {
    const textPart = parts[firstTextIndex] as MutableTextPart
    const suffix = unmatchedPaths.length > 0
      ? `${unmatchedPaths.join(' ')}\n${hint}`
      : hint
    textPart.text = textPart.text.trimEnd() ? `${textPart.text.trimEnd()}\n${suffix}` : suffix
  } else {
    // 没有 TextPart 时创建一个
    parts.push({
      id: '',
      sessionID: '',
      messageID: '',
      type: 'text',
      text: hint,
    } as MutableTextPart)
  }
}


