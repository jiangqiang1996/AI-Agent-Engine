import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import AdmZip from 'adm-zip'

import { withBackup } from '../utils/file-backup.js'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'
import { PptxInstance, PptxSlideInstance, buildSlide, applyPresentationMeta } from './pptx-element-builder.js'
import { convertPptxToMarkdown } from './pptx-markdown-converter.js'
import { loadDocumentFile } from './document-file-loader.js'
import { writeMarkdownOutput } from './markdown-output-writer.js'
import { detectLibreOffice, convertToImagesViaPdf, resolveLibreofficeConfigPath } from './libreoffice-service.js'
import { join } from 'node:path'
import { handleMerge } from './pptx-merge.js'
import { injectSvgElements, extractSvgSpecs } from './pptx-svg-injector.js'

export type { PptxSlideInstance } from './pptx-element-builder.js'

const require = createRequire(import.meta.url)

// pptxgenjs 是 CJS 函数导出，通过 createRequire 获取构造函数
// 类型定义参考 node_modules/pptxgenjs/types/index.d.ts
const PptxGenJS = require('pptxgenjs') as new () => PptxInstance


const SLIDE_XML_PATTERN = /^ppt\/slides\/slide\d+\.xml$/
const SLIDE_TEXT_REGEX = /<a:t[^>]*>([^<]*)<\/a:t>/g

export type PptxOperation = 'create' | 'edit' | 'analyze' | 'append-slides' | 'update-slide' | 'merge' | 'to-markdown' | 'to-image'

// ==================== 文本运行类型 ====================

export interface PptxBullet {
  type?: 'bullet' | 'number'
  characterCode?: string
  indent?: number
  numberType?: string
  numberStartAt?: number
}

export interface PptxHyperlink {
  url?: string
  slide?: number
  tooltip?: string
}

export interface PptxTextRun {
  text: string
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  fontFace?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  breakLine?: boolean
  bullet?: boolean | PptxBullet
  underline?: { style?: string; color?: string }
  strike?: boolean | string
  subscript?: boolean
  superscript?: boolean
  highlight?: string
  charSpacing?: number
  hyperlink?: PptxHyperlink
  lang?: string
}

// ==================== 填充与边框类型 ====================

export interface PptxShapeFill {
  color?: string
  transparency?: number
  type?: 'none' | 'solid'
}

export interface PptxBorder {
  type?: 'none' | 'dash' | 'solid'
  color?: string
  pt?: number
}

export interface PptxShapeLine extends PptxShapeFill {
  width?: number
  dashType?: 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'
  beginArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
  endArrowType?: 'none' | 'arrow' | 'diamond' | 'oval' | 'stealth' | 'triangle'
}

export interface PptxShadow {
  type?: 'outer' | 'inner' | 'none'
  opacity?: number
  blur?: number
  angle?: number
  offset?: number
  color?: string
  rotateWithShape?: boolean
}

export interface PptxBackground {
  color?: string
  transparency?: number
  path?: string
  data?: string
}

// ==================== 元素类型 ====================

export interface PptxImageSizing {
  type: 'contain' | 'cover' | 'crop'
  w: number | string
  h: number | string
  x?: number | string
  y?: number | string
}

export interface PptxTableCell {
  text?: string
  rowspan?: number
  colspan?: number
  fill?: PptxShapeFill
  border?: PptxBorder | [PptxBorder, PptxBorder, PptxBorder, PptxBorder]
  bold?: boolean
  italic?: boolean
  fontSize?: number
  color?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  hyperlink?: PptxHyperlink
  margin?: number | [number, number, number, number]
}

export interface PptxInputElement {
  type: 'text' | 'image' | 'shape' | 'table' | 'chart' | 'media' | 'svg'
  // 通用位置
  x?: number | string
  y?: number | string
  w?: number | string
  h?: number | string
  // text
  text?: string
  textRuns?: PptxTextRun[]
  fontSize?: number
  bold?: boolean
  italic?: boolean
  color?: string
  fontFace?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  valign?: 'top' | 'middle' | 'bottom'
  bullet?: boolean | PptxBullet
  lineSpacing?: number
  lineSpacingMultiple?: number
  fill?: PptxShapeFill
  line?: PptxShapeLine
  shadow?: PptxShadow
  rotate?: number
  hyperlink?: PptxHyperlink
  margin?: number | [number, number, number, number]
  fit?: 'none' | 'shrink' | 'resize'
  isTextBox?: boolean
  indentLevel?: number
  charSpacing?: number
  paraSpaceAfter?: number
  paraSpaceBefore?: number
  wrap?: boolean
  rtlMode?: boolean
  // image
  imagePath?: string
  imageData?: string
  altText?: string
  rounding?: boolean
  transparency?: number
  flipH?: boolean
  flipV?: boolean
  sizing?: PptxImageSizing
  // shape
  shape?: string
  rectRadius?: number
  points?: unknown[]
  // table
  rows?: PptxTableCell[][]
  colW?: number | number[]
  rowH?: number | number[]
  autoPage?: boolean
  autoPageRepeatHeader?: boolean
  autoPageHeaderRows?: number
  // chart
  chartType?: string
  chartData?: unknown[]
  chartOptions?: unknown
  // media
  mediaType?: 'audio' | 'video' | 'online'
  mediaPath?: string
  mediaLink?: string
  mediaCover?: string
  // svg（矢量图形，由 AdmZip 后处理注入 ASVG 扩展，不走 PptxGenJS addImage）
  svgPath?: string
  svgFill?: string
  stroke?: string
  strokeWidth?: number
  viewBoxW?: number
  viewBoxH?: number
}

// ==================== 幻灯片类型 ====================

export interface PptxSlideContent {
  /** 元素化绘制（新模式） */
  elements?: PptxInputElement[]
  /** 兼容旧模式：标题文本 */
  title?: string
  /** 兼容旧模式：正文文本 */
  body?: string
  /** 兼容旧模式：布局类型 */
  layout?: 'title' | 'section' | 'content' | 'blank'
  /** 演讲者备注 */
  notes?: string
  /** 幻灯片背景 */
  background?: PptxBackground
  /** 是否隐藏 */
  hidden?: boolean
  /** 是否显示页码 */
  slideNumber?: boolean
  /** 使用的母版名称 */
  masterName?: string
  /** 所属章节标题 */
  sectionTitle?: string
}

// ==================== 母版、章节、布局类型 ====================

export interface PptxMasterObject {
  text?: { text: string; options?: unknown }
  image?: unknown
  rect?: unknown
  line?: unknown
  chart?: unknown
  placeholder?: { options: { name: string; type: string; x?: number | string; y?: number | string; w?: number | string; h?: number | string }; text?: string }
}

export interface PptxMasterDef {
  title: string
  background?: PptxBackground
  margin?: number | [number, number, number, number]
  slideNumber?: boolean
  objects?: PptxMasterObject[]
}

export interface PptxSectionDef {
  title: string
  order?: number
}

export interface PptxLayoutDef {
  name: string
  width: number
  height: number
}

export interface PptxPresentationMeta {
  author?: string
  company?: string
  subject?: string
  revision?: string
  title?: string
  rtlMode?: boolean
  headFontFace?: string
  bodyFontFace?: string
}

// ==================== 输入输出类型 ====================

export interface PptxInput {
  operation: PptxOperation
  worktree: string
  file?: string
  /** merge 操作：要合并的 PPTX 文件路径列表 */
  files?: string[]
  title?: string
  slides?: PptxSlideContent[]
  masters?: PptxMasterDef[]
  sections?: PptxSectionDef[]
  layouts?: PptxLayoutDef[]
  /** 使用的布局名称 */
  layout?: string
  presentationMeta?: PptxPresentationMeta
  replacements?: { find: string; replace: string }[]
  /** update-slide 操作：目标幻灯片索引（0-based） */
  slideIndex?: number
  /** update-slide 操作：新元素数组 */
  elements?: PptxInputElement[]
  outputPath?: string
  outputMode?: 'file' | 'inline'
  /** to-image 操作：指定幻灯片页码列表（1-based），省略则转换所有幻灯片 */
  pages?: number[]
}

export interface PptxResult {
  outputPath?: string
  summary: string
  content?: string
}

// ==================== create / edit / analyze / append / update ====================

async function handleCreate(input: PptxInput): Promise<PptxResult> {
  const slides = input.slides
  if (!slides) {
    throw new Error('create 操作需要 slides 参数')
  }
  const pptx = new PptxGenJS()

  // 自定义布局必须先定义再使用
  if (input.layouts) {
    for (const layout of input.layouts) {
      pptx.defineLayout({ name: layout.name, width: layout.width, height: layout.height })
    }
  }

  // 设置使用的布局（自定义布局需先定义）
  const layoutName = input.layout ?? 'LAYOUT_WIDE'
  pptx.layout = layoutName

  // 演示文稿元数据
  if (input.title) pptx.title = input.title
  applyPresentationMeta(pptx, input.presentationMeta)

  // 定义母版
  if (input.masters) {
    for (const master of input.masters) {
      const masterProps: Record<string, unknown> = { title: master.title }
      if (master.background) {
        const bg: Record<string, unknown> = {}
        if (master.background.color) bg.color = master.background.color
        if (master.background.transparency !== undefined) bg.transparency = master.background.transparency
        if (master.background.path) bg.path = master.background.path
        if (master.background.data) bg.data = master.background.data
        masterProps.background = bg
      }
      if (master.margin !== undefined) masterProps.margin = master.margin
      if (master.slideNumber) masterProps.slideNumber = { x: 0.5, y: 7.0, fontSize: 10, color: '888888' }
      if (master.objects) masterProps.objects = master.objects
      pptx.defineSlideMaster(masterProps)
    }
  }

  // 添加章节
  if (input.sections) {
    for (const section of input.sections) {
      pptx.addSection({ title: section.title, ...(section.order !== undefined ? { order: section.order } : {}) })
    }
  }

  // 构建幻灯片
  for (const slideContent of slides) {
    buildSlide(pptx, slideContent)
  }

  let data = await pptx.write({ outputType: 'nodebuffer' })

  // SVG 矢量图形后处理注入：绕过 PptxGenJS addImage 的假 PNG fallback，
  // 用 AdmZip 直操作 OOXML 嵌入 ASVG 扩展（Office 2016+ 原生矢量渲染）
  // 失败时保留已生成的 PPTX，不阻断 create 操作
  const { specs: svgSpecs, skipped: extractSkipped } = extractSvgSpecs(slides)
  let svgSummary = ''
  if (svgSpecs.length > 0 || extractSkipped.length > 0) {
    try {
      let injectedCount = 0
      let allSkipped = extractSkipped
      if (svgSpecs.length > 0) {
        const injectionResult = injectSvgElements(data, svgSpecs)
        data = injectionResult.buffer
        injectedCount = injectionResult.result.injectedCount
        allSkipped = [...extractSkipped, ...injectionResult.result.skipped]
      }
      svgSummary = `，注入 ${injectedCount} 个 SVG 矢量元素`
      if (allSkipped.length > 0) {
        svgSummary += `（跳过 ${allSkipped.length} 个: ${allSkipped.map(s => s.reason).join('; ')}）`
      }
    } catch (err) {
      svgSummary = `，SVG 注入失败: ${(err as Error).message}，已保留不含 SVG 的 PPTX`
    }
  }

  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'create', 'pptx', input.title)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, data)

  return {
    outputPath,
    summary: `已创建 PPTX 文件，包含 ${slides.length} 张幻灯片${svgSummary}`,
  }
}

// ==================== edit 操作 ====================

function handleEdit(input: PptxInput): PptxResult {
  const file = input.file
  const replacements = input.replacements
  if (!file) {
    throw new Error('edit 操作需要 file 参数')
  }
  if (!replacements) {
    throw new Error('edit 操作需要 replacements 参数')
  }
  const zip = new AdmZip(file)
  let replacementCount = 0

  for (const entry of zip.getEntries()) {
    if (entry.entryName.match(SLIDE_XML_PATTERN)) {
      let xml = entry.getData().toString('utf8')
      for (const { find, replace } of replacements) {
        if (xml.includes(find)) {
          xml = xml.split(find).join(replace)
          replacementCount++
        }
      }
      zip.updateFile(entry.entryName, Buffer.from(xml, 'utf8'))
    }
  }

  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    zip.writeZip(outputPath)
  } else {
    withBackup(file, () => zip.writeZip(outputPath))
  }

  return {
    outputPath,
    summary: `已编辑 PPTX 文件，执行 ${replacementCount} 处替换`,
  }
}

// ==================== analyze 操作 ====================

function handleAnalyze(input: PptxInput): PptxResult {
  const file = input.file
  if (!file) {
    throw new Error('analyze 操作需要 file 参数')
  }
  const zip = new AdmZip(file)
  const slideEntries = zip.getEntries().filter((e) => e.entryName.match(SLIDE_XML_PATTERN))

  const slideSummaries: string[] = []
  for (const entry of slideEntries) {
    const xml = entry.getData().toString('utf8')
    const texts = xml.match(SLIDE_TEXT_REGEX) ?? []
    const textContent = texts.map((t) => t.replace(/<[^>]+>/g, '')).join(' | ')
    slideSummaries.push(`### ${entry.entryName}\n${textContent}`)
  }

  return {
    summary: `分析完成：共 ${slideEntries.length} 张幻灯片`,
    content: slideSummaries.join('\n\n').slice(0, 8000),
  }
}

// ==================== append-slides 操作 ====================

async function handleAppendSlides(input: PptxInput): Promise<PptxResult> {
  const file = input.file
  const newSlides = input.slides
  if (!file) {
    throw new Error('append-slides 操作需要 file 参数')
  }
  if (!newSlides || newSlides.length === 0) {
    throw new Error('append-slides 操作需要 slides 参数且不能为空')
  }
  if (!existsSync(file)) {
    throw new Error(`文件 "${file}" 不存在`)
  }

  // 1. 打开已有 PPTX
  const existingZip = new AdmZip(file)
  const existingEntries = existingZip.getEntries()

  // 确定已有幻灯片最大编号
  let maxSlideNum = 0
  for (const entry of existingEntries) {
    const match = entry.entryName.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxSlideNum) maxSlideNum = num
    }
  }

  // 2. 用 pptxgenjs 创建临时 PPTX（仅包含新幻灯片）
  const tempPptx = new PptxGenJS()
  tempPptx.layout = 'LAYOUT_WIDE'
  for (const slideContent of newSlides) {
    buildSlide(tempPptx, slideContent)
  }
  const tempData = await tempPptx.write({ outputType: 'nodebuffer' })
  const tempZip = new AdmZip(tempData)

  // 3. 从临时 PPTX 提取新幻灯片的 XML 条目并插入到已有 PPTX
  // 确定已有最大 rId 以分配新 rId
  let maxRIdNum = 0
  const relsEntry = existingEntries.find(
    (e) => e.entryName === 'ppt/_rels/presentation.xml.rels',
  )
  if (relsEntry) {
    const relsXml = relsEntry.getData().toString('utf8')
    const rIdMatches = relsXml.matchAll(/Id="rId(\d+)"/g)
    for (const m of rIdMatches) {
      const num = parseInt(m[1], 10)
      if (num > maxRIdNum) maxRIdNum = num
    }
  }

  // 从临时 ZIP 中提取幻灯片相关条目并重命名
  const tempEntries = tempZip.getEntries()
  const newSlideXmls: string[] = []
  const nextRIdStart = maxRIdNum + 1

  for (let i = 0; i < newSlides.length; i++) {
    const targetSlideNum = maxSlideNum + i + 1
    const tempSlideNum = i + 1
    const tempSlideName = `ppt/slides/slide${tempSlideNum}.xml`
    const targetSlideName = `ppt/slides/slide${targetSlideNum}.xml`

    // 提取临时幻灯片 XML
    const tempSlideEntry = tempEntries.find((e) => e.entryName === tempSlideName)
    if (!tempSlideEntry) continue

    existingZip.addFile(targetSlideName, tempSlideEntry.getData())
    newSlideXmls.push(targetSlideName)

    // 提取临时幻灯片关系文件
    const tempSlideRelsName = `ppt/slides/_rels/slide${tempSlideNum}.xml.rels`
    const tempSlideRelsEntry = tempEntries.find((e) => e.entryName === tempSlideRelsName)
    if (tempSlideRelsEntry) {
      // OOXML slide rels 中 rId 是文件作用域的，只需在该 .rels 文件内唯一
      // 不需要重编号 rId，因为 slide XML 仍引用原始 rId（如 r:id="rId3"）
      // 重编号会导致 XML 引用与 rels 映射不一致，破坏图片和布局引用
      let relsContent = tempSlideRelsEntry.getData().toString('utf8')
      // 仅修改 Target 路径中引用其他幻灯片的编号（如 slide2.xml → slideN.xml）
      // 不修改 rId 编号
      const slideTargetPattern = /Target="slides\/slide(\d+)\.xml"/g
      for (const m of relsContent.matchAll(slideTargetPattern)) {
        const oldTargetNum = parseInt(m[1], 10)
        const newTargetNum = maxSlideNum + oldTargetNum
        relsContent = relsContent.replace(
          `Target="slides/slide${oldTargetNum}.xml"`,
          `Target="slides/slide${newTargetNum}.xml"`,
        )
      }
      existingZip.addFile(
        `ppt/slides/_rels/slide${targetSlideNum}.xml.rels`,
        Buffer.from(relsContent, 'utf8'),
      )
    }

    // 提取临时 PPTX 中的媒体文件
    for (const tempEntry of tempEntries) {
      if (tempEntry.entryName.startsWith('ppt/media/')) {
        // 检查是否已存在同名文件
        const existingMedia = existingEntries.find(
          (e) => e.entryName === tempEntry.entryName,
        )
        if (!existingMedia) {
          existingZip.addFile(tempEntry.entryName, tempEntry.getData())
        }
      }
    }
  }

  // 4. 更新 ppt/presentation.xml 的 sldIdLst
  const presEntry = existingEntries.find((e) => e.entryName === 'ppt/presentation.xml')
  if (presEntry) {
    let presXml = presEntry.getData().toString('utf8')

    // 在 <p:sldIdLst> 中追加新幻灯片 ID 条目
    // OOXML 幻灯片 ID 格式：<p:sldId id="256" r:id="rId2"/>
    // id 从 256 开始，每张幻灯片递增
    // 新条目必须追加到 </p:sldIdLst> 前面，确保追加的幻灯片出现在现有幻灯片之后
    const sldIdLstCloseMatch = presXml.match(/<\/p:sldIdLst>/)
    const sldIdLstSelfCloseMatch = !sldIdLstCloseMatch && presXml.match(/<p:sldIdLst\s*\/>/)

    if (sldIdLstCloseMatch) {
      // 确定已有幻灯片最大 id
      const existingIds = presXml.matchAll(/<p:sldId id="(\d+)" r:id="rId\d+"\/>/g)
      let maxSlideId = 255
      for (const m of existingIds) {
        const idNum = parseInt(m[1], 10)
        if (idNum > maxSlideId) maxSlideId = idNum
      }

      const newIdEntries: string[] = []
      for (let i = 0; i < newSlides.length; i++) {
        const newId = maxSlideId + i + 1
        const newRId = `rId${nextRIdStart + i}`
        newIdEntries.push(`<p:sldId id="${newId}" r:id="${newRId}"/>`)
      }

      // 在 </p:sldIdLst> 前面插入新条目，确保追加的幻灯片在末尾
      const insertPos = presXml.indexOf(sldIdLstCloseMatch[0])
      presXml =
        presXml.slice(0, insertPos) +
        newIdEntries.join('') +
        presXml.slice(insertPos)

      existingZip.updateFile('ppt/presentation.xml', Buffer.from(presXml, 'utf8'))
    } else if (sldIdLstSelfCloseMatch) {
      // 自闭合 <p:sldIdLst/> 场景（如空演示文稿）：替换为含条目的闭合标签
      const newIdEntries: string[] = []
      let slideId = 256
      for (let i = 0; i < newSlides.length; i++) {
        const newRId = `rId${nextRIdStart + i}`
        newIdEntries.push(`<p:sldId id="${slideId}" r:id="${newRId}"/>`)
        slideId++
      }
      presXml = presXml.replace(sldIdLstSelfCloseMatch[0], `<p:sldIdLst>${newIdEntries.join('')}</p:sldIdLst>`)
      existingZip.updateFile('ppt/presentation.xml', Buffer.from(presXml, 'utf8'))
    }
  }

  // 5. 更新 ppt/_rels/presentation.xml.rels 添加新幻灯片关系
  if (relsEntry) {
    let relsXml = relsEntry.getData().toString('utf8')

    for (let i = 0; i < newSlides.length; i++) {
      const targetSlideNum = maxSlideNum + i + 1
      const newRId = `rId${nextRIdStart + i}`
      const newRel = `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${targetSlideNum}.xml"/>`

      // 在 </Relationships> 前插入
      const closingTag = '</Relationships>'
      const insertPos = relsXml.lastIndexOf(closingTag)
      if (insertPos !== -1) {
        relsXml =
          relsXml.slice(0, insertPos) +
          newRel + '\n' +
          relsXml.slice(insertPos)
      }
    }

    existingZip.updateFile('ppt/_rels/presentation.xml.rels', Buffer.from(relsXml, 'utf8'))
  }

  // 6. 更新 [Content_Types].xml 添加新幻灯片内容类型
  const contentTypesEntry = existingEntries.find(
    (e) => e.entryName === '[Content_Types].xml',
  )
  if (contentTypesEntry) {
    let ctXml = contentTypesEntry.getData().toString('utf8')

    for (let i = 0; i < newSlides.length; i++) {
      const targetSlideNum = maxSlideNum + i + 1
      const partName = `/ppt/slides/slide${targetSlideNum}.xml`
      // 检查是否已存在该 Override
      if (!ctXml.includes(`PartName="${partName}"`)) {
        const newOverride = `<Override PartName="${partName}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`
        // 在 </Types> 前插入
        const closingTag = '</Types>'
        const insertPos = ctXml.lastIndexOf(closingTag)
        if (insertPos !== -1) {
          ctXml =
            ctXml.slice(0, insertPos) +
            newOverride + '\n' +
            ctXml.slice(insertPos)
        }
      }
    }

    existingZip.updateFile('[Content_Types].xml', Buffer.from(ctXml, 'utf8'))
  }

  // 7. SVG 矢量图形后处理注入
  // 注意：extractSvgSpecs 返回的 slideIndex 是相对于 newSlides 数组的索引（0-based），
  // 需要调整为已有 PPTX 中的实际幻灯片索引（maxSlideNum + 原索引）
  let svgSummary = ''
  const { specs: rawSvgSpecs, skipped: extractSkipped } = extractSvgSpecs(newSlides)
  const svgSpecs = rawSvgSpecs.map(s => ({ ...s, slideIndex: maxSlideNum + s.slideIndex }))
  if (svgSpecs.length > 0 || extractSkipped.length > 0) {
    try {
      let injectedCount = 0
      let allSkipped = extractSkipped
      if (svgSpecs.length > 0) {
        const finalBuffer = existingZip.toBuffer()
        const injectionResult = injectSvgElements(finalBuffer, svgSpecs)
        const newZip = new AdmZip(injectionResult.buffer)
        for (const entry of newZip.getEntries()) {
          const existing = existingZip.getEntry(entry.entryName)
          if (existing) {
            existingZip.updateFile(entry.entryName, entry.getData())
          } else {
            existingZip.addFile(entry.entryName, entry.getData())
          }
        }
        injectedCount = injectionResult.result.injectedCount
        allSkipped = [...extractSkipped, ...injectionResult.result.skipped]
      }
      svgSummary = `，注入 ${injectedCount} 个 SVG 矢量元素`
      if (allSkipped.length > 0) {
        svgSummary += `（跳过 ${allSkipped.length} 个: ${allSkipped.map(s => s.reason).join('; ')}）`
      }
    } catch (err) {
      svgSummary = `，SVG 注入失败: ${(err as Error).message}`
    }
  }

  // 8. 写回文件
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    existingZip.writeZip(outputPath)
  } else {
    withBackup(file, () => existingZip.writeZip(outputPath))
  }

  const totalSlides = maxSlideNum + newSlides.length

  return {
    outputPath,
    summary: `已追加 ${newSlides.length} 张幻灯片，文件现有 ${totalSlides} 张幻灯片${svgSummary}`,
  }
}

// ==================== update-slide 操作 ====================

async function handleUpdateSlide(input: PptxInput): Promise<PptxResult> {
  const file = input.file
  const slideIndex = input.slideIndex
  const elements = input.elements
  if (!file) {
    throw new Error('update-slide 操作需要 file 参数')
  }
  if (slideIndex === undefined || slideIndex < 0) {
    throw new Error('update-slide 操作需要有效的 slideIndex 参数（0-based）')
  }
  if (!elements || elements.length === 0) {
    throw new Error('update-slide 操作需要 elements 参数且不能为空')
  }
  if (!existsSync(file)) {
    throw new Error(`文件 "${file}" 不存在`)
  }

  // 1. 打开已有 PPTX
  const existingZip = new AdmZip(file)
  const existingEntries = existingZip.getEntries()

  // 确定已有幻灯片编号列表
  const slideNums: number[] = []
  for (const entry of existingEntries) {
    const match = entry.entryName.match(/^ppt\/slides\/slide(\d+)\.xml$/)
    if (match) {
      slideNums.push(parseInt(match[1], 10))
    }
  }
  slideNums.sort((a, b) => a - b)

  if (slideIndex >= slideNums.length) {
    throw new Error(
      `幻灯片索引 ${slideIndex} 超出范围，文件仅有 ${slideNums.length} 张幻灯片`,
    )
  }

  const targetSlideNum = slideNums[slideIndex]
  const targetSlideEntry = `ppt/slides/slide${targetSlideNum}.xml`

  // 2. 用 pptxgenjs 创建临时 PPTX（仅包含1张更新幻灯片）
  const tempPptx = new PptxGenJS()
  tempPptx.layout = 'LAYOUT_WIDE'
  const slideContent: PptxSlideContent = { elements }
  buildSlide(tempPptx, slideContent)
  const tempData = await tempPptx.write({ outputType: 'nodebuffer' })
  const tempZip = new AdmZip(tempData)

  // 3. 从临时 PPTX 提取 slide1.xml 替换目标幻灯片
  const tempSlideEntry = tempZip.getEntries().find(
    (e) => e.entryName === 'ppt/slides/slide1.xml',
  )
  if (tempSlideEntry) {
    existingZip.updateFile(targetSlideEntry, tempSlideEntry.getData())
  }

  // 4. 更新 slide 的关系文件（替换而非追加）
  const tempSlideRelsEntry = tempZip.getEntries().find(
    (e) => e.entryName === 'ppt/slides/_rels/slide1.xml.rels',
  )
  const targetSlideRelsEntry = `ppt/slides/_rels/slide${targetSlideNum}.xml.rels`

  if (tempSlideRelsEntry) {
    existingZip.updateFile(targetSlideRelsEntry, tempSlideRelsEntry.getData())
  } else {
    // 临时幻灯片无关系文件时，移除已有的关系文件
    const existingRels = existingEntries.find(
      (e) => e.entryName === targetSlideRelsEntry,
    )
    if (existingRels) {
      existingZip.deleteFile(targetSlideRelsEntry)
    }
  }

  // 5. 提取临时 PPTX 中的媒体文件并插入到已有 PPTX
  for (const tempEntry of tempZip.getEntries()) {
    if (tempEntry.entryName.startsWith('ppt/media/')) {
      const existingMedia = existingEntries.find(
        (e) => e.entryName === tempEntry.entryName,
      )
      if (!existingMedia) {
        existingZip.addFile(tempEntry.entryName, tempEntry.getData())
      }
    }
  }

  // 6. 更新 [Content_Types].xml（如有新媒体需要添加内容类型）
  const contentTypesEntry = existingEntries.find(
    (e) => e.entryName === '[Content_Types].xml',
  )
  if (contentTypesEntry) {
    let ctXml = contentTypesEntry.getData().toString('utf8')

    // 检查临时 ZIP 中是否有新的媒体需要添加 Default 内容类型
    for (const tempEntry of tempZip.getEntries()) {
      if (tempEntry.entryName.startsWith('ppt/media/')) {
        const ext = tempEntry.entryName.split('.').pop()
        if (ext && !ctXml.includes(`Extension="${ext}"`)) {
          // 常见媒体类型映射
          const mediaTypes: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            svg: 'image/svg+xml',
            emf: 'application/x-msmetafile',
            wmf: 'application/x-msmetafile',
            avi: 'video/avi',
            mp4: 'video/mp4',
            mov: 'video/quicktime',
            wav: 'audio/wav',
            mp3: 'audio/mpeg',
          }
          const contentType = mediaTypes[ext] ?? 'application/octet-stream'
          const newDefault = `<Default Extension="${ext}" ContentType="${contentType}"/>`
          const closingTag = '</Types>'
          const insertPos = ctXml.lastIndexOf(closingTag)
          if (insertPos !== -1) {
            ctXml =
              ctXml.slice(0, insertPos) +
              newDefault + '\n' +
              ctXml.slice(insertPos)
          }
        }
      }
    }

    existingZip.updateFile('[Content_Types].xml', Buffer.from(ctXml, 'utf8'))
  }

  // 7. SVG 矢量图形后处理注入（与 create 操作一致）
  // 注意：extractSvgSpecs 返回的 slideIndex 是相对于传入数组的索引（0），
  // 需要调整为已有 PPTX 中的实际幻灯片编号（targetSlideNum - 1）
  let svgSummary = ''
  const { specs: rawSvgSpecs, skipped: extractSkipped } = extractSvgSpecs([{ elements }])
  const svgSpecs = rawSvgSpecs.map(s => ({ ...s, slideIndex: targetSlideNum - 1 }))
  if (svgSpecs.length > 0 || extractSkipped.length > 0) {
    try {
      let injectedCount = 0
      let allSkipped = extractSkipped
      if (svgSpecs.length > 0) {
        const finalBuffer = existingZip.toBuffer()
        const injectionResult = injectSvgElements(finalBuffer, svgSpecs)
        const newZip = new AdmZip(injectionResult.buffer)
        for (const entry of newZip.getEntries()) {
          existingZip.updateFile(entry.entryName, entry.getData())
        }
        injectedCount = injectionResult.result.injectedCount
        allSkipped = [...extractSkipped, ...injectionResult.result.skipped]
      }
      svgSummary = `，注入 ${injectedCount} 个 SVG 矢量元素`
      if (allSkipped.length > 0) {
        svgSummary += `（跳过 ${allSkipped.length} 个: ${allSkipped.map(s => s.reason).join('; ')}）`
      }
    } catch (err) {
      svgSummary = `，SVG 注入失败: ${(err as Error).message}`
    }
  }

  // 8. 写回文件
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    existingZip.writeZip(outputPath)
  } else {
    withBackup(file, () => existingZip.writeZip(outputPath))
  }

  return {
    outputPath,
    summary: `已更新第 ${slideIndex + 1} 张幻灯片（索引 ${slideIndex}），包含 ${elements.length} 个元素${svgSummary}`,
  }
}

// ==================== 入口 ====================

export async function processPptx(input: PptxInput): Promise<PptxResult> {
  const { resolveDocumentPath } = await import('./document-file-loader.js')
  const resolvedInput = { ...input }
  if (input.file) {
    try {
      resolvedInput.file = await resolveDocumentPath(input.file, input.worktree)
    } catch {
      // 路径不存在时保留原始值，让 handler 的参数校验先执行
    }
  }
  if (input.files) {
    try {
      resolvedInput.files = await Promise.all(
        input.files.map((f) => resolveDocumentPath(f, input.worktree)),
      )
    } catch {
      // 路径不存在时保留原始值
    }
  }

  switch (resolvedInput.operation) {
    case 'create':
      return handleCreate(resolvedInput)
    case 'edit':
      return handleEdit(resolvedInput)
    case 'analyze':
      return handleAnalyze(resolvedInput)
    case 'append-slides':
      return handleAppendSlides(resolvedInput)
    case 'update-slide':
      return handleUpdateSlide(resolvedInput)
    case 'merge':
      return handleMerge(resolvedInput)
    case 'to-markdown':
      return handleToMarkdown(resolvedInput)
    case 'to-image':
      return handleToImage(resolvedInput)
  }
}

async function handleToMarkdown(input: PptxInput): Promise<PptxResult> {
  if (!input.file) throw new Error('to-markdown 操作需要 file 参数')
  const { buffer } = await loadDocumentFile(input.file, input.worktree, 'PPTX')
  const result = await convertPptxToMarkdown(buffer)
  return writeMarkdownOutput(result.markdown, input.worktree, 'pptx', input.outputPath, input.outputMode)
}

async function handleToImage(input: PptxInput): Promise<PptxResult> {
  if (!input.file) throw new Error('to-image 操作需要 file 参数')
  const configResult = resolveLibreofficeConfigPath(input.worktree)
  const detection = detectLibreOffice(configResult.libreofficePath ?? undefined)
  if (!detection.available || !detection.sofficePath) {
    throw new Error('LibreOffice 不可用。请先通过 ae:libreoffice 技能安装或下载 LibreOffice，再进行视觉验证。')
  }
  const { resolveDocumentPath } = await import('./document-file-loader.js')
  const filePath = await resolveDocumentPath(input.file, input.worktree)
  const outputDir = join(input.worktree, 'ae', 'documents', 'to-image')
  const { images } = await convertToImagesViaPdf({
    filePath,
    outputDir,
    sofficePath: detection.sofficePath,
    pageNumbers: input.pages,
    scale: 2.0,
    intermediateDir: join(input.worktree, 'ae', 'documents', 'to-image', '_intermediate'),
  })
  if (images.length === 0) {
    return { summary: 'PPTX 转图片失败：未生成任何图片文件', content: '' }
  }
  const imageList = images.map(p => {
    const match = p.match(/page_(\d+)\.png$/)
    const pageNum = match ? parseInt(match[1]) : 0
    return `幻灯片 ${pageNum}: ${p}`
  }).join('\n')
  return {
    summary: `PPTX 转图片完成，生成 ${images.length} 张幻灯片图片`,
    content: imageList,
    outputPath: outputDir,
  }
}