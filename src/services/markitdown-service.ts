import { randomBytes } from 'node:crypto'
import { basename, join } from 'node:path'

import { MarkitdownError } from './markitdown-errors.js'
import { loadMarkitdownSource } from './markitdown-source-loader.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from './markitdown-types.js'
import { createBinaryConverters } from './markitdown-converters-binary.js'
import { createTextConverters } from './markitdown-converters-text.js'

export interface MarkitdownInput {
  file: string
  worktree: string
  format?: SupportedFormat
}

const MARKITDOWN_OUTPUT_DIR = 'ae/markitdown'

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/**
 * 根据原始文件路径生成转换产物输出路径。
 *
 * 命名规则固化于此：`<原始文件basename>-<YYYYMMDD-HHMMSS>-<6位随机hex>.md`，
 * 输出目录固定为工作区下的 `ae/markitdown/`。
 * 保留原始完整文件名便于追溯来源，时间戳与随机串确保同一文件反复转换不冲突。
 */
export function generateMarkitdownOutputPath(worktree: string, originalFilePath: string): string {
  const originalBasename = basename(originalFilePath)
  const timestamp = formatTimestamp(new Date())
  const random = randomBytes(3).toString('hex')
  const fileName = `${originalBasename}-${timestamp}-${random}.md`
  return join(worktree, MARKITDOWN_OUTPUT_DIR, fileName)
}

export interface MarkitdownOutput {
  markdown: string
  title?: string
  format: string
  filePath: string
  fileSize: number
}

let cachedConverters: DocumentConverter[] | null = null

function getConverters(): DocumentConverter[] {
  if (cachedConverters) return cachedConverters
  cachedConverters = [...createTextConverters(), ...createBinaryConverters()]
  return cachedConverters
}

function findConverter(
  filePath: string,
  format: SupportedFormat,
  converters: DocumentConverter[],
): DocumentConverter {
  const matched = converters
    .filter((converter) => converter.accept(filePath, format))
    .sort((a, b) => b.priority - a.priority)

  const converter = matched[0]
  if (!converter) {
    throw new MarkitdownError(
      'no_converter_matched',
      `未找到匹配的转换器：格式 ${format} 没有可用的转换器。`,
    )
  }
  return converter
}

export async function convertToMarkdown(input: MarkitdownInput): Promise<MarkitdownOutput> {
  const source = await loadMarkitdownSource(input.file, input.worktree, input.format)
  const converters = getConverters()
  const converter = findConverter(source.filePath, source.format, converters)

  const converterInput: ConverterInput = {
    filePath: source.filePath,
    textContent: source.textContent,
    binaryContent: source.binaryContent,
    format: source.format,
  }

  const result: ConverterResult = await converter.convert(converterInput)

  return {
    markdown: result.markdown,
    title: result.title,
    format: source.format,
    filePath: source.realPath,
    fileSize: source.fileSize,
  }
}
