import type { Part } from '@opencode-ai/sdk'

type MutableTextPart = Extract<Part, { type: 'text' }>
type MutableFilePart = Extract<Part, { type: 'file' }>

function getFilePartUrl(part: Part): string | undefined {
  if (part.type !== 'file') {
    return undefined
  }

  return (part as MutableFilePart).url
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
  const urlToFirstIndex = new Map<string, number>()

  for (let i = 0; i < parts.length; i++) {
    const url = getFilePartUrl(parts[i])
    if (!url) {
      continue
    }

    const existing = urlToFirstIndex.get(url)
    if (existing === undefined) {
      urlToFirstIndex.set(url, i)
      continue
    }

    const existingHasSource = hasSourceText(parts[existing])
    const currentHasSource = hasSourceText(parts[i])

    if (existingHasSource && !currentHasSource) {
      parts.splice(i, 1)
      i--
    } else if (!existingHasSource && currentHasSource) {
      parts.splice(existing, 1)
      urlToFirstIndex.set(url, i - 1)
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
