import { promises as fs } from 'node:fs'
import path from 'node:path'

import { detectAndDecode } from './markitdown/encoding-detector.js'
import { MarkitdownError } from './markitdown-errors.js'
import { detectFormat, type MarkitdownSourceResult } from './markitdown-types.js'

const DEFAULT_MAX_LOCAL_BYTES = 100 * 1024 * 1024

function resolveMaxBytes(): number {
  const envValue = process.env.AE_MARKITDOWN_MAX_BYTES
  if (!envValue) return DEFAULT_MAX_LOCAL_BYTES
  const parsed = Number.parseInt(envValue, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_LOCAL_BYTES
  return parsed
}

function rejectWindowsSpecialPath(source: string): void {
  if (
    source.startsWith('\\\\') ||
    source.startsWith('\\\\?\\') ||
    /:[^\\/]+$/.test(source.replace(/^[a-zA-Z]:/, ''))
  ) {
    throw new MarkitdownError('path_outside_root', '路径越界：不允许 UNC、扩展长度路径或备用数据流路径。')
  }
}

export async function loadMarkitdownSource(
  file: string,
  worktree: string,
): Promise<MarkitdownSourceResult> {
  if (!file.trim()) {
    throw new MarkitdownError('input_empty', '输入为空：请提供要转换的本地文件路径。')
  }

  rejectWindowsSpecialPath(file)

  const root = await fs.realpath(worktree)
  const target = path.resolve(root, file)
  let realTarget: string
  try {
    realTarget = await fs.realpath(target)
  } catch {
    throw new MarkitdownError('path_not_found', '路径不存在：请确认文件位于当前工作区内。')
  }

  const relative = path.relative(root, realTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new MarkitdownError('path_outside_root', '路径越界：只能读取当前工作区内的文件。')
  }

  const stat = await fs.stat(realTarget)
  if (!stat.isFile()) {
    throw new MarkitdownError('path_not_file', '路径不是文件：请提供文件路径而非目录。')
  }
  const maxBytes = resolveMaxBytes()
  if (stat.size > maxBytes) {
    throw new MarkitdownError(
      'file_too_large',
      `文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB）：当前上限为 ${(maxBytes / 1024 / 1024).toFixed(0)} MB。如需转换更大文件，可设置环境变量 AE_MARKITDOWN_MAX_BYTES。`,
    )
  }

  const format = detectFormat(realTarget)
  if (!format) {
    throw new MarkitdownError(
      'unsupported_format',
      `不支持的文件格式：${path.extname(realTarget) || '无扩展名'}。支持的格式包括 HTML、CSV、TSV、JSON、XML、YAML、TXT、MD、DOCX、XLSX、PDF、IPYNB、PPTX、ZIP、JPG/PNG、RSS/Atom、EPUB、MSG。`,
    )
  }

  const binaryContent = await fs.readFile(realTarget)
  if (binaryContent.length === 0) {
    throw new MarkitdownError('file_empty', '文件为空：请提供有效的文件内容。')
  }

  const isTextFormat = ['html', 'csv', 'json', 'xml', 'yaml', 'text', 'markdown', 'ipynb'].includes(
    format,
  )
  const textContent = isTextFormat ? detectAndDecode(binaryContent) : ''

  return {
    filePath: realTarget,
    textContent,
    binaryContent,
    format,
    realPath: realTarget,
    fileSize: stat.size,
  }
}
