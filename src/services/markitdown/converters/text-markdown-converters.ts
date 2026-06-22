import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'

export class TextConverter implements DocumentConverter {
  format = 'text' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'text'
  }

  static convertText(text: string): ConverterResult {
    return { markdown: text }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return TextConverter.convertText(input.textContent)
  }
}

export class MarkdownConverter implements DocumentConverter {
  format = 'markdown' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'markdown'
  }

  static convertMarkdown(text: string): ConverterResult {
    return { markdown: text }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return MarkdownConverter.convertMarkdown(input.textContent)
  }
}
