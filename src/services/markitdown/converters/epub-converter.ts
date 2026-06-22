import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { HtmlConverter } from './html-converter.js'
import { getElementsByTagName, getNodeData, parseXml, type SimpleXmlNode } from '../xml-parser.js'

/**
 * EPUB 转换器
 *
 * 大文件处理策略：
 * - 使用 JSZip 流式加载，逐个解压 spine 项，避免一次性把所有 XHTML 读入内存
 * - 复用 HtmlConverter 进行 XHTML → Markdown 转换
 * - 元数据只读取 content.opf 单文件，避免扫描全包
 */
export class EpubConverter implements DocumentConverter {
  format = 'epub' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'epub'
  }

  /**
   * 将 EPUB Buffer 转换为 Markdown
   *
   * 实现要点：
   * 1. 通过 META-INF/container.xml 定位 content.opf
   * 2. 解析 content.opf 提取元数据和 spine 顺序
   * 3. 按 spine 顺序逐个解压 XHTML 文件并转换为 Markdown
   * 4. 元数据作为 Markdown 首段输出
   *
   * 大文件友好：每个 spine 项独立读取和转换，不缓存全部内容
   */
  static async convertEpub(buffer: Buffer): Promise<ConverterResult> {
    const JSZip = (await import('jszip')).default
    let zip
    try {
      zip = await JSZip.loadAsync(buffer)
    } catch (error) {
      throw new MarkitdownError(
        'epub_convert_failed',
        `EPUB 加载失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // 1. 定位 content.opf
    const containerFile = zip.file('META-INF/container.xml')
    if (!containerFile) {
      throw new MarkitdownError('epub_convert_failed', 'EPUB 缺少 META-INF/container.xml')
    }
    const containerXml = await containerFile.async('string')
    const containerDoc = parseXml(containerXml)
    const rootfileNodes = getElementsByTagName(containerDoc, 'rootfile')
    if (rootfileNodes.length === 0) {
      throw new MarkitdownError('epub_convert_failed', 'EPUB container.xml 缺少 rootfile 元素')
    }
    const opfPath = rootfileNodes[0].attributes['full-path']
    if (!opfPath) {
      throw new MarkitdownError('epub_convert_failed', 'EPUB container.xml rootfile 缺少 full-path')
    }

    // 2. 解析 content.opf
    const opfFile = zip.file(opfPath)
    if (!opfFile) {
      throw new MarkitdownError('epub_convert_failed', `EPUB 缺少 OPF 文件：${opfPath}`)
    }
    const opfXml = await opfFile.async('string')
    const opfDoc = parseXml(opfXml)

    const metadata = EpubConverter.extractMetadata(opfDoc)
    const manifest = EpubConverter.extractManifest(opfDoc)
    const spine = EpubConverter.extractSpine(opfDoc, manifest, opfPath)

    // 3. 按 spine 顺序逐个转换（大文件友好：每个文件独立读取）
    const markdownParts: string[] = []

    // 元数据作为首段
    const metadataMarkdown = EpubConverter.formatMetadata(metadata)
    if (metadataMarkdown) {
      markdownParts.push(metadataMarkdown)
    }

    for (const file of spine) {
      const entry = zip.file(file)
      if (!entry) continue
      try {
        const xhtml = await entry.async('string')
        const { markdown } = HtmlConverter.convertHtml(xhtml)
        const trimmed = markdown.trim()
        if (trimmed) {
          markdownParts.push(trimmed)
        }
      } catch {
        // 跳过单个文件解析失败，匹配参考行为
      }
    }

    const title = typeof metadata.title === 'string' ? metadata.title : undefined
    return {
      markdown: markdownParts.join('\n\n'),
      ...(title ? { title } : {}),
    }
  }

  private static extractMetadata(opfDoc: SimpleXmlNode): Record<string, string | string[]> {
    const getOne = (tag: string): string | undefined => getNodeData(opfDoc, tag) ?? undefined
    const getAll = (tag: string): string[] => {
      return getElementsByTagName(opfDoc, tag)
        .map((n) => n.data?.trim() ?? '')
        .filter((s) => s.length > 0)
    }
    return {
      title: getOne('dc:title') ?? '',
      authors: getAll('dc:creator'),
      language: getOne('dc:language') ?? '',
      publisher: getOne('dc:publisher') ?? '',
      date: getOne('dc:date') ?? '',
      description: getOne('dc:description') ?? '',
      identifier: getOne('dc:identifier') ?? '',
    }
  }

  private static extractManifest(opfDoc: SimpleXmlNode): Record<string, string> {
    const manifest: Record<string, string> = {}
    for (const item of getElementsByTagName(opfDoc, 'item')) {
      const id = item.attributes['id']
      const href = item.attributes['href']
      if (id && href) {
        manifest[id] = href
      }
    }
    return manifest
  }

  private static extractSpine(
    opfDoc: SimpleXmlNode,
    manifest: Record<string, string>,
    opfPath: string,
  ): string[] {
    const spineItems = getElementsByTagName(opfDoc, 'itemref')
    const basePath = opfPath.includes('/')
      ? opfPath.split('/').slice(0, -1).join('/')
      : ''
    const spine: string[] = []
    for (const item of spineItems) {
      const idref = item.attributes['idref']
      if (!idref || !(idref in manifest)) continue
      const href = manifest[idref]
      spine.push(basePath ? `${basePath}/${href}` : href)
    }
    return spine
  }

  private static formatMetadata(metadata: Record<string, string | string[]>): string {
    const lines: string[] = []
    for (const [key, value] of Object.entries(metadata)) {
      if (!value) continue
      const text = Array.isArray(value) ? value.join(', ') : value
      if (!text) continue
      const capitalized = key.charAt(0).toUpperCase() + key.slice(1)
      lines.push(`**${capitalized}:** ${text}`)
    }
    return lines.join('\n')
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await EpubConverter.convertEpub(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'epub_convert_failed',
        `EPUB 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
