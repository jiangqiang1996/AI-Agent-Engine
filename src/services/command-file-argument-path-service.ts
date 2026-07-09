import { fileURLToPath } from 'node:url'

import type { Part } from '@opencode-ai/sdk'

import { mimeToModality, type ModelMediaCapability } from './model-capability-cache.js'

type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>

/**
 * 文本类 MIME 前缀。
 *
 * 这些类型的文件内容可以被 LLM 直接理解，保留 FilePart 让 opencode
 * 以原始内容形式传递给模型。
 *
 * 维护引导：新增需要保留 FilePart 的文本类 MIME 时，在此列表添加前缀；
 * 媒体类（image/audio/video/pdf）由模型能力动态判断，无需在此注册。
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

/**
 * 判断 MIME 是否为文本类。
 * 文本类文件始终保留为 FilePart，LLM 可直接读取内容。
 */
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
 * 判断 FilePart 是否应被转换为路径文本（基于模型能力动态判断）。
 *
 * - 文本类文件（text/*、json、xml、yaml 等）→ 保留
 * - 有 modality 的媒体（image/audio/video/pdf）→ 按模型能力判断，不支持则转换
 * - 无 modality 的二进制（DOCX/XLSX/ZIP 等）→ 始终转换
 * - data: URL 内联内容（截图粘贴等）→ 始终保留，无磁盘路径可转换
 */
export function shouldConvertForModel(part: MutableFilePart, capability: ModelMediaCapability): boolean {
  const mime = part.mime?.toLowerCase() ?? ''

  if (isTextMime(mime)) {
    return false
  }

  if (part.url?.startsWith('data:')) {
    return false
  }

  const modality = mimeToModality(mime)
  if (modality) {
    return !capability[modality]
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
      // fileURLToPath 可能因路径非绝对而失败（如 Windows 上缺少盘符），
      // 回退到 filename 作为路径
    }
  }

  return part.filename
}

/**
 * 在文本中把引用 token（如 `@docs/file.pdf`）替换为纯路径（如 `docs/file.pdf`）。
 *
 * 使用负向后行断言 `(?<![\w])` 确保 `@` 前面不是单词字符，
 * 避免误替换 `keep@file.pdf` 这类邮箱式文本；
 * 同时允许前导是反引号、冒号、空格等（命令模板中 `@file` 常被反引号包裹）。
 */
function replaceReferenceWithPath(text: string, reference: string, path: string): string {
  const pattern = new RegExp(`(?<![\\w])${escapeRegExp(reference)}`, 'g')
  return text.replace(pattern, path)
}

/**
 * 把 parts 中模型不支持的 FilePart 转换为纯文本路径：
 * 1. 根据 caps 判断哪些 FilePart 需要转换
 * 2. 收集这些 FilePart 的引用文本和路径
 * 3. 移除这些 FilePart
 * 4. 在 TextPart 中把 @file 引用替换为纯路径
 * 5. 若引用文本未匹配到任何 TextPart，把路径追加到首个 TextPart 末尾
 *
 * 文本类文件保留；媒体类按模型能力判断；无 modality 的二进制始终转换。
 */
export function convertUnsupportedFilePartsToPath(parts: Part[], capability: ModelMediaCapability): void {
  const convertibleFileParts: MutableFilePart[] = []
  for (const part of parts) {
    if (isFilePart(part) && shouldConvertForModel(part, capability)) {
      convertibleFileParts.push(part)
    }
  }

  if (convertibleFileParts.length === 0) {
    return
  }

  const references = new Map<string, string>()
  for (const part of convertibleFileParts) {
    const reference = extractReferenceText(part)
    const path = extractFilePath(part)
    if (reference && path) {
      references.set(reference, path)
    } else if (path) {
      references.set(`@${part.filename ?? path}`, path)
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i]
    if (isFilePart(part) && shouldConvertForModel(part, capability)) {
      parts.splice(i, 1)
    }
  }

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

  if (unmatchedPaths.length > 0) {
    const firstTextIndex = parts.findIndex(isTextPart)
    if (firstTextIndex >= 0) {
      const textPart = parts[firstTextIndex] as MutableTextPart
      const suffix = unmatchedPaths.join(' ')
      textPart.text = textPart.text.trimEnd() ? `${textPart.text.trimEnd()} ${suffix}` : suffix
    }
  }
}
