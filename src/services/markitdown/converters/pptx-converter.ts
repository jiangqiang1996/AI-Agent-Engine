import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { getElementsByTagName, parseXml, type SimpleXmlNode } from '../xml-parser.js'
import type { TurndownOptions } from '../turndown-config.js'

interface PptxShape {
  type: 'text' | 'table' | 'image' | 'group'
  text?: string
  isTitle?: boolean
  top?: number
  left?: number
  tableData?: string[][]
  altText?: string
  imageName?: string
  imageDataUri?: string
  children?: PptxShape[]
}

interface ExtractContext {
  zip: unknown
  slideNum: number
  keepDataUris: boolean
  relsMap?: Map<string, string>
  imageDataCache?: Map<string, string>
}

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.emf': 'image/emf',
  '.wmf': 'image/wmf',
}

export class PptxConverter implements DocumentConverter {
  format = 'pptx' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'pptx'
  }

  static async convertPptx(buffer: Buffer, options: TurndownOptions = {}): Promise<ConverterResult> {
    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)
    const keepDataUris = options.keepDataUris === true

    const slideFiles = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
        const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
        return numA - numB
      })

    let mdContent = ''

    for (const slideFile of slideFiles) {
      const slideNum = parseInt(slideFile.match(/slide(\d+)\.xml/)?.[1] || '0', 10)
      const slideXml = await zip.files[slideFile].async('string')
      mdContent += `\n\n<!-- Slide number: ${slideNum} -->\n`

      // 构建 rels 映射，用于 keepDataUris 时查找图片路径
      let relsMap: Map<string, string> | undefined
      let imageDataCache: Map<string, string> | undefined
      if (keepDataUris) {
        const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
        const relsFile = zip.file(relsPath)
        if (relsFile) {
          const relsXml = await relsFile.async('string')
          relsMap = PptxConverter.parseRels(relsXml)
          // 预加载所有图片为 data URI
          imageDataCache = new Map()
          for (const [relId, target] of relsMap) {
            const imagePath = PptxConverter.resolveRelsPath(target, slideNum)
            const imageFile = zip.file(imagePath)
            if (imageFile) {
              const imageBytes = await imageFile.async('uint8array')
              const ext = imagePath.match(/\.\w+$/)?.[0]?.toLowerCase() || '.jpg'
              const mime = MIME_BY_EXT[ext] || 'image/jpeg'
              const base64 = Buffer.from(imageBytes).toString('base64')
              imageDataCache.set(relId, `data:${mime};base64,${base64}`)
            }
          }
        }
      }

      const ctx: ExtractContext = { zip, slideNum, keepDataUris, relsMap, imageDataCache }
      const slideDoc = parseXml(slideXml)
      const shapes = PptxConverter.extractShapes(slideDoc, ctx)

      const sortedShapes = PptxConverter.sortShapes(shapes)

      const titleShape = sortedShapes.find((s) => s.isTitle)

      for (const shape of sortedShapes) {
        mdContent += PptxConverter.renderShape(shape, titleShape)
      }

      mdContent = mdContent.trim()

      const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`
      if (zip.files[notesPath]) {
        const notesXml = await zip.files[notesPath].async('string')
        const notesDoc = parseXml(notesXml)
        const notesShapes = PptxConverter.extractShapes(notesDoc, { zip, slideNum, keepDataUris })
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

  private static extractShapes(doc: SimpleXmlNode, ctx?: ExtractContext): PptxShape[] {
    // 使用返回值方式而非共享数组，避免 grpSp 子节点被重复处理
    function searchShapes(node: SimpleXmlNode): PptxShape[] {
      const tagParts = node.tagName.split(':')
      const localName = tagParts[tagParts.length - 1]
      const shapes: PptxShape[] = []

      if (localName === 'sp') {
        const isTitle = PptxConverter.hasTitlePlaceholder(node)
        const text = PptxConverter.extractTextFromShape(node)
        const pos = PptxConverter.getShapePosition(node)
        if (text || isTitle) {
          shapes.push({ type: 'text', text, isTitle, top: pos?.top, left: pos?.left })
        }
      } else if (localName === 'pic') {
        const altText = PptxConverter.getImageAltText(node)
        const imageName = PptxConverter.getImageName(node)
        const pos = PptxConverter.getShapePosition(node)
        const shape: PptxShape = {
          type: 'image',
          altText,
          imageName,
          top: pos?.top,
          left: pos?.left,
        }
        if (ctx?.keepDataUris && ctx.relsMap) {
          shape.imageDataUri = PptxConverter.tryLoadImageDataUri(node, ctx)
        }
        shapes.push(shape)
      } else if (localName === 'graphicFrame') {
        const tableData = PptxConverter.extractTable(node)
        if (tableData) {
          const pos = PptxConverter.getShapePosition(node)
          shapes.push({ type: 'table', tableData, top: pos?.top, left: pos?.left })
        }
      } else if (localName === 'grpSp') {
        // 组内子形状收集后作为 group 返回，不再向下递归避免重复处理
        const childShapes: PptxShape[] = []
        for (const child of node.childNodes) {
          childShapes.push(...searchShapes(child))
        }
        if (childShapes.length > 0) {
          const pos = PptxConverter.getShapePosition(node)
          shapes.push({
            type: 'group',
            children: PptxConverter.sortShapes(childShapes),
            top: pos?.top,
            left: pos?.left,
          })
        }
        return shapes
      }

      // 递归搜索子节点中的嵌套形状（grpSp 已提前 return）
      for (const child of node.childNodes) {
        shapes.push(...searchShapes(child))
      }
      return shapes
    }

    return searchShapes(doc)
  }

  /** 渲染单个形状为 Markdown 文本，支持递归渲染 group 子形状 */
  private static renderShape(shape: PptxShape, titleShape?: PptxShape): string {
    if (shape.type === 'image') {
      let altText = shape.altText || shape.imageName || ''
      altText = altText.replace(/[\r\n\[\]]/g, ' ').replace(/\s+/g, ' ').trim()
      if (shape.imageDataUri) {
        return `\n![${altText}](${shape.imageDataUri})\n`
      }
      const filename = (shape.imageName || 'image').replace(/\W/g, '') + '.jpg'
      return `\n![${altText}](${filename})\n`
    }
    if (shape.type === 'table' && shape.tableData) {
      return PptxConverter.tableToMarkdown(shape.tableData) + '\n'
    }
    if (shape.type === 'text' && shape.text) {
      if (shape === titleShape) {
        return `# ${shape.text.trimStart()}\n`
      }
      return `${shape.text}\n`
    }
    if (shape.type === 'group' && shape.children) {
      const sortedChildren = PptxConverter.sortShapes(shape.children)
      const groupTitle = sortedChildren.find((s) => s.isTitle)
      return sortedChildren.map((child) => PptxConverter.renderShape(child, groupTitle)).join('')
    }
    return ''
  }

  private static hasTitlePlaceholder(node: SimpleXmlNode): boolean {
    const placeholders = getElementsByTagName(node, 'ph')
    return placeholders.some((ph) => ph.attributes.type === 'title')
  }

  private static extractTextFromShape(node: SimpleXmlNode): string {
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

  /** 解析 slide rels XML，返回 relId → target 路径的映射 */
  private static parseRels(relsXml: string): Map<string, string> {
    const map = new Map<string, string>()
    const relMatches = relsXml.match(/<Relationship[^>]*>/g) || []
    for (const rel of relMatches) {
      const idMatch = rel.match(/Id="([^"]*)"/)
      const targetMatch = rel.match(/Target="([^"]*)"/)
      const typeMatch = rel.match(/Type="([^"]*)"/)
      if (idMatch && targetMatch && typeMatch && typeMatch[1].includes('/image')) {
        map.set(idMatch[1], targetMatch[1])
      }
    }
    return map
  }

  /** 从 blip 元素提取 r:embed，查 imageDataCache 获取 data URI */
  private static tryLoadImageDataUri(node: SimpleXmlNode, ctx: ExtractContext): string | undefined {
    const blipElements = getElementsByTagName(node, 'blip')
    if (blipElements.length === 0) return undefined
    const embed = blipElements[0].attributes['r:embed'] || blipElements[0].attributes['embed']
    if (!embed || !ctx.imageDataCache) return undefined
    return ctx.imageDataCache.get(embed)
  }

  /** 将 rels Target 相对路径解析为 zip 内绝对路径 */
  private static resolveRelsPath(target: string, slideNum: number): string {
    if (target.startsWith('/')) return target.slice(1)
    // Target 形如 ../media/image2.jpg，相对于 ppt/slides/
    const baseDir = `ppt/slides`
    const parts = target.split('/')
    const resolved: string[] = [...baseDir.split('/')]
    for (const part of parts) {
      if (part === '..') {
        resolved.pop()
      } else if (part !== '.') {
        resolved.push(part)
      }
    }
    return resolved.join('/')
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
