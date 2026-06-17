import { MarkitdownError } from './markitdown-errors.js'
import { loadMarkitdownSource } from './markitdown-source-loader.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from './markitdown-types.js'
import { createBinaryConverters } from './markitdown-converters-binary.js'
import { createTextConverters } from './markitdown-converters-text.js'

export interface MarkitdownInput {
  file: string
  worktree: string
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
  const source = await loadMarkitdownSource(input.file, input.worktree)
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
