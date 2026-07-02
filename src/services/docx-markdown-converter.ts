import TurndownService from 'turndown'
import { ommlToLatex } from './omml-to-latex.js'
import type { MarkdownConversionResult } from './markdown-conversion-types.js'

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function createDocxTurndownService(keepDataUris?: boolean): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })

  service.addRule('strikethrough', {
    filter: ['del', 's', 'strike'] as unknown as TurndownService.Filter,
    replacement: (content) => `~~${content}~~`,
  })

  service.addRule('truncateDataUriImages', {
    filter: 'img' as unknown as TurndownService.Filter,
    replacement: (_content: string, node: TurndownService.Node) => {
      const el = node as HTMLElement
      const alt = el.getAttribute('alt') || ''
      let src = el.getAttribute('src') || el.getAttribute('data-src') || ''
      const title = el.getAttribute('title') || ''
      const cleanAlt = alt.replace(/\n/g, ' ')
      if (!keepDataUris && src.startsWith('data:')) {
        src = src.split(',')[0] + '...'
      }
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
      return src ? `![${cleanAlt}](${src}${titlePart})` : cleanAlt
    },
  })

  return service
}

export async function convertDocxToMarkdown(
  buffer: Buffer,
  options?: { keepDataUris?: boolean },
): Promise<MarkdownConversionResult> {
  const JSZip = (await import('jszip')).default
  const mammoth = await import('mammoth')

  let processedBuffer = buffer
  try {
    const zip = await JSZip.loadAsync(buffer)
    const docFile = zip.file('word/document.xml')
    if (docFile) {
      const docXml = await docFile.async('string')
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
  }

  const result = await mammoth.convertToHtml({ buffer: processedBuffer })
  const html = result.value
  if (!html.trim()) {
    throw new Error('DOCX 转换结果为空：文档可能不包含文本内容。')
  }
  const markdown = createDocxTurndownService(options?.keepDataUris).turndown(html)
  return { markdown }
}
