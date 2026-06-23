import type { DocumentConverter } from '../../markitdown-types.js'

import { CsvConverter } from './csv-converter.js'
import { DocxConverter } from './docx-converter.js'
import { HtmlConverter } from './html-converter.js'
import { ImageConverter } from './image-converter.js'
import { JsonConverter } from './json-converter.js'
import { PdfConverter } from './pdf-converter.js'
import { PptxConverter } from './pptx-converter.js'
import { XlsxConverter } from './xlsx-converter.js'

/**
 * 创建文本格式转换器集合
 */
export function createTextConverters(): DocumentConverter[] {
  return [
    new HtmlConverter(),
    new CsvConverter(),
    new JsonConverter(),
  ]
}

/**
 * 创建二进制格式转换器集合
 */
export function createBinaryConverters(): DocumentConverter[] {
  return [
    new DocxConverter(),
    new XlsxConverter(),
    new PdfConverter(),
    new PptxConverter(),
    new ImageConverter(),
  ]
}
