export type SupportedFormat =
  | 'html'
  | 'csv'
  | 'json'
  | 'xml'
  | 'yaml'
  | 'text'
  | 'markdown'
  | 'docx'
  | 'xlsx'
  | 'pdf'
  | 'ipynb'
  | 'pptx'
  | 'zip'
  | 'jpg'
  | 'rss'

export interface ConverterInput {
  filePath: string
  textContent: string
  binaryContent: Buffer
  format: SupportedFormat
}

export interface ConverterResult {
  markdown: string
  title?: string
}

export interface DocumentConverter {
  format: SupportedFormat
  priority: number
  accept(filePath: string, format: SupportedFormat): boolean
  convert(input: ConverterInput): Promise<ConverterResult>
}

export interface MarkitdownSourceResult {
  filePath: string
  textContent: string
  binaryContent: Buffer
  format: SupportedFormat
  realPath: string
  fileSize: number
}

const EXTENSION_FORMAT_MAP: Record<string, SupportedFormat> = {
  '.html': 'html',
  '.htm': 'html',
  '.csv': 'csv',
  '.tsv': 'csv',
  '.json': 'json',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.txt': 'text',
  '.text': 'text',
  '.log': 'text',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.pdf': 'pdf',
  '.ipynb': 'ipynb',
  '.pptx': 'pptx',
  '.zip': 'zip',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.png': 'jpg',
  '.rss': 'rss',
  '.atom': 'rss',
}

export function detectFormat(filePath: string): SupportedFormat | undefined {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)
  if (!ext) return undefined
  return EXTENSION_FORMAT_MAP[ext[0]]
}

export const ALL_SUPPORTED_FORMATS: readonly SupportedFormat[] = [
  'html',
  'csv',
  'json',
  'xml',
  'yaml',
  'text',
  'markdown',
  'docx',
  'xlsx',
  'pdf',
  'ipynb',
  'pptx',
  'zip',
  'jpg',
  'rss',
]
