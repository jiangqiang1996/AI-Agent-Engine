import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { createTurndownService, type TurndownOptions } from '../turndown-config.js'
import { ommlToLatex } from './omml-converter.js'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export class DocxConverter implements DocumentConverter {
  format = 'docx' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'docx'
  }

  static async convertDocx(buffer: Buffer, options: TurndownOptions = {}): Promise<ConverterResult> {
    const JSZip = (await import('jszip')).default
    const mammoth = await import('mammoth')

    // 预处理：提取 OMML 公式并替换为 LaTeX 占位符，弥补 mammoth 不支持 OMML 的缺陷
    let processedBuffer = buffer
    try {
      const zip = await JSZip.loadAsync(buffer)
      const docFile = zip.file('word/document.xml')
      if (docFile) {
        const docXml = await docFile.async('string')
        // 替换 oMathPara（块级公式）和 oMath（行内公式）
        let modified = docXml.replace(/<m:oMathPara[\s\S]*?<\/m:oMathPara>/g, (match) => {
          const latex = ommlToLatex(match)
          return `</w:p><w:p><w:r><w:t xml:space="preserve">${escapeXml(latex)}</w:t></w:r></w:p><w:p>`
        })
        modified = modified.replace(/<m:oMath[\s>]([\s\S]*?)<\/m:oMath>/g, (match) => {
          const latex = ommlToLatex(match)
          return `<w:r><w:t xml:space="preserve">${escapeXml(latex)}</w:t></w:r>`
        })
        if (modified !== docXml) {
          zip.file('word/document.xml', modified)
          processedBuffer = await zip.generateAsync({ type: 'nodebuffer' })
        }
      }
    } catch {
      // 预处理失败时回退到原始 buffer
    }

    const result = await mammoth.convertToHtml({ buffer: processedBuffer })
    const html = result.value
    if (!html.trim()) {
      throw new MarkitdownError('docx_convert_failed', 'DOCX 转换结果为空：文档可能不包含文本内容。')
    }
    const markdown = createTurndownService(options).turndown(html)
    return { markdown }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await DocxConverter.convertDocx(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'docx_convert_failed',
        `DOCX 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
