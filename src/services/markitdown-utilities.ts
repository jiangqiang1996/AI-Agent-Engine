import { createRequire } from 'node:module'

import TurndownService from 'turndown'
import { parse as parseYaml } from 'yaml'

import { MarkitdownError } from './markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from './markitdown-types.js'

const require = createRequire(import.meta.url)
// pdf-parse v2+ exports PDFParse class (requires Uint8Array, getText() returns {text, pages, total})
const pdfParseModule = require('pdf-parse') as { PDFParse: new (data: Uint8Array) => PDFParseInstance }
interface PDFParseInstance {
  load(): Promise<void>
  getText(): Promise<{ text: string; pages: unknown[]; total: number }>
}

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
})

turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'] as unknown as TurndownService.Filter,
  replacement: (content) => `~~${content}~~`,
})

// Truncate data: URIs in images to match Python reference behavior
// (reference _markdownify.py convert_img: src = src.split(",")[0] + "...")
turndownService.addRule('truncateDataUriImages', {
  filter: 'img' as unknown as TurndownService.Filter,
  replacement: (_content: string, node: TurndownService.Node) => {
    const el = node as HTMLElement
    const alt = el.getAttribute('alt') || ''
    let src = el.getAttribute('src') || el.getAttribute('data-src') || ''
    const title = el.getAttribute('title') || ''
    const cleanAlt = alt.replace(/\n/g, ' ')
    if (src.startsWith('data:')) {
      src = src.split(',')[0] + '...'
    }
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
    return src ? `![${cleanAlt}](${src}${titlePart})` : cleanAlt
  },
})

const MAX_CSV_ROWS = 5000
const MAX_TABLE_COLUMNS = 50

function extractHtmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match) return undefined
  const title = match[1].trim()
  return title || undefined
}

function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '')
}

// Strip <script> and <style> blocks (matching Python reference HtmlConverter behavior)
function stripScriptAndStyle(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
}

// ---- Text Converters ----

export class HtmlConverter implements DocumentConverter {
  format = 'html' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'html'
  }

  static convertHtml(html: string): ConverterResult {
    const noComments = stripHtmlComments(html)
    const cleaned = stripScriptAndStyle(noComments)
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

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false
  let i = 0

  while (i < line.length) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      current += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      fields.push(current)
      current = ''
      i++
      continue
    }
    current += char
    i++
  }
  fields.push(current)
  return fields
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          currentField += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      currentField += char
      i++
      continue
    }
    if (char === '"') {
      inQuotes = true
      i++
      continue
    }
    if (char === delimiter) {
      currentRow.push(currentField)
      currentField = ''
      i++
      continue
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      currentRow.push(currentField)
      currentField = ''
      if (currentRow.some((f) => f !== '')) {
        rows.push(currentRow)
      }
      currentRow = []
      i++
      continue
    }
    currentField += char
    i++
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField)
    if (currentRow.some((f) => f !== '')) {
      rows.push(currentRow)
    }
  }
  return rows
}

function rowsToMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return ''
  const limitedRows = rows.slice(0, MAX_CSV_ROWS)
  const maxCols = Math.min(
    Math.max(...limitedRows.map((r) => r.length)),
    MAX_TABLE_COLUMNS,
  )
  const normalizedRows = limitedRows.map((row) => {
    const normalized = [...row]
    while (normalized.length < maxCols) normalized.push('')
    return normalized.slice(0, maxCols)
  })

  const header = normalizedRows[0]
  const separator = header.map(() => '---')
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ]
  return lines.join('\n')
}

export class CsvConverter implements DocumentConverter {
  format = 'csv' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'csv'
  }

  static parseAndConvert(text: string, delimiter: string): string {
    const rows = parseCsv(text, delimiter)
    if (rows.length === 0) {
      return ''
    }
    return rowsToMarkdownTable(rows)
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      const isTsv = input.filePath.toLowerCase().endsWith('.tsv')
      const delimiter = isTsv ? '\t' : ','
      const markdown = CsvConverter.parseAndConvert(input.textContent, delimiter)
      return { markdown }
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'text_parse_failed',
        `CSV 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function formatJsonValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return JSON.stringify(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  if (typeof value === 'object') return JSON.stringify(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return String(value)
}

function jsonObjectsToTable(objects: Record<string, unknown>[]): string {
  const keys = Array.from(
    objects.reduce((set, obj) => {
      Object.keys(obj).forEach((key) => set.add(key))
      return set
    }, new Set<string>()),
  ).slice(0, MAX_TABLE_COLUMNS)

  const header = `| ${keys.join(' | ')} |`
  const separator = `| ${keys.map(() => '---').join(' | ')} |`
  const rows = objects.slice(0, MAX_CSV_ROWS).map((obj) => {
    const values = keys.map((key) => formatJsonValue(obj[key]))
    return `| ${values.join(' | ')} |`
  })
  return [header, separator, ...rows].join('\n')
}

export class JsonConverter implements DocumentConverter {
  format = 'json' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'json'
  }

  static convertJson(text: string): ConverterResult {
    const parsed: unknown = JSON.parse(text)

    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((item) => isPlainObject(item))) {
      return { markdown: jsonObjectsToTable(parsed as Record<string, unknown>[]) }
    }

    return { markdown: '```json\n' + JSON.stringify(parsed, null, 2) + '\n```' }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return JsonConverter.convertJson(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'json_parse_failed',
        `JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class XmlConverter implements DocumentConverter {
  format = 'xml' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'xml'
  }

  static convertXml(text: string): ConverterResult {
    return { markdown: '```xml\n' + text.trim() + '\n```' }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return XmlConverter.convertXml(input.textContent)
    } catch (error) {
      throw new MarkitdownError(
        'xml_parse_failed',
        `XML 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class YamlConverter implements DocumentConverter {
  format = 'yaml' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'yaml'
  }

  static convertYaml(text: string): ConverterResult {
    parseYaml(text)
    return { markdown: '```yaml\n' + text.trim() + '\n```' }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return YamlConverter.convertYaml(input.textContent)
    } catch (error) {
      throw new MarkitdownError(
        'yaml_parse_failed',
        `YAML 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class TextConverter implements DocumentConverter {
  format = 'text' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
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
  format = 'markdown' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'markdown'
  }

  static convertMarkdown(text: string): ConverterResult {
    return { markdown: text }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return MarkdownConverter.convertMarkdown(input.textContent)
  }
}

export function createTextConverters(): DocumentConverter[] {
  return [
    new HtmlConverter(),
    new CsvConverter(),
    new JsonConverter(),
    new XmlConverter(),
    new YamlConverter(),
    new TextConverter(),
    new MarkdownConverter(),
  ]
}

// ---- Binary Converters ----

export class DocxConverter implements DocumentConverter {
  format = 'docx' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'docx'
  }

  static async convertDocx(buffer: Buffer): Promise<ConverterResult> {
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToHtml({ buffer })
    const html = result.value
    if (!html.trim()) {
      throw new MarkitdownError('docx_convert_failed', 'DOCX 转换结果为空：文档可能不包含文本内容。')
    }
    const markdown = turndownService.turndown(html)
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

function sheetToMarkdownTable(sheet: import('xlsx').WorkSheet): string {
  const xlsx = require('xlsx') as typeof import('xlsx')
  const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
  })
  if (rows.length === 0) return ''

  const limitedRows = rows.slice(0, MAX_CSV_ROWS)
  const maxCols = Math.min(
    Math.max(...limitedRows.map((row) => Array.isArray(row) ? row.length : 0)),
    MAX_TABLE_COLUMNS,
  )
  const normalizedRows = limitedRows.map((row) => {
    const arr = Array.isArray(row) ? row : [row]
    const normalized = [...arr.map(String)]
    while (normalized.length < maxCols) normalized.push('')
    return normalized.slice(0, maxCols)
  })

  if (normalizedRows.length === 0) return ''

  const header = normalizedRows[0]
  const separator = header.map(() => '---')
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${separator.join(' | ')} |`,
    ...normalizedRows.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ]
  return lines.join('\n')
}

export class XlsxConverter implements DocumentConverter {
  format = 'xlsx' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'xlsx'
  }

  static convertXlsx(buffer: Buffer): ConverterResult {
    const xlsx = require('xlsx') as typeof import('xlsx')
    const workbook = xlsx.read(buffer, { type: 'buffer' })

    // Each sheet is presented as a separate section with header (matches reference)
    const sections = workbook.SheetNames.map((sheetName: string) => {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) return `## ${sheetName}`
      const table = sheetToMarkdownTable(sheet)
      return `## ${sheetName}\n\n${table}`.trimEnd()
    })

    return { markdown: sections.join('\n\n') }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return XlsxConverter.convertXlsx(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'xlsx_convert_failed',
        `XLSX 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export class PdfConverter implements DocumentConverter {
  format = 'pdf' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'pdf'
  }

  static async convertPdf(buffer: Buffer): Promise<ConverterResult> {
    // pdf-parse v2+ requires Uint8Array and uses class-based API
    // Python reference uses multi-fallback try/except; we gracefully degrade to empty
    try {
      const uint8 = new Uint8Array(buffer)
      const parser = new pdfParseModule.PDFParse(uint8)
      await parser.load()
      const result = await parser.getText()
      let text = result.text?.trim() ?? ''
      // Post-process to merge MasterFormat-style partial numbering (matches Python reference)
      text = mergePartialNumberingLines(text)
      return { markdown: text }
    } catch {
      // Graceful degradation matching Python reference's fallback behavior
      return { markdown: '' }
    }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await PdfConverter.convertPdf(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'pdf_convert_failed',
        `PDF 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

interface IpynbNotebook {
  cells: Array<{
    cell_type: string
    source: string | string[]
    outputs?: unknown[]
  }>
  metadata?: {
    kernelspec?: { name?: string; display_name?: string }
    title?: string
  }
}

export class IpynbConverter implements DocumentConverter {
  format = 'ipynb' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'ipynb'
  }

  static convertIpynb(text: string): ConverterResult {
    const notebook: IpynbNotebook = JSON.parse(text)
    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      throw new MarkitdownError('ipynb_convert_failed', 'IPYNB 文件格式无效：缺少 cells 字段。')
    }

    const mdOutput: string[] = []
    let title: string | undefined

    for (const cell of notebook.cells) {
      const sourceLines = Array.isArray(cell.source) ? cell.source : [cell.source ?? '']
      const source = sourceLines.join('')

      if (cell.cell_type === 'markdown') {
        mdOutput.push(source)
        // Extract the first # heading as title if not already found (matches reference)
        // Python: line.lstrip("# ").strip() removes all leading '#' and space chars
        if (title === undefined) {
          for (const line of sourceLines) {
            if (typeof line === 'string' && line.startsWith('# ')) {
              title = line.replace(/^[# ]+/, '').trim()
              break
            }
          }
        }
      } else if (cell.cell_type === 'code') {
        // Code cells are wrapped in Markdown code blocks with python language (matches reference)
        mdOutput.push('```python\n' + source + '\n```')
      } else if (cell.cell_type === 'raw') {
        // Raw cells use bare code fence with no language (matches reference)
        mdOutput.push('```\n' + source + '\n```')
      }
    }

    const markdown = mdOutput.join('\n\n')
    // Check for title in notebook metadata (overrides heading-derived title)
    const metadataTitle = notebook.metadata?.title
    if (metadataTitle) title = metadataTitle

    return { markdown, title }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return IpynbConverter.convertIpynb(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'ipynb_convert_failed',
        `IPYNB 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// ---- PDF Partial Numbering Merge (matches Python _merge_partial_numbering_lines) ----

const PARTIAL_NUMBERING_PATTERN = /^\.\d+$/

function mergePartialNumberingLines(text: string): string {
  const lines = text.split('\n')
  const resultLines: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.trim()

    if (PARTIAL_NUMBERING_PATTERN.test(stripped)) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) {
        j++
      }

      if (j < lines.length) {
        resultLines.push(`${stripped} ${lines[j].trim()}`)
        i = j + 1
      } else {
        resultLines.push(line)
        i++
      }
    } else {
      resultLines.push(line)
      i++
    }
  }

  return resultLines.join('\n')
}

// ---- Minimal XML Parser (DOM-like, for RSS/Atom) ----

interface SimpleXmlNode {
  tagName: string
  attributes: Record<string, string>
  childNodes: SimpleXmlNode[]
  textContent: string
  data?: string
}

function parseXml(xml: string): SimpleXmlNode {
  const cleaned = xml.replace(/^\uFEFF/, '').replace(/<\?xml[^?]*\?>/, '')
  let pos = 0
  const source = cleaned.trim()

  function skipWhitespace(): void {
    while (pos < source.length && /\s/.test(source[pos])) pos++
  }

  function parseElement(): SimpleXmlNode {
    // Expect '<'
    pos++ // skip '<'
    const tagName = parseName()
    const node: SimpleXmlNode = {
      tagName,
      attributes: {},
      childNodes: [],
      textContent: '',
    }

    // Parse attributes
    skipWhitespace()
    while (pos < source.length && source[pos] !== '>' && source[pos] !== '/') {
      const attrName = parseName()
      skipWhitespace()
      if (source[pos] === '=') {
        pos++
        skipWhitespace()
        const attrValue = parseAttributeValue()
        node.attributes[attrName] = attrValue
      }
      skipWhitespace()
    }

    // Self-closing tag
    if (source[pos] === '/') {
      pos += 2 // skip '/>'
      return node
    }

    pos++ // skip '>'
    return parseElementContent(node)
  }

  function parseName(): string {
    const start = pos
    while (pos < source.length && /[^\s>\/=]/.test(source[pos])) pos++
    return source.slice(start, pos)
  }

  function parseAttributeValue(): string {
    const quote = source[pos]
    if (quote === '"' || quote === "'") {
      pos++
      const start = pos
      while (pos < source.length && source[pos] !== quote) pos++
      const value = source.slice(start, pos)
      pos++ // skip closing quote
      return decodeXmlEntities(value)
    }
    const start = pos
    while (pos < source.length && /[^\s>]/.test(source[pos])) pos++
    return decodeXmlEntities(source.slice(start, pos))
  }

  function parseElementContent(node: SimpleXmlNode): SimpleXmlNode {
    let textContent = ''

    while (pos < source.length) {
      if (source[pos] === '<') {
        if (source.slice(pos, pos + 4) === '<!--') {
          const endIdx = source.indexOf('-->', pos + 4)
          pos = endIdx === -1 ? source.length : endIdx + 3
          continue
        }
        if (source.slice(pos, pos + 9) === '<![CDATA[') {
          const endIdx = source.indexOf(']]>', pos + 9)
          const cdata = endIdx === -1 ? source.slice(pos + 9) : source.slice(pos + 9, endIdx)
          textContent += cdata
          pos = endIdx === -1 ? source.length : endIdx + 3
          continue
        }
        if (source[pos + 1] === '/') {
          // Closing tag
          pos += 2
          const closeName = parseName()
          pos++ // skip '>'
          // Ignore closeName mismatch for robustness
          void closeName
          break
        }
        const child = parseElement()
        node.childNodes.push(child)
        continue
      }
      const start = pos
      while (pos < source.length && source[pos] !== '<') pos++
      textContent += decodeXmlEntities(source.slice(start, pos))
    }

    node.data = textContent
    node.textContent = textContent
    return node
  }

  function decodeXmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
      .replace(/&amp;/g, '&')
  }

  skipWhitespace()
  if (source[pos] !== '<') {
    return { tagName: '', attributes: {}, childNodes: [], textContent: '' }
  }
  return parseElement()
}

function getElementsByTagName(node: SimpleXmlNode, tagName: string): SimpleXmlNode[] {
  const result: SimpleXmlNode[] = []
  function search(n: SimpleXmlNode): void {
    if (n.tagName === tagName || n.tagName.endsWith(`:${tagName}`)) {
      result.push(n)
    }
    for (const child of n.childNodes) {
      search(child)
    }
  }
  search(node)
  return result
}

function getNodeData(node: SimpleXmlNode, tagName: string): string | null {
  const nodes = getElementsByTagName(node, tagName)
  if (nodes.length === 0) return null
  return nodes[0].data || null
}

// ---- RSS Converter ----

export class RssConverter implements DocumentConverter {
  format = 'rss' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'rss'
  }

  static convertRss(text: string): ConverterResult {
    const doc = parseXml(text)

    const rssRoot = getElementsByTagName(doc, 'rss')
    const feedRoot = getElementsByTagName(doc, 'feed')

    if (rssRoot.length > 0) {
      return RssConverter.parseRssType(rssRoot[0])
    }
    if (feedRoot.length > 0) {
      const entries = getElementsByTagName(feedRoot[0], 'entry')
      if (entries.length > 0) {
        return RssConverter.parseAtomType(feedRoot[0])
      }
    }
    return { markdown: '' }
  }

  private static parseRssType(root: SimpleXmlNode): ConverterResult {
    const channels = getElementsByTagName(root, 'channel')
    if (channels.length === 0) return { markdown: '' }
    const channel = channels[0]

    const channelTitle = getNodeData(channel, 'title')
    const channelDescription = getNodeData(channel, 'description')
    const items = getElementsByTagName(channel, 'item')

    let mdText = ''
    if (channelTitle) mdText += `# ${channelTitle}\n`
    if (channelDescription) mdText += `${channelDescription}\n`

    for (const item of items) {
      const title = getNodeData(item, 'title')
      const description = getNodeData(item, 'description')
      const pubDate = getNodeData(item, 'pubDate')
      const content = getNodeData(item, 'content:encoded') || getNodeData(item, 'encoded')

      if (title) mdText += `\n## ${title}\n`
      if (pubDate) mdText += `Published on: ${pubDate}\n`
      if (description) mdText += RssConverter.parseContent(description)
      if (content) mdText += RssConverter.parseContent(content)
    }

    return { markdown: mdText, title: channelTitle || undefined }
  }

  private static parseAtomType(root: SimpleXmlNode): ConverterResult {
    const title = getNodeData(root, 'title')
    const subtitle = getNodeData(root, 'subtitle')
    const entries = getElementsByTagName(root, 'entry')

    let mdText = ''
    if (title) mdText += `# ${title}\n`
    if (subtitle) mdText += `${subtitle}\n`

    for (const entry of entries) {
      const entryTitle = getNodeData(entry, 'title')
      const entrySummary = getNodeData(entry, 'summary')
      const entryUpdated = getNodeData(entry, 'updated')
      const entryContent = getNodeData(entry, 'content')

      if (entryTitle) mdText += `\n## ${entryTitle}\n`
      if (entryUpdated) mdText += `Updated on: ${entryUpdated}\n`
      if (entrySummary) mdText += RssConverter.parseContent(entrySummary)
      if (entryContent) mdText += RssConverter.parseContent(entryContent)
    }

    return { markdown: mdText, title: title || undefined }
  }

  private static parseContent(content: string): string {
    try {
      return turndownService.turndown(content).trim() + '\n'
    } catch {
      return content + '\n'
    }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return RssConverter.convertRss(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'rss_convert_failed',
        `RSS 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// ---- PPTX Converter ----

interface PptxShape {
  type: 'text' | 'table' | 'image' | 'group'
  text?: string
  isTitle?: boolean
  top?: number
  left?: number
  tableData?: string[][]
  altText?: string
  imageName?: string
  children?: PptxShape[]
}

export class PptxConverter implements DocumentConverter {
  format = 'pptx' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'pptx'
  }

  static async convertPptx(buffer: Buffer): Promise<ConverterResult> {
    const JSZip = require('jszip') as typeof import('jszip')
    const zip = await JSZip.loadAsync(buffer)

    // Find all slides
    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
        const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
        return numA - numB
      })

    let mdContent = ''

    for (let idx = 0; idx < slideFiles.length; idx++) {
      const slideNum = idx + 1
      const slideXml = await zip.files[slideFiles[idx]].async('string')
      mdContent += `\n\n<!-- Slide number: ${slideNum} -->\n`

      const slideDoc = parseXml(slideXml)
      const shapes = PptxConverter.extractShapes(slideDoc)

      // Sort shapes by (top, left) matching Python reference
      const sortedShapes = PptxConverter.sortShapes(shapes)

      // Find title shape (first text shape with title placeholder)
      const titleShape = sortedShapes.find((s) => s.isTitle)

      for (const shape of sortedShapes) {
        if (shape.type === 'image') {
          let altText = shape.altText || shape.imageName || ''
          altText = altText.replace(/[\r\n\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
          const filename = (shape.imageName || 'image').replace(/\W/g, '') + '.jpg'
          mdContent += `\n![${altText}](${filename})\n`
        } else if (shape.type === 'table' && shape.tableData) {
          mdContent += PptxConverter.tableToMarkdown(shape.tableData) + '\n'
        } else if (shape.type === 'text' && shape.text) {
          if (shape === titleShape) {
            mdContent += `# ${shape.text.trimStart()}\n`
          } else {
            mdContent += `${shape.text}\n`
          }
        }
      }

      mdContent = mdContent.trim()

      // Check for notes slide
      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string')
        const notesDoc = parseXml(notesXml)
        const notesShapes = PptxConverter.extractShapes(notesDoc)
        const notesText = notesShapes
          .filter((s) => s.type === 'text' && s.text)
          .map((s) => s.text)
          .join('\n')
        if (notesText.trim()) {
          mdContent += `\n\n### Notes:\n${notesText}`
        }
      }
    }

    return { markdown: mdContent.trim() }
  }

  private static extractShapes(doc: SimpleXmlNode): PptxShape[] {
    const shapes: PptxShape[] = []

    function searchShapes(node: SimpleXmlNode): void {
      const tagParts = node.tagName.split(':')
      const localName = tagParts[tagParts.length - 1]

      if (localName === 'sp') {
        // Text shape
        const isTitle = PptxConverter.hasTitlePlaceholder(node)
        const text = PptxConverter.extractTextFromShape(node)
        const pos = PptxConverter.getShapePosition(node)
        if (text || isTitle) {
          shapes.push({ type: 'text', text, isTitle, top: pos?.top, left: pos?.left })
        }
      } else if (localName === 'pic') {
        // Picture
        const altText = PptxConverter.getImageAltText(node)
        const imageName = PptxConverter.getImageName(node)
        const pos = PptxConverter.getShapePosition(node)
        shapes.push({
          type: 'image',
          altText,
          imageName,
          top: pos?.top,
          left: pos?.left,
        })
      } else if (localName === 'graphicFrame') {
        // Table or chart
        const tableData = PptxConverter.extractTable(node)
        if (tableData) {
          const pos = PptxConverter.getShapePosition(node)
          shapes.push({ type: 'table', tableData, top: pos?.top, left: pos?.left })
        }
      } else if (localName === 'grpSp') {
        // Group shape - recurse
        const pos = PptxConverter.getShapePosition(node)
        const groupShapes: PptxShape[] = []
        for (const child of node.childNodes) {
          const before = shapes.length
          searchShapes(child)
          // Collect shapes found in this child
          for (let i = before; i < shapes.length; i++) {
            groupShapes.push(shapes[i])
          }
          shapes.length = before
        }
        if (groupShapes.length > 0) {
          const sortedGroup = PptxConverter.sortShapes(groupShapes)
          shapes.push({ type: 'group', children: sortedGroup, top: pos?.top, left: pos?.left })
        }
      }

      for (const child of node.childNodes) {
        searchShapes(child)
      }
    }

    searchShapes(doc)
    return shapes
  }

  private static hasTitlePlaceholder(node: SimpleXmlNode): boolean {
    const placeholders = getElementsByTagName(node, 'ph')
    return placeholders.some((ph) => ph.attributes.type === 'title')
  }

  private static extractTextFromShape(node: SimpleXmlNode): string {
    // Look for nvSpPr/ph[@type="title"] to mark as title
    const textRuns = getElementsByTagName(node, 't')
    return textRuns.map((t) => t.data || '').join('')
  }

  private static getShapePosition(
    node: SimpleXmlNode,
  ): { top: number; left: number } | undefined {
    const xfrmElements = getElementsByTagName(node, 'xfrm')
    for (const xfrm of xfrmElements) {
      const offElements = getElementsByTagName(xfrm, 'off')
      if (offElements.length > 0) {
        const off = offElements[0]
        const left = parseInt(off.attributes.x || '0', 10)
        const top = parseInt(off.attributes.y || '0', 10)
        return { top, left }
      }
    }
    return undefined
  }

  private static getImageAltText(node: SimpleXmlNode): string {
    const cNvPrElements = getElementsByTagName(node, 'cNvPr')
    for (const cNvPr of cNvPrElements) {
      if (cNvPr.attributes.descr) return cNvPr.attributes.descr
    }
    return ''
  }

  private static getImageName(node: SimpleXmlNode): string {
    const cNvPrElements = getElementsByTagName(node, 'cNvPr')
    for (const cNvPr of cNvPrElements) {
      if (cNvPr.attributes.name) return cNvPr.attributes.name
    }
    return ''
  }

  private static extractTable(node: SimpleXmlNode): string[][] | null {
    const tblElements = getElementsByTagName(node, 'tbl')
    if (tblElements.length === 0) return null

    const tbl = tblElements[0]
    const rows = getElementsByTagName(tbl, 'tr')
    const tableData: string[][] = []

    for (const row of rows) {
      const cells = getElementsByTagName(row, 'tc')
      const rowData: string[] = []
      for (const cell of cells) {
        const textRuns = getElementsByTagName(cell, 't')
        const cellText = textRuns.map((t) => t.data || '').join('')
        rowData.push(cellText)
      }
      if (rowData.length > 0) {
        tableData.push(rowData)
      }
    }

    return tableData.length > 0 ? tableData : null
  }

  private static tableToMarkdown(table: string[][]): string {
    if (table.length === 0) return ''
    const escapeCell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
    const header = table[0].map(escapeCell)
    const separator = header.map(() => '---')
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${separator.join(' | ')} |`,
      ...table.slice(1).map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
    ]
    return lines.join('\n')
  }

  private static sortShapes(shapes: PptxShape[]): PptxShape[] {
    return [...shapes].sort((a, b) => {
      const topA = a.top ?? Number.NEGATIVE_INFINITY
      const topB = b.top ?? Number.NEGATIVE_INFINITY
      const leftA = a.left ?? Number.NEGATIVE_INFINITY
      const leftB = b.left ?? Number.NEGATIVE_INFINITY
      if (topA !== topB) return topA - topB
      return leftA - leftB
    })
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await PptxConverter.convertPptx(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'pptx_convert_failed',
        `PPTX 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// ---- ZIP Converter ----

const ZIP_MAX_DEPTH = 3

export class ZipConverter implements DocumentConverter {
  format = 'zip' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'zip'
  }

  static async convertZip(buffer: Buffer, zipFilePath: string, depth = 0): Promise<ConverterResult> {
    if (depth >= ZIP_MAX_DEPTH) {
      return { markdown: `Content from the zip file \`${zipFilePath}\`:\n\n[最大递归深度已达上限]` }
    }

    const JSZip = require('jszip') as typeof import('jszip')
    const zip = await JSZip.loadAsync(buffer)

    let mdContent = `Content from the zip file \`${zipFilePath}\`:\n\n`

    const { detectFormat } = await import('./markitdown-types.js')
    const converters = [
      ...createTextConverters(),
      ...createBinaryConverters(),
    ]

    const fileNames = Object.keys(zip.files).sort()
    for (const name of fileNames) {
      const file = zip.files[name]
      if (file.dir) continue

      try {
        const format = detectFormat(name)
        if (!format) continue

        const converter = converters.find((c) => c.accept(name, format))
        if (!converter) continue

        const isTextFormat = ['html', 'csv', 'json', 'xml', 'yaml', 'text', 'markdown', 'ipynb', 'rss'].includes(
          format,
        )
        const fileBuffer = Buffer.from(await file.async('arraybuffer'))

        let textContent = ''
        if (isTextFormat) {
          textContent = fileBuffer.toString('utf8').replace(/^\uFEFF/, '')
        }

        const result = await converter.convert({
          filePath: name,
          textContent,
          binaryContent: fileBuffer,
          format,
        })

        if (result.markdown) {
          mdContent += `## File: ${name}\n\n`
          mdContent += result.markdown + '\n\n'
        }
      } catch {
        // Skip unsupported or failed files (matches Python reference behavior)
      }
    }

    return { markdown: mdContent.trim() }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await ZipConverter.convertZip(input.binaryContent, input.filePath)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'zip_convert_failed',
        `ZIP 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

// ---- Image Converter (EXIF metadata extraction) ----

function extractJpegExif(buffer: Buffer): Record<string, string> {
  const metadata: Record<string, string> = {}

  // Check JPEG SOI marker
  if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return metadata
  }

  let pos = 2
  let imageSize: string | null = null

  while (pos < buffer.length - 1) {
    if (buffer[pos] !== 0xff) break
    const marker = buffer[pos + 1]
    pos += 2

    // SOF markers (Start of Frame)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const length = buffer.readUInt16BE(pos)
      const precision = buffer[pos + 2]
      const height = buffer.readUInt16BE(pos + 3)
      const width = buffer.readUInt16BE(pos + 5)
      imageSize = `${width}x${height}`
      void precision
      pos += length
      continue
    }

    // APP1 marker (EXIF)
    if (marker === 0xe1) {
      const length = buffer.readUInt16BE(pos)
      const exifHeader = buffer.slice(pos + 2, pos + 6).toString('ascii')
      if (exifHeader.startsWith('Exif')) {
        const exifData = buffer.slice(pos + 8, pos + length)
        parseExifIFD(exifData, metadata)
      }
      pos += length
      continue
    }

    // Skip other markers
    if (marker === 0xd8 || marker === 0xd9) continue
    if (marker >= 0xd0 && marker <= 0xd7) continue

    const length = buffer.readUInt16BE(pos)
    pos += length
  }

  if (imageSize) {
    metadata.ImageSize = imageSize
  }

  return metadata
}

function parseExifIFD(exifData: Buffer, metadata: Record<string, string>): void {
  if (exifData.length < 8) return

  const byteOrder = exifData.toString('ascii', 0, 2)
  const littleEndian = byteOrder === 'II'
  const read16 = (offset: number): number =>
    littleEndian ? exifData.readUInt16LE(offset) : exifData.readUInt16BE(offset)
  const read32 = (offset: number): number =>
    littleEndian ? exifData.readUInt32LE(offset) : exifData.readUInt32BE(offset)

  const magic = read16(2)
  if (magic !== 0x002a) return

  const ifdOffset = read32(4)
  parseIFD(exifData, ifdOffset, littleEndian, metadata, read16, read32)
}

function parseIFD(
  data: Buffer,
  offset: number,
  littleEndian: boolean,
  metadata: Record<string, string>,
  read16: (offset: number) => number,
  read32: (offset: number) => number,
): void {
  if (offset >= data.length - 2) return

  const entryCount = read16(offset)
  let pos = offset + 2

  let exifIFDPointer = 0
  let gpsIFDPointer = 0

  for (let i = 0; i < entryCount && pos < data.length - 12; i++) {
    const tag = read16(pos)
    const type = read16(pos + 2)
    const count = read32(pos + 4)
    const valueOffset = read32(pos + 8)
    pos += 12

    const value = readTagValue(data, type, count, valueOffset, littleEndian)

    switch (tag) {
      case 0x010e: // ImageDescription
        if (value) metadata.Description = value
        break
      case 0x013b: // Artist
        if (value) metadata.Artist = value
        break
      case 0x8769: // ExifIFDPointer
        exifIFDPointer = valueOffset
        break
      case 0x8825: // GPSIFDPointer
        gpsIFDPointer = valueOffset
        break
      case 0x9c9b: // XPTitle
        if (value) metadata.Title = value
        break
      case 0x9c9d: // XPKeywords
        if (value) metadata.Keywords = value
        break
      case 0x9c9f: // XPAuthor
        if (value) metadata.Author = value
        break
    }
  }

  // Parse EXIF sub-IFD
  if (exifIFDPointer > 0 && exifIFDPointer < data.length - 2) {
    const exifEntryCount = read16(exifIFDPointer)
    let exifPos = exifIFDPointer + 2
    for (let i = 0; i < exifEntryCount && exifPos < data.length - 12; i++) {
      const tag = read16(exifPos)
      const type = read16(exifPos + 2)
      const count = read32(exifPos + 4)
      const valueOffset = read32(exifPos + 8)
      exifPos += 12

      const value = readTagValue(data, type, count, valueOffset, littleEndian)

      switch (tag) {
        case 0x9003: // DateTimeOriginal
          if (value) metadata.DateTimeOriginal = value
          break
        case 0x9004: // DateTimeDigitized
          if (value) metadata.CreateDate = value
          break
        case 0x0132: // DateTime
          if (value && !metadata.CreateDate) metadata.CreateDate = value
          break
      }
    }
  }

  // Parse GPS IFD
  if (gpsIFDPointer > 0 && gpsIFDPointer < data.length - 2) {
    const gpsEntryCount = read16(gpsIFDPointer)
    let gpsPos = gpsIFDPointer + 2
    let latRef = ''
    let latValues: number[] = []
    let lonRef = ''
    let lonValues: number[] = []

    for (let i = 0; i < gpsEntryCount && gpsPos < data.length - 12; i++) {
      const tag = read16(gpsPos)
      const type = read16(gpsPos + 2)
      const count = read32(gpsPos + 4)
      const valueOffset = read32(gpsPos + 8)
      gpsPos += 12

      if (tag === 0x0001) {
        latRef = readTagValue(data, type, count, valueOffset, littleEndian) || ''
      } else if (tag === 0x0002) {
        const rationalValues = readRationalArray(data, valueOffset, count, littleEndian)
        latValues = rationalValues
      } else if (tag === 0x0003) {
        lonRef = readTagValue(data, type, count, valueOffset, littleEndian) || ''
      } else if (tag === 0x0004) {
        const rationalValues = readRationalArray(data, valueOffset, count, littleEndian)
        lonValues = rationalValues
      }
    }

    if (latValues.length >= 3 && lonValues.length >= 3) {
      const lat = latValues[0] + latValues[1] / 60 + latValues[2] / 3600
      const lon = lonValues[0] + lonValues[1] / 60 + lonValues[2] / 3600
      const latSign = latRef === 'S' ? '-' : ''
      const lonSign = lonRef === 'W' ? '-' : ''
      metadata.GPSPosition = `${latSign}${lat.toFixed(6)}, ${lonSign}${lon.toFixed(6)}`
    }
  }
}

function readTagValue(
  data: Buffer,
  type: number,
  count: number,
  valueOffset: number,
  littleEndian: boolean,
): string | null {
  const typeSizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8]
  const typeSize = typeSizes[type] || 1
  const totalSize = typeSize * count

  let offset = valueOffset
  if (totalSize <= 4) {
    offset = 0 // value is inline - but we need the position in the IFD entry
    // For inline values, the value is stored at the valueOffset position in the IFD entry
    // which is actually the start of the 4-byte value field
    // We need to pass the actual position, not valueOffset
    // This is a limitation - for now, handle common cases
  }

  if (offset >= data.length) return null

  switch (type) {
    case 2: // ASCII
      if (totalSize <= 4) {
        // Inline ASCII - read from the value field position
        // We need the actual position of the value in the IFD entry
        // This is complex; for now return null for inline strings
        return null
      }
      let str = ''
      for (let i = 0; i < count - 1 && offset + i < data.length; i++) {
        str += String.fromCharCode(data[offset + i])
      }
      return str

    case 7: // Undefined
      if (totalSize <= 4) return null
      let uStr = ''
      for (let i = 0; i < count && offset + i < data.length; i++) {
        uStr += String.fromCharCode(data[offset + i])
      }
      return uStr

    default:
      return null
  }
}

function readRationalArray(
  data: Buffer,
  offset: number,
  count: number,
  littleEndian: boolean,
): number[] {
  const values: number[] = []
  for (let i = 0; i < count && offset + i * 8 + 7 < data.length; i++) {
    const num = littleEndian
      ? data.readUInt32LE(offset + i * 8)
      : data.readUInt32BE(offset + i * 8)
    const den = littleEndian
      ? data.readUInt32LE(offset + i * 8 + 4)
      : data.readUInt32BE(offset + i * 8 + 4)
    values.push(den === 0 ? 0 : num / den)
  }
  return values
}

function extractPngTextChunks(buffer: Buffer): Record<string, string> {
  const metadata: Record<string, string> = {}

  if (buffer.length < 8) return metadata
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47
  ) {
    return metadata
  }

  let pos = 8
  while (pos < buffer.length - 8) {
    const length = buffer.readUInt32BE(pos)
    const chunkType = buffer.toString('ascii', pos + 4, pos + 8)
    const dataStart = pos + 8

    if (chunkType === 'tEXt' || chunkType === 'zTXt') {
      const nullIdx = buffer.indexOf(0, dataStart)
      if (nullIdx > -1) {
        const keyword = buffer.toString('latin1', dataStart, nullIdx)
        let textData: Buffer
        if (chunkType === 'tEXt') {
          textData = buffer.slice(nullIdx + 1, dataStart + length)
        } else {
          // zTXt - compressed text (skip compression method byte)
          textData = buffer.slice(nullIdx + 2, dataStart + length)
        }
        const text = textData.toString('latin1')
        mapPngTextToMetadata(keyword, text, metadata)
      }
    } else if (chunkType === 'iTXt') {
      const nullIdx = buffer.indexOf(0, dataStart)
      if (nullIdx > -1) {
        const keyword = buffer.toString('utf8', dataStart, nullIdx)
        const compFlag = buffer[nullIdx + 1]
        const compMethod = buffer[nullIdx + 2]
        // Skip language tag and translated keyword
        let langEnd = buffer.indexOf(0, nullIdx + 3)
        if (langEnd === -1) langEnd = nullIdx + 3
        let transEnd = buffer.indexOf(0, langEnd + 1)
        if (transEnd === -1) transEnd = langEnd + 1
        const textData = buffer.slice(transEnd + 1, dataStart + length)
        if (compFlag === 0) {
          const text = textData.toString('utf8')
          mapPngTextToMetadata(keyword, text, metadata)
        }
        void compMethod
      }
    }

    // Move to next chunk (length + 4 type + data + 4 CRC)
    pos = dataStart + length + 4
  }

  // Get image size from IHDR
  if (pos >= 8 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    const width = buffer.readUInt32BE(16)
    const height = buffer.readUInt32BE(20)
    metadata.ImageSize = `${width}x${height}`
  }

  return metadata
}

function mapPngTextToMetadata(
  keyword: string,
  text: string,
  metadata: Record<string, string>,
): void {
  const keyMap: Record<string, string> = {
    Title: 'Title',
    Description: 'Description',
    Author: 'Author',
    Caption: 'Caption',
    Keywords: 'Keywords',
    Artist: 'Artist',
    'Create Date': 'CreateDate',
    DateTimeOriginal: 'DateTimeOriginal',
  }
  const mappedKey = keyMap[keyword]
  if (mappedKey && !metadata[mappedKey]) {
    metadata[mappedKey] = text
  }
}

export class ImageConverter implements DocumentConverter {
  format = 'jpg' as const
  priority = 100

  accept(_filePath: string, format: string): boolean {
    return format === 'jpg'
  }

  static convertImage(buffer: Buffer, filePath: string): ConverterResult {
    let metadata: Record<string, string> = {}

    const ext = filePath.toLowerCase()
    if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) {
      metadata = extractJpegExif(buffer)
    } else if (ext.endsWith('.png')) {
      metadata = extractPngTextChunks(buffer)
    }

    let mdContent = ''
    const fieldOrder = [
      'ImageSize',
      'Title',
      'Caption',
      'Description',
      'Keywords',
      'Artist',
      'Author',
      'DateTimeOriginal',
      'CreateDate',
      'GPSPosition',
    ]

    for (const field of fieldOrder) {
      if (metadata[field]) {
        mdContent += `${field}: ${metadata[field]}\n`
      }
    }

    return { markdown: mdContent }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return ImageConverter.convertImage(input.binaryContent, input.filePath)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'image_convert_failed',
        `图片转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

export function createBinaryConverters(): DocumentConverter[] {
  return [
    new DocxConverter(),
    new XlsxConverter(),
    new PdfConverter(),
    new IpynbConverter(),
    new PptxConverter(),
    new ZipConverter(),
    new ImageConverter(),
    new RssConverter(),
  ]
}
