export type SupportedFormat =
  | 'html'
  | 'csv'
  | 'json'
  | 'docx'
  | 'xlsx'
  | 'pdf'
  | 'pptx'
  | 'jpg'

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
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.xls': 'xlsx',
  '.pdf': 'pdf',
  '.pptx': 'pptx',
  '.jpg': 'jpg',
  '.jpeg': 'jpg',
  '.png': 'jpg',
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
  'docx',
  'xlsx',
  'pdf',
  'pptx',
  'jpg',
]
