import type { DocumentConverter } from '../../markitdown-types.js'

import { CsvConverter } from './csv-converter.js'
import { DocxConverter } from './docx-converter.js'
import { EpubConverter } from './epub-converter.js'
import { HtmlConverter } from './html-converter.js'
import { ImageConverter } from './image-converter.js'
import { IpynbConverter } from './ipynb-converter.js'
import { JsonConverter } from './json-converter.js'
import { OutlookMsgConverter } from './outlook-msg-converter.js'
import { PdfConverter } from './pdf-converter.js'
import { PptxConverter } from './pptx-converter.js'
import { RssConverter } from './rss-converter.js'
import { MarkdownConverter, TextConverter } from './text-markdown-converters.js'
import { XlsxConverter } from './xlsx-converter.js'
import { XmlConverter, YamlConverter } from './xml-yaml-converters.js'
import { ZipConverter } from './zip-converter.js'

/**
 * 创建文本格式转换器集合
 * 集中管理转换器实例化，避免 zip-converter 与 index 之间的循环依赖
 */
export function createTextConverters(): DocumentConverter[] {
  return [
    new HtmlConverter(),
    new CsvConverter(),
    new JsonConverter(),
    new XmlConverter(),
    new YamlConverter(),
    new TextConverter(),
    new MarkdownConverter(),
    new RssConverter(),
  ]
}

/**
 * 创建二进制格式转换器集合
 * 集中管理转换器实例化，避免 zip-converter 与 index 之间的循环依赖
 */
export function createBinaryConverters(): DocumentConverter[] {
  return [
    new DocxConverter(),
    new XlsxConverter(),
    new PdfConverter(),
    new IpynbConverter(),
    new PptxConverter(),
    new ZipConverter(),
    new ImageConverter(),
    new EpubConverter(),
    new OutlookMsgConverter(),
  ]
}
