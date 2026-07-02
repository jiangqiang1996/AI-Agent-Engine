import { getElementsByTagName, parseXml, type SimpleXmlNode } from './xml-parser.js'
import type { MarkdownConversionResult } from './markdown-conversion-types.js'

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

function hasTitlePlaceholder(node: SimpleXmlNode): boolean {
  const placeholders = getElementsByTagName(node, 'ph')
  return placeholders.some((ph: SimpleXmlNode) => ph.attributes.type === 'title')
}

function extractTextFromShape(node: SimpleXmlNode): string {
  const textRuns = getElementsByTagName(node, 't')
  return textRuns.map((t: SimpleXmlNode) => t.data || '').join('')
}

function getShapePosition(
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

function getImageAltText(node: SimpleXmlNode): string {
  const cNvPrElements = getElementsByTagName(node, 'cNvPr')
  for (const cNvPr of cNvPrElements) {
    if (cNvPr.attributes.descr) return cNvPr.attributes.descr
  }
  return ''
}

function getImageName(node: SimpleXmlNode): string {
  const cNvPrElements = getElementsByTagName(node, 'cNvPr')
  for (const cNvPr of cNvPrElements) {
    if (cNvPr.attributes.name) return cNvPr.attributes.name
  }
  return ''
}

function extractTable(node: SimpleXmlNode): string[][] | null {
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
      const cellText = textRuns.map((t: SimpleXmlNode) => t.data || '').join('')
      rowData.push(cellText)
    }
    if (rowData.length > 0) {
      tableData.push(rowData)
    }
  }

  return tableData.length > 0 ? tableData : null
}

function tableToMarkdown(table: string[][]): string {
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

function parseRels(relsXml: string): Map<string, string> {
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

function tryLoadImageDataUri(node: SimpleXmlNode, ctx: ExtractContext): string | undefined {
  const blipElements = getElementsByTagName(node, 'blip')
  if (blipElements.length === 0) return undefined
  const embed = blipElements[0].attributes['r:embed'] || blipElements[0].attributes['embed']
  if (!embed || !ctx.imageDataCache) return undefined
  return ctx.imageDataCache.get(embed)
}

function resolveRelsPath(target: string, slideNum: number): string {
  if (target.startsWith('/')) return target.slice(1)
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

function sortShapes(shapes: PptxShape[]): PptxShape[] {
  return [...shapes].sort((a, b) => {
    const topA = a.top ?? Number.NEGATIVE_INFINITY
    const topB = b.top ?? Number.NEGATIVE_INFINITY
    const leftA = a.left ?? Number.NEGATIVE_INFINITY
    const leftB = b.left ?? Number.NEGATIVE_INFINITY
    if (topA !== topB) return topA - topB
    return leftA - leftB
  })
}

function extractShapes(doc: SimpleXmlNode, ctx?: ExtractContext): PptxShape[] {
  function searchShapes(node: SimpleXmlNode): PptxShape[] {
    const tagParts = node.tagName.split(':')
    const localName = tagParts[tagParts.length - 1]
    const shapes: PptxShape[] = []

    if (localName === 'sp') {
      const isTitle = hasTitlePlaceholder(node)
      const text = extractTextFromShape(node)
      const pos = getShapePosition(node)
      if (text || isTitle) {
        shapes.push({ type: 'text', text, isTitle, top: pos?.top, left: pos?.left })
      }
    } else if (localName === 'pic') {
      const altText = getImageAltText(node)
      const imageName = getImageName(node)
      const pos = getShapePosition(node)
      const shape: PptxShape = {
        type: 'image',
        altText,
        imageName,
        top: pos?.top,
        left: pos?.left,
      }
      if (ctx?.keepDataUris && ctx.relsMap) {
        shape.imageDataUri = tryLoadImageDataUri(node, ctx)
      }
      shapes.push(shape)
    } else if (localName === 'graphicFrame') {
      const tableData = extractTable(node)
      if (tableData) {
        const pos = getShapePosition(node)
        shapes.push({ type: 'table', tableData, top: pos?.top, left: pos?.left })
      }
    } else if (localName === 'grpSp') {
      const childShapes: PptxShape[] = []
      for (const child of node.childNodes) {
        childShapes.push(...searchShapes(child))
      }
      if (childShapes.length > 0) {
        const pos = getShapePosition(node)
        shapes.push({
          type: 'group',
          children: sortShapes(childShapes),
          top: pos?.top,
          left: pos?.left,
        })
      }
      return shapes
    }

    for (const child of node.childNodes) {
      shapes.push(...searchShapes(child))
    }
    return shapes
  }

  return searchShapes(doc)
}

function renderShape(shape: PptxShape, titleShape?: PptxShape): string {
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
    return tableToMarkdown(shape.tableData) + '\n'
  }
  if (shape.type === 'text' && shape.text) {
    if (shape === titleShape) {
      return `# ${shape.text.trimStart()}\n`
    }
    return `${shape.text}\n`
  }
  if (shape.type === 'group' && shape.children) {
    const sortedChildren = sortShapes(shape.children)
    const groupTitle = sortedChildren.find((s) => s.isTitle)
    return sortedChildren.map((child) => renderShape(child, groupTitle)).join('')
  }
  return ''
}

export async function convertPptxToMarkdown(
  buffer: Buffer,
  options?: { keepDataUris?: boolean },
): Promise<MarkdownConversionResult> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const keepDataUris = options?.keepDataUris === true

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

    let relsMap: Map<string, string> | undefined
    let imageDataCache: Map<string, string> | undefined
    if (keepDataUris) {
      const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
      const relsFile = zip.file(relsPath)
      if (relsFile) {
        const relsXml = await relsFile.async('string')
        relsMap = parseRels(relsXml)
        imageDataCache = new Map()
        for (const [relId, target] of relsMap) {
          const imagePath = resolveRelsPath(target, slideNum)
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
    const shapes = extractShapes(slideDoc, ctx)

    const sortedShapes = sortShapes(shapes)

    const titleShape = sortedShapes.find((s) => s.isTitle)

    for (const shape of sortedShapes) {
      mdContent += renderShape(shape, titleShape)
    }

    mdContent = mdContent.trim()

    const notesPath = `ppt/notesSlides/notesSlide${slideNum}.xml`
    if (zip.files[notesPath]) {
      const notesXml = await zip.files[notesPath].async('string')
      const notesDoc = parseXml(notesXml)
      const notesShapes = extractShapes(notesDoc, { zip, slideNum, keepDataUris })
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
