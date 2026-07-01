import { fileURLToPath } from 'node:url'

import type { Part } from '@opencode-ai/sdk'

import { FILE_PATH_COMMANDS } from '../schemas/ae-asset-schema.js'

type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>

const FILE_PATH_COMMAND_SET = new Set<string>(FILE_PATH_COMMANDS)

/**
 * 判断命令是否为文件路径型命令。
 *
 * 路径型命令的底层工具自行读取文件内容，LLM 只需看到路径文本即可调用工具；
 * 因此在 command.execute.before 钩子中会把 FilePart 转换为纯路径文本，
 * 避免二进制内容被发送给 LLM。
 */
export function isFilePathCommand(command: string): boolean {
  return FILE_PATH_COMMAND_SET.has(command)
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
 * 把 parts 中的所有 FilePart 转换为纯文本路径：
 * 1. 收集所有 FilePart 的引用文本和路径
 * 2. 移除所有 FilePart
 * 3. 在 TextPart 中把 @file 引用替换为纯路径
 * 4. 若引用文本未匹配到任何 TextPart，把路径追加到首个 TextPart 末尾
 *
 * 调用方应先通过 isFilePathCommand 判断是否需要转换。
 */
export function convertFilePartsToPathText(parts: Part[]): void {
  const fileParts: MutableFilePart[] = []
  for (const part of parts) {
    if (isFilePart(part)) {
      fileParts.push(part)
    }
  }

  if (fileParts.length === 0) {
    return
  }

  const references = new Map<string, string>()
  for (const part of fileParts) {
    const reference = extractReferenceText(part)
    const path = extractFilePath(part)
    if (reference && path) {
      references.set(reference, path)
    } else if (path) {
      references.set(`@${part.filename ?? path}`, path)
    }
  }

  for (let i = parts.length - 1; i >= 0; i--) {
    if (isFilePart(parts[i])) {
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
