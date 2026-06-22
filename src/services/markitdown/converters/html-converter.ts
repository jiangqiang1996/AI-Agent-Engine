import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { turndownService } from '../turndown-config.js'

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return undefined
  const title = match[1].trim()
  return title || undefined
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

function stripScriptAndStyle(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
}

function stripUiElements(html: string): string {
  let result = html
  result = result.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '')
  result = result.replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '')
  result = result.replace(/<select\b[^>]*>[\s\S]*?<\/select>/gi, '')
  result = result.replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '')
  result = result.replace(/<label\b[^>]*>[\s\S]*?<\/label>/gi, '')
  result = result.replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, '')
  result = result.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '')
  result = result.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '')
  result = result.replace(/<div\b[^>]*class="[^"]*(?:vector-dropdown|mw-jump-link|vector-menu|vector-pinnable-header|sidebar|navbox|mw-navigation|user-links|vector-page-titlebar)[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  return result
}

function stripNonContentAttributes(html: string): string {
  let result = html
  result = result.replace(/\s+title="[^"]*"/gi, '')
  result = result.replace(/\s+title='[^']*'/gi, '')
  result = result.replace(/\s+aria-label="[^"]*"/gi, '')
  result = result.replace(/\s+aria-label='[^']*'/gi, '')
  result = result.replace(/\s+aria-labelledby="[^"]*"/gi, '')
  result = result.replace(/\s+aria-labelledby='[^']*'/gi, '')
  result = result.replace(/\s+role="[^"]*"/gi, '')
  result = result.replace(/\s+role='[^']*'/gi, '')
  result = result.replace(/\s+data-event-name="[^"]*"/gi, '')
  result = result.replace(/\s+data-event-name='[^']*'/gi, '')
  return result
}

function decodeBingTrackingUrl(href: string): string {
  const normalized = href.replace(/&amp;/g, '&')
  const match = normalized.match(/[?&]u=a1([A-Za-z0-9+/=]+)/)
  if (!match) return href
  try {
    const base64 = match[1]
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const decoded = Buffer.from(padded, 'base64').toString('utf-8')
    if (decoded.startsWith('http')) return decoded
    if (decoded.startsWith('/')) return 'https://www.bing.com' + decoded
    if (decoded.startsWith('javascript:')) return '#'
  } catch {
    return href
  }
  return href
}

function unwrapBingTrackingUrls(html: string): string {
  return html.replace(/href="(https:\/\/www\.bing\.com\/ck\/a\?[^"]*)"/gi, (_match, url) => {
    const decoded = decodeBingTrackingUrl(url)
    return `href="${decoded}"`
  })
}

export class HtmlConverter implements DocumentConverter {
  format = 'html' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'html'
  }

  static convertHtml(html: string): ConverterResult {
    const noComments = stripHtmlComments(html)
    const noScript = stripScriptAndStyle(noComments)
    const noUi = stripUiElements(noScript)
    const noAttrs = stripNonContentAttributes(noUi)
    const cleaned = unwrapBingTrackingUrls(noAttrs)
    const title = extractHtmlTitle(cleaned)
    const markdown = turndownService.turndown(cleaned).trim()
    return { markdown, title }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return HtmlConverter.convertHtml(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'html_convert_failed',
        `HTML 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
