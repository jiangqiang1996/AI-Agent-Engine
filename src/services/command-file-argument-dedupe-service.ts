import type { Part } from '@opencode-ai/sdk'

type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>

/**
 * 归一化去重键：统一路径分隔符、去尾部斜杠、小写化。
 *
 * 同一目录可能以 `file:///C:/.../src` 或 `file:///C:/.../src\` 两种形式出现，
 * 不归一化会导致按 url 去重失败。
 */
function normalizeDedupeKey(key: string): string {
  let normalized = key.replace(/\\/g, '/')
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }
  return normalized.toLowerCase()
}

/**
 * 获取 FilePart 的去重键。
 *
 * 优先使用 url（普通文件和目录都有 file:// URL）；
 * url 缺失时回退到 source.path；
 * 再回退到 filename。
 * 最终对键做路径归一化，消除尾部斜杠和大小写差异。
 */
function getFilePartDedupeKey(part: Part): string | undefined {
  if (part.type !== 'file') {
    return undefined
  }

  const fp = part as MutableFilePart
  let raw: string | undefined
  if (fp.url) {
    raw = fp.url
  } else {
    raw = fp.source?.path?.trim() || fp.filename
  }

  if (!raw) {
    return undefined
  }
  return normalizeDedupeKey(raw)
}

function collectFileReferenceTexts(parts: Part[]): string[] {
  const refs = new Set<string>()

  for (const part of parts) {
    if (part.type !== 'file') {
      continue
    }

    const value = part.source?.text.value.trim()
    if (value) {
      refs.add(value)
    }
  }

  return [...refs].sort((left, right) => right.length - left.length)
}

function hasSourceText(part: Part): boolean {
  return part.type === 'file' && Boolean((part as MutableFilePart).source?.text?.value?.trim())
}

function dedupeFileParts(parts: Part[]): void {
  const keyToFirstIndex = new Map<string, number>()

  for (let i = 0; i < parts.length; i++) {
    const key = getFilePartDedupeKey(parts[i])
    if (!key) {
      continue
    }

    const existing = keyToFirstIndex.get(key)
    if (existing === undefined) {
      keyToFirstIndex.set(key, i)
      continue
    }

    const existingHasSource = hasSourceText(parts[existing])
    const currentHasSource = hasSourceText(parts[i])

    if (existingHasSource && !currentHasSource) {
      parts.splice(i, 1)
      i--
    } else if (!existingHasSource && currentHasSource) {
      parts.splice(existing, 1)
      keyToFirstIndex.set(key, i - 1)
      i--
    } else {
      parts.splice(i, 1)
      i--
    }
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeReferenceText(text: string, refs: string[]): string {
  let result = text

  for (const ref of refs) {
    result = result.replace(new RegExp(`(^|\\s)${escapeRegExp(ref)}(?=\\s|$)`, 'g'), '$1')
  }

  return result.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/g, '')
}

/**
 * 命令模式下 @file 可能同时出现在文本参数和 file part 中；
 * 同一文件也可能产生多个 file part（例如一个有 source.text 一个没有）。
 * 保留首个 file part，移除重复 file part 和重复文本引用。
 */
export function dedupeCommandFileArgumentParts(parts: Part[]): void {
  dedupeFileParts(parts)

  const refs = collectFileReferenceTexts(parts)
  if (refs.length === 0) {
    return
  }

  for (const part of parts) {
    if (part.type !== 'text') {
      continue
    }

    const textPart = part as MutableTextPart
    textPart.text = removeReferenceText(textPart.text, refs)
  }
}
