import AdmZip from 'adm-zip'

// ==================== 类型定义 ====================

export interface SvgElementSpec {
  /** 幻灯片索引（0-based） */
  slideIndex: number
  /** X 坐标（英寸） */
  x: number
  /** Y 坐标（英寸） */
  y: number
  /** 宽度（英寸） */
  w: number
  /** 高度（英寸） */
  h: number
  /** SVG 路径数据（d 属性内容，不含 d= 前缀） */
  svgPath: string
  /** 填充颜色 HEX（不含 #），如 FF0000 */
  fill?: string
  /** 描边颜色 HEX */
  stroke?: string
  /** 描边宽度 */
  strokeWidth?: number
  /** viewBox 宽度，默认 100 */
  viewBoxW?: number
  /** viewBox 高度，默认 100 */
  viewBoxH?: number
}

export interface SvgInjectionResult {
  /** 注入的 SVG 元素数量 */
  injectedCount: number
  /** 跳过的元素及原因 */
  skipped: { slideIndex: number; reason: string }[]
}

// ==================== ASVG 校验 ====================

/** HEX 颜色格式校验（3/6/8 位十六进制） */
const HEX_COLOR_RE = /^[0-9A-Fa-f]{3,8}$/

/**
 * 校验 SVG 路径数据是否符合 ASVG 安全子集。
 * 仅允许纯 path 命令字符 + 数字 + 分隔符，不含 < > " ' 等可破坏 XML 的字符。
 *
 * @param svgPath SVG path 的 d 属性内容
 * @returns 校验通过返回 null，失败返回错误原因
 */
export function validateAsvgPath(svgPath: string): string | null {
  if (!svgPath || svgPath.trim().length === 0) {
    return 'SVG 路径数据为空'
  }

  // 超长路径拒绝（防止 DoS）
  if (svgPath.length > 10000) {
    return 'SVG 路径数据过长（超过 10000 字符）'
  }

  // 字符级白名单：仅允许 path 命令字母 + 数字 + 分隔符
  // `-` 放在末尾避免被解析为范围字符
  const allowedCommands = /^[MLCZHVQAZmlczhvqa0-9,.\s+eE\-]+$/
  if (!allowedCommands.test(svgPath)) {
    const illegal = svgPath.replace(/[MLCZHVQAZmlczhvqa0-9,.\s+eE-]/g, '')
    return `SVG 路径包含非法字符: ${illegal.slice(0, 20)}`
  }

  // 必须以 M 或 m 起始
  if (!/[Mm]/.test(svgPath)) {
    return 'SVG 路径必须以 M 或 m 命令开始'
  }

  return null
}

/** 校验颜色值为合法 HEX 格式 */
export function validateHexColor(value: string | undefined, field: string): string | null {
  if (value === undefined || value === '') return null
  if (!HEX_COLOR_RE.test(value)) {
    return `${field} 不是合法 HEX 颜色值: ${value.slice(0, 20)}`
  }
  return null
}

/**
 * 构建完整的 SVG 文档字符串（用于嵌入 PPTX media）。
 * 仅使用 ASVG 最小子集：path + fill + stroke。
 */
export function buildSvgDocument(spec: SvgElementSpec): string {
  const vbW = spec.viewBoxW ?? 100
  const vbH = spec.viewBoxH ?? 100
  const parts: string[] = [
    `xmlns="http://www.w3.org/2000/svg"`,
    `viewBox="0 0 ${vbW} ${vbH}"`,
    `width="${vbW}"`,
    `height="${vbH}"`,
  ]

  let svg = `<svg ${parts.join(' ')}>`
  svg += `<path d="${spec.svgPath}"`

  // fill/stroke 仅在通过 HEX 校验时拼入，防止 XML 注入
  if (spec.fill && HEX_COLOR_RE.test(spec.fill)) {
    svg += ` fill="#${spec.fill}"`
  } else {
    svg += ` fill="none"`
  }

  if (spec.stroke && HEX_COLOR_RE.test(spec.stroke)) {
    svg += ` stroke="#${spec.stroke}"`
  }

  if (spec.strokeWidth !== undefined && spec.strokeWidth >= 0) {
    svg += ` stroke-width="${spec.strokeWidth}"`
  }

  svg += `/>`
  svg += `</svg>`

  return svg
}

// ==================== 常量 ====================

const ASVG_NS_URI = 'http://schemas.microsoft.com/office/drawing/2016/SVG/main'
const ASVG_EXT_URI = '{96DAC541-7B7A-43D3-8B79-37D633B846F1}'
const USE_LOCAL_DPI_EXT_URI = '{28A0092B-C50C-407E-A947-70E740481C1C}'
const A14_NS_URI = 'http://schemas.microsoft.com/office/drawing/2010/main'

// 1×1 透明 PNG（base64），OOXML 规范要求的 fallback
const TRANSPARENT_PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// 英寸转 EMU（English Metric Units）：1 英寸 = 914400 EMU
const EMU_PER_INCH = 914400

// ==================== 核心注入逻辑 ====================

/**
 * 向 PptxGenJS 生成的 PPTX Buffer 注入 SVG 矢量图形元素。
 *
 * 实现路径：
 * 1. 用 AdmZip 打开 PPTX Buffer
 * 2. 为每个 SVG 元素：
 *    - 在 ppt/media/ 写入 SVG 文件
 *    - 在 ppt/media/ 写入 1×1 透明 PNG fallback（OOXML 规范硬要求）
 *    - 在 slideN.xml 中追加 `<p:pic>` 元素（含 ASVG 扩展）
 *    - 在 slideN.xml.rels 中追加两条 image 关系
 * 3. 在 [Content_Types].xml 中注册 image/svg+xml
 * 4. 返回修改后的 Buffer
 *
 * 禁止降级策略：SVG 写入失败时报错，不静默 fallback 为纯 PNG。
 */
export function injectSvgElements(
  pptxBuffer: Buffer,
  svgElements: SvgElementSpec[],
): { buffer: Buffer; result: SvgInjectionResult } {
  if (svgElements.length === 0) {
    return { buffer: pptxBuffer, result: { injectedCount: 0, skipped: [] } }
  }

  const zip = new AdmZip(pptxBuffer)
  const skipped: { slideIndex: number; reason: string }[] = []
  let injectedCount = 0

  ensureSvgContentType(zip)

  const maxMediaNum = getMaxMediaFileNumber(zip)
  let mediaCounter = maxMediaNum
  const slideRelsMap = buildSlideRelsMap(zip)
  const slideCnvPrIdMap = new Map<number, number>()

  // 两阶段注入策略：
  // 阶段 A：读取全部原始数据并计算新内容（避免 AdmZip getEntry/updateFile 数据一致性问题）
  // 阶段 B：统一写入 ZIP（media 文件、rels 文件、slide XML）
  // 同一 slide 的多次更新在阶段 A 内累积，避免覆盖
  const pendingMedia: { path: string; data: Buffer }[] = []
  const pendingRelsUpdates = new Map<string, Buffer>()
  const pendingSlideUpdates = new Map<string, Buffer>()

  for (const spec of svgElements) {
    const validationError = validateAsvgPath(spec.svgPath)
    if (validationError) {
      skipped.push({ slideIndex: spec.slideIndex, reason: validationError })
      continue
    }

    const fillError = validateHexColor(spec.fill, 'fill')
    if (fillError) {
      skipped.push({ slideIndex: spec.slideIndex, reason: fillError })
      continue
    }
    const strokeError = validateHexColor(spec.stroke, 'stroke')
    if (strokeError) {
      skipped.push({ slideIndex: spec.slideIndex, reason: strokeError })
      continue
    }

    const slidePath = `ppt/slides/slide${spec.slideIndex + 1}.xml`
    const slideEntry = zip.getEntry(slidePath)
    if (!slideEntry) {
      skipped.push({ slideIndex: spec.slideIndex, reason: `幻灯片 XML 不存在: ${slidePath}` })
      continue
    }

    const relsPath = `ppt/slides/_rels/slide${spec.slideIndex + 1}.xml.rels`
    const relsEntry = zip.getEntry(relsPath)
    if (!relsEntry) {
      skipped.push({ slideIndex: spec.slideIndex, reason: `幻灯片关系文件不存在: ${relsPath}` })
      continue
    }

    mediaCounter++
    const pngNum = mediaCounter
    mediaCounter++
    const svgNum = mediaCounter

    const pngZipPath = `ppt/media/image${pngNum}.png`
    const svgZipPath = `ppt/media/image${svgNum}.svg`
    const pngRelTarget = `../media/image${pngNum}.png`
    const svgRelTarget = `../media/image${svgNum}.svg`

    // 阶段 A：收集 media 文件数据
    pendingMedia.push({ path: pngZipPath, data: Buffer.from(TRANSPARENT_PNG_1X1_BASE64, 'base64') })
    const svgContent = buildSvgDocument(spec)
    pendingMedia.push({ path: svgZipPath, data: Buffer.from(svgContent, 'utf-8') })

    // 分配 rId
    const maxRid = slideRelsMap.get(spec.slideIndex) ?? 0
    const pngRid = maxRid + 1
    const svgRid = maxRid + 2
    slideRelsMap.set(spec.slideIndex, svgRid)

    // 分配 cNvPr id（同 slide 内唯一，从 1000 开始避开 PptxGenJS 常用区间）
    const currentCnvId = slideCnvPrIdMap.get(spec.slideIndex) ?? 999
    const cnvPrId = currentCnvId + 1
    slideCnvPrIdMap.set(spec.slideIndex, cnvPrId)

    // 阶段 A：计算 rels 更新内容（同一 slide 多次更新在 Map 中累积）
    const relsBase = pendingRelsUpdates.get(relsPath) ?? relsEntry.getData()
    const relsResult = appendSvgRelationships(relsBase.toString('utf-8'), pngRid, svgRid, pngRelTarget, svgRelTarget)
    if (!relsResult.inserted) {
      skipped.push({ slideIndex: spec.slideIndex, reason: '无法在关系文件中追加 SVG 关系（缺少 </Relationships> 标签）' })
      continue
    }
    pendingRelsUpdates.set(relsPath, Buffer.from(relsResult.xml, 'utf-8'))

    // 阶段 A：计算 slide XML 更新内容（同一 slide 多次更新在 Map 中累积）
    const slideBase = pendingSlideUpdates.get(slidePath) ?? slideEntry.getData()
    const picXml = buildPicElement(spec, pngRid, svgRid, cnvPrId)
    const slideResult = insertPicIntoSlide(slideBase.toString('utf-8'), picXml)
    if (!slideResult.inserted) {
      skipped.push({ slideIndex: spec.slideIndex, reason: '无法在幻灯片 XML 中插入 <p:pic>（缺少 spTree/cSld/sld 闭合标签）' })
      continue
    }
    pendingSlideUpdates.set(slidePath, Buffer.from(slideResult.xml, 'utf-8'))

    injectedCount++
  }

  // 阶段 B：统一写入 ZIP
  for (const m of pendingMedia) {
    zip.addFile(m.path, m.data)
  }
  for (const [path, data] of pendingRelsUpdates) {
    zip.updateFile(path, data)
  }
  for (const [path, data] of pendingSlideUpdates) {
    zip.updateFile(path, data)
  }

  const buffer = zip.toBuffer()
  return {
    buffer,
    result: { injectedCount, skipped },
  }
}

// ==================== 内部函数 ====================

/**
 * 确保 [Content_Types].xml 注册了 image/svg+xml。
 * 已存在则跳过，不存在则追加。
 */
function ensureSvgContentType(zip: AdmZip): void {
  const entry = zip.getEntry('[Content_Types].xml')
  if (!entry) {
    throw new Error('[Content_Types].xml 不存在，PPTX 文件可能已损坏')
  }

  const xml = entry.getData().toString('utf-8')

  // 已注册 svg 则跳过
  if (xml.includes('Extension="svg"')) {
    return
  }

  // 在 </Types> 前追加 <Default Extension="svg" ContentType="image/svg+xml"/>
  const updated = xml.replace(
    /<\/Types>/,
    '<Default Extension="svg" ContentType="image/svg+xml"/></Types>',
  )

  zip.updateFile('[Content_Types].xml', Buffer.from(updated, 'utf-8'))
}

/**
 * 查找 ppt/media/ 中最大的 imageN 编号。
 */
function getMaxMediaFileNumber(zip: AdmZip): number {
  let maxNum = 0
  for (const entry of zip.getEntries()) {
    const match = entry.entryName.match(/^ppt\/media\/image(\d+)\.(png|jpg|jpeg|gif|bmp|svg|emf|wmf|tif|tiff)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      if (num > maxNum) maxNum = num
    }
  }
  return maxNum
}

/**
 * 为每张幻灯片构建当前最大 rId 映射。
 */
function buildSlideRelsMap(zip: AdmZip): Map<number, number> {
  const map = new Map<number, number>()
  for (const entry of zip.getEntries()) {
    const match = entry.entryName.match(/^ppt\/slides\/_rels\/slide(\d+)\.xml\.rels$/)
    if (!match) continue

    const slideIndex = parseInt(match[1], 10) - 1
    const xml = entry.getData().toString('utf-8')

    // 查找所有 Id="rIdN" 并取最大值
    const ridMatches = xml.matchAll(/Id="rId(\d+)"/g)
    let maxRid = 0
    for (const m of ridMatches) {
      const rid = parseInt(m[1], 10)
      if (rid > maxRid) maxRid = rid
    }
    map.set(slideIndex, maxRid)
  }
  return map
}

/**
 * 在 slideN.xml.rels 中追加 PNG 和 SVG 两条 image 关系。
 *
 * 关键约束（来自 OOXML 规范）：
 * - 关系类型必须用标准 RT.IMAGE（http://schemas.openxmlformats.org/officeDocument/2006/relationships/image）
 * - 不能用自定义的 svgBlip 关系类型，否则 PowerPoint 拒绝加载
 */
function appendSvgRelationships(
  relsXml: string,
  pngRid: number,
  svgRid: number,
  pngTarget: string,
  svgTarget: string,
): { xml: string; inserted: boolean } {
  const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'

  if (!relsXml.includes('</Relationships>')) {
    return { xml: relsXml, inserted: false }
  }

  const pngRel = `<Relationship Id="rId${pngRid}" Type="${IMAGE_REL_TYPE}" Target="${pngTarget}"/>`
  const svgRel = `<Relationship Id="rId${svgRid}" Type="${IMAGE_REL_TYPE}" Target="${svgTarget}"/>`

  const xml = relsXml.replace(
    /<\/Relationships>/,
    `${pngRel}${svgRel}</Relationships>`,
  )
  return { xml, inserted: true }
}

/**
 * 构建 `<p:pic>` XML 元素（含 ASVG 扩展）。
 *
 * 结构（来自 OOXML 规范和社区实现验证）：
 * <p:pic>
 *   <p:nvPicPr>
 *     <p:cNvPr id="N" name="SVG Element"/>
 *     <p:cNvPicPr preferRelativeResize="0"/>
 *     <p:nvPr/>
 *   </p:nvPicPr>
 *   <p:blipFill>
 *     <a:blip r:embed="rIdPNG">      ← PNG fallback（OOXML 规范硬要求）
 *       <a:extLst>
 *         <a:ext uri="{96DAC541-...}">
 *           <asvg:svgBlip r:embed="rIdSVG"/>  ← SVG 矢量 overlay
 *         </a:ext>
 *       </a:extLst>
 *     </a:blip>
 *     <a:stretch><a:fillRect/></a:stretch>
 *   </p:blipFill>
 *   <p:spPr>
 *     <a:xfrm><a:off x="EMU" y="EMU"/><a:ext cx="EMU" cy="EMU"/></a:xfrm>
 *     <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
 *   </p:spPr>
 * </p:pic>
 */
function buildPicElement(spec: SvgElementSpec, pngRid: number, svgRid: number, cnvPrId: number): string {
  const cx = Math.round(spec.w * EMU_PER_INCH)
  const cy = Math.round(spec.h * EMU_PER_INCH)
  const offX = Math.round(spec.x * EMU_PER_INCH)
  const offY = Math.round(spec.y * EMU_PER_INCH)

  return `<p:pic>` +
    `<p:nvPicPr>` +
    `<p:cNvPr id="${cnvPrId}" name="AE SVG Element"/>` +
    `<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>` +
    `<p:nvPr/>` +
    `</p:nvPicPr>` +
    `<p:blipFill>` +
    `<a:blip r:embed="rId${pngRid}">` +
    `<a:extLst>` +
    `<a:ext uri="${USE_LOCAL_DPI_EXT_URI}">` +
    `<a14:useLocalDpi xmlns:a14="${A14_NS_URI}" val="0"/>` +
    `</a:ext>` +
    `<a:ext uri="${ASVG_EXT_URI}">` +
    `<asvg:svgBlip xmlns:asvg="${ASVG_NS_URI}" r:embed="rId${svgRid}"/>` +
    `</a:ext>` +
    `</a:extLst>` +
    `</a:blip>` +
    `<a:stretch><a:fillRect/></a:stretch>` +
    `</p:blipFill>` +
    `<p:spPr>` +
    `<a:xfrm><a:off x="${offX}" y="${offY}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>` +
    `</p:spPr>` +
    `</p:pic>`
}

/**
 * 将 <p:pic> 元素插入到 slideN.xml 的正确位置。
 *
 * slideN.xml 结构：
 * <p:sld>
 *   <p:cSld>
 *     <p:spTree>
 *       <p:nvGrpSpPr>...</p:nvGrpSpPr>
 *       <p:grpSpPr>...</p:grpSpPr>
 *       <!-- 其他元素在此追加 -->
 *     </p:spTree>
 *   </p:cSld>
 * </p:sld>
 *
 * 插入点：在 </p:spTree> 之前追加 <p:pic>。
 */
function insertPicIntoSlide(slideXml: string, picXml: string): { xml: string; inserted: boolean } {
  if (slideXml.includes('</p:spTree>')) {
    return { xml: slideXml.replace('</p:spTree>', picXml + '</p:spTree>'), inserted: true }
  }
  if (slideXml.includes('</p:cSld>')) {
    return { xml: slideXml.replace('</p:cSld>', picXml + '</p:cSld>'), inserted: true }
  }
  if (slideXml.includes('</p:sld>')) {
    return { xml: slideXml.replace('</p:sld>', picXml + '</p:sld>'), inserted: true }
  }
  return { xml: slideXml, inserted: false }
}

/**
 * 从 PptxInputElement 的 SVG 元素中提取 SvgElementSpec。
 * 由 pptx-service.ts 调用，将 SVG 元素收集后传入注入器。
 */
export interface SvgSpecExtractionResult {
  specs: SvgElementSpec[]
  skipped: { slideIndex: number; reason: string }[]
}

/**
 * 从 PptxInputElement 的 SVG 元素中提取 SvgElementSpec。
 * 返回提取的规格列表和被跳过元素的原因（静默跳过改为显式报告）。
 */
export function extractSvgSpecs(
  slides: readonly { elements?: readonly PptxInputElementLike[] }[],
): SvgSpecExtractionResult {
  const specs: SvgElementSpec[] = []
  const skipped: { slideIndex: number; reason: string }[] = []

  for (let slideIdx = 0; slideIdx < slides.length; slideIdx++) {
    const slide = slides[slideIdx]
    if (!slide.elements) continue

    for (const el of slide.elements) {
      if (el.type !== 'svg') continue

      // 使用 Number() 做运行时转换，避免 as 断言掩盖字符串值导致 NaN
      const x = typeof el.x === 'string' ? Number(el.x) : el.x
      const y = typeof el.y === 'string' ? Number(el.y) : el.y
      const w = typeof el.w === 'string' ? Number(el.w) : el.w
      const h = typeof el.h === 'string' ? Number(el.h) : el.h
      const svgPath = el.svgPath

      // 逐字段报告缺失原因，不再静默跳过
      if (x === undefined || Number.isNaN(x)) {
        skipped.push({ slideIndex: slideIdx, reason: 'SVG 元素缺少 x 坐标或非数字' })
        continue
      }
      if (y === undefined || Number.isNaN(y)) {
        skipped.push({ slideIndex: slideIdx, reason: 'SVG 元素缺少 y 坐标或非数字' })
        continue
      }
      if (w === undefined || Number.isNaN(w)) {
        skipped.push({ slideIndex: slideIdx, reason: 'SVG 元素缺少 w 宽度或非数字' })
        continue
      }
      if (h === undefined || Number.isNaN(h)) {
        skipped.push({ slideIndex: slideIdx, reason: 'SVG 元素缺少 h 高度或非数字' })
        continue
      }
      if (!svgPath) {
        skipped.push({ slideIndex: slideIdx, reason: 'SVG 元素缺少 svgPath 路径数据' })
        continue
      }

      specs.push({
        slideIndex: slideIdx,
        x, y, w, h,
        svgPath,
        fill: el.svgFill,
        stroke: el.stroke,
        strokeWidth: el.strokeWidth,
        viewBoxW: el.viewBoxW,
        viewBoxH: el.viewBoxH,
      })
    }
  }

  return { specs, skipped }
}

interface PptxInputElementLike {
  type: string
  x?: number | string
  y?: number | string
  w?: number | string
  h?: number | string
  svgPath?: string
  svgFill?: string
  stroke?: string
  strokeWidth?: number
  viewBoxW?: number
  viewBoxH?: number
}
