import { fileURLToPath } from 'node:url'

import type { Part } from '@opencode-ai/sdk'

type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>

/**
 * 文本类 MIME 前缀。
 *
 * 这些类型的文件内容可以被 LLM 直接理解，保留 FilePart 让 opencode
 * 以原始内容形式传递给模型。
 *
 * 维护引导：新增需要保留 FilePart 的文本类 MIME 时，在此列表添加前缀；
 * 图片类在 IMAGE_MIME_PREFIXES 添加。其余类型（PDF、DOCX 等）自动被转换为
 * 纯路径文本，无需额外注册。
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
 * 图片类 MIME 前缀。
 *
 * 支持 vision 的模型可以直接处理图片，保留 FilePart；
 * ae:image 工具自身也会读取图片文件。
 */
const IMAGE_MIME_PREFIXES = [
  'image/',
]

/**
 * 判断 FilePart 是否应被转换为路径文本。
 *
 * 文本文件（text/*、json、xml、yaml 等）和图片文件（image/*）
 * 保留为 FilePart 让 LLM 直接处理内容；
 * 其他类型（PDF、DOCX、PPTX、XLSX、ZIP 等）转换为纯路径，
 * 由底层工具自行读取文件内容。
 *
 * MIME 包含 +json 或 +xml 子类型后缀的也被识别为文本类，
 * 如 application/vnd.api+json、application/vnd.openxmlformats...+xml。
 */
export function isConvertibleFilePart(part: MutableFilePart): boolean {
  const mime = part.mime?.toLowerCase() ?? ''
  for (const prefix of TEXT_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) {
      return false
    }
  }
  for (const prefix of IMAGE_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) {
      return false
    }
  }
  // MIME 子类型包含 +json 或 +xml 后缀的也是文本类（如 application/vnd.api+json）
  if (mime.includes('+json') || mime.includes('+xml')) {
    return false
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
function extractFilePath(part: MutableFilePart): string | undefined {
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
 * 把 parts 中符合条件的 FilePart 转换为纯文本路径：
 * 1. 识别非文本、非图片的 FilePart
 * 2. 收集这些 FilePart 的引用文本和路径
 * 3. 移除这些 FilePart
 * 4. 在 TextPart 中把 @file 引用替换为纯路径
 * 5. 若引用文本未匹配到任何 TextPart，把路径追加到首个 TextPart 末尾
 *
 * 保留文本类和图片类 FilePart 不做转换。
 */
export function convertNonTextImageFilePartsToPath(parts: Part[]): void {
  const convertibleFileParts: MutableFilePart[] = []
  for (const part of parts) {
    if (isFilePart(part) && isConvertibleFilePart(part)) {
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
    if (isFilePart(part) && isConvertibleFilePart(part)) {
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
