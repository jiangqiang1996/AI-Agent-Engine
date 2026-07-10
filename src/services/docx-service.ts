import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path, { join } from 'node:path'

import AdmZip from 'adm-zip'
import { withBackup } from '../utils/file-backup.js'
import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  NumberFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  ThematicBreak,
  UnderlineType,
  VerticalAlign,
  VerticalMerge,
  VerticalMergeType,
  WidthType,
} from 'docx'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'
import {
  escapeXml,
  DocxContentBlock,
  DocxInput,
  DocxResult,
  buildBlock,
  buildSection,
} from './docx-block-builder.js'
import { handleMerge, handleSplit } from './docx-merge-split.js'
import { convertDocxToMarkdown } from './docx-markdown-converter.js'
import { loadDocumentFile } from './document-file-loader.js'
import { writeMarkdownOutput } from './markdown-output-writer.js'
import { detectLibreOffice, convertToImagesViaPdf, resolveLibreofficeConfigPath } from './libreoffice-service.js'

export type { DocxOperation, DocxInput, DocxResult, DocxContentBlock, DocxRunStyle, DocxHyperlinkRun, DocxTableCellStyle, DocxTableCell, DocxSectionProps, DocxDocumentMeta } from './docx-block-builder.js'

// ==================== create 操作 ====================

async function handleCreate(input: DocxInput): Promise<DocxResult> {
  const blocks = input.blocks
  if (!blocks) {
    throw new Error('create 操作需要 blocks 参数')
  }
  const children: (Paragraph | Table)[] = blocks.map(buildBlock)
  if (input.title) {
    children.unshift(
      new Paragraph({
        text: input.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
    )
  }

  // 单节或多节
  const sections = input.sections && input.sections.length > 0
    ? input.sections.map((sp, i) => buildSection(sp, i === 0 ? children : []))
    : [buildSection(undefined, children)]

  const docProps: Record<string, unknown> = { sections }

  // 编号列表定义
  const hasNumbered = blocks.some((b) => b.type === 'numbered')
  if (hasNumbered) {
    docProps.numbering = {
      config: [
        {
          reference: 'ae-numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    }
  }

  // 文档元数据
  if (input.documentMeta) {
    if (input.documentMeta.title || input.title) docProps.title = input.documentMeta.title ?? input.title
    if (input.documentMeta.creator) docProps.creator = input.documentMeta.creator
    if (input.documentMeta.subject) docProps.subject = input.documentMeta.subject
    if (input.documentMeta.description) docProps.description = input.documentMeta.description
    if (input.documentMeta.keywords) docProps.keywords = input.documentMeta.keywords
    if (input.documentMeta.category) docProps.category = input.documentMeta.category
    if (input.documentMeta.lastModifiedBy) docProps.lastModifiedBy = input.documentMeta.lastModifiedBy
    if (input.documentMeta.revision !== undefined) docProps.revision = input.documentMeta.revision
  } else if (input.title) {
    docProps.title = input.title
  }

  const doc = new Document(docProps as ConstructorParameters<typeof Document>[0])

  const buffer = await Packer.toBuffer(doc)
  const outputPath =
    input.outputPath ?? generateDocumentOutputPath(input.worktree, 'create', 'docx', input.title)
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, buffer)

  return {
    outputPath,
    summary: `已创建 DOCX 文件，包含 ${blocks.length} 个内容块`,
    blockCount: blocks.length,
  }
}

// ==================== edit 操作 ====================

function handleEdit(input: DocxInput): DocxResult {
  const file = input.file
  const replacements = input.replacements
  if (!file) {
    throw new Error('edit 操作需要 file 参数')
  }
  if (!replacements) {
    throw new Error('edit 操作需要 replacements 参数')
  }
  const zip = new AdmZip(file)
  const documentEntry = zip.getEntry('word/document.xml')
  if (!documentEntry) {
    throw new Error('文件不是有效的 DOCX：缺少 word/document.xml')
  }
  const documentXml = documentEntry.getData().toString('utf8')

  let modified = documentXml
  let replacementCount = 0
  for (const { find, replace } of replacements) {
    const escapedFind = escapeXml(find)
    const escapedReplace = escapeXml(replace)
    if (modified.includes(escapedFind)) {
      modified = modified.split(escapedFind).join(escapedReplace)
      replacementCount++
    }
  }

  zip.updateFile('word/document.xml', Buffer.from(modified, 'utf8'))
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    zip.writeZip(outputPath)
  } else {
    withBackup(file, () => zip.writeZip(outputPath))
  }

  return {
    outputPath,
    summary: `已编辑 DOCX 文件，执行 ${replacementCount}/${replacements.length} 处替换`,
  }
}

// ==================== analyze 操作 ====================

function handleAnalyze(input: DocxInput): DocxResult {
  const file = input.file
  if (!file) {
    throw new Error('analyze 操作需要 file 参数')
  }
  const zip = new AdmZip(file)
  const documentEntry = zip.getEntry('word/document.xml')
  if (!documentEntry) {
    throw new Error('文件不是有效的 DOCX：缺少 word/document.xml')
  }
  const documentXml = documentEntry.getData().toString('utf8')

  const textMatches = documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) ?? []
  const textContent = textMatches
    .map((m: string) => m.replace(/<[^>]+>/g, ''))
    .join('')
    .replace(/\.([A-Z])/g, '.\n$1')

  const paragraphCount = (documentXml.match(/<w:p[\s>]/g) ?? []).length
  const tableCount = (documentXml.match(/<w:tbl[\s>]/g) ?? []).length

  return {
    summary: `分析完成：约 ${paragraphCount} 段落，${tableCount} 表格`,
    content: textContent.slice(0, 8000),
  }
}

// ==================== track-changes 操作 ====================

function handleTrackChanges(input: DocxInput): DocxResult {
  const file = input.file
  const changes = input.changes
  if (!file) {
    throw new Error('track-changes 操作需要 file 参数')
  }
  if (!changes) {
    throw new Error('track-changes 操作需要 changes 参数')
  }
  const zip = new AdmZip(file)
  const documentEntry = zip.getEntry('word/document.xml')
  if (!documentEntry) {
    throw new Error('文件不是有效的 DOCX：缺少 word/document.xml')
  }
  let xml = documentEntry.getData().toString('utf8')

  let changeCount = 0
  for (const { find, replace } of changes) {
    const escapedFind = escapeXml(find)
    const escapedReplace = escapeXml(replace)
    if (xml.includes(escapedFind)) {
      xml = xml.split(escapedFind).join(
        `</w:t></w:r><w:del><w:r><w:delText>${escapedFind}</w:delText></w:r></w:del>` +
          `<w:ins><w:r><w:t>${escapedReplace}</w:t></w:r></w:ins><w:r><w:t xml:space="preserve">`,
      )
      changeCount++
    }
  }

  zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'))
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    zip.writeZip(outputPath)
  } else {
    withBackup(file, () => zip.writeZip(outputPath))
  }

  return {
    outputPath,
    summary: `已添加修订标记，${changeCount}/${changes.length} 处变更被标记`,
  }
}

// ==================== 增量操作辅助 ====================

/** 创建临时 Document 并打包为 Buffer，用于提取指定 blocks 的 XML */
async function packTempBlocks(blocks: DocxContentBlock[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = blocks.map(buildBlock)
  const hasNumbered = blocks.some((b) => b.type === 'numbered')
  const docProps: Record<string, unknown> = {
    sections: [{ children }],
  }
  if (hasNumbered) {
    docProps.numbering = {
      config: [
        {
          reference: 'ae-numbered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    }
  }
  const doc = new Document(docProps as ConstructorParameters<typeof Document>[0])
  return Packer.toBuffer(doc)
}

/** 从临时 DOCX Buffer 中提取 <w:body> 内部的 XML 内容（不含开闭标签本身） */
function extractBodyInnerXml(tempBuffer: Buffer): string {
  const tempZip = new AdmZip(tempBuffer)
  const tempDocEntry = tempZip.getEntry('word/document.xml')
  if (!tempDocEntry) {
    throw new Error('临时 DOCX 缺少 word/document.xml')
  }
  const tempXml = tempDocEntry.getData().toString('utf8')

  // 提取 <w:body>...</w:body> 内部内容
  const bodyStartMatch = tempXml.match(/<w:body[^>]*>/)
  const bodyEndMatch = tempXml.match(/<\/w:body>/)
  if (!bodyStartMatch || !bodyEndMatch) {
    throw new Error('临时 DOCX 缺少 <w:body> 标签')
  }
  const startIndex = bodyStartMatch.index! + bodyStartMatch[0].length
  const endIndex = bodyEndMatch.index!
  return tempXml.slice(startIndex, endIndex)
}

/** 将临时 DOCX 中的图片资源和关系合并到目标 DOCX。
 * 返回图片数量和 rId 映射（临时 rId → 目标新 rId），供调用方仅在新插入内容中替换 rId。 */
function mergeImageResources(tempBuffer: Buffer, targetZip: AdmZip): { imageCount: number; rIdMapping: Map<string, string> } {
  const tempZip = new AdmZip(tempBuffer)
  let imageCount = 0
  const rIdMapping = new Map<string, string>()

  // 使用单一时间戳避免分离 Date.now() 导致 ZIP 文件名与 rels Target 不匹配
  const renameTimestamp = Date.now()

  // 复制 word/media/ 下的图片文件（嵌入图片）
  const mediaEntries = tempZip.getEntries().filter(
    (e) => e.entryName.startsWith('word/media/') && !e.entryName.endsWith('/'),
  )

  // 构建重命名映射：ZIP 全路径 → 新 ZIP 全路径（冲突时加时间戳前缀）
  // 同时维护 rels Target 映射：原始 rels Target → 新 rels Target（去掉 word/ 前缀）
  const zipPathToNewZipPath = new Map<string, string>()
  const relsTargetToNewRelsTarget = new Map<string, string>()
  for (const mediaEntry of mediaEntries) {
    const existingEntry = targetZip.getEntry(mediaEntry.entryName)
    if (existingEntry) {
      // 冲突：重命名媒体文件
      const fileName = mediaEntry.entryName.replace('word/media/', '')
      const newZipPath = `word/media/${renameTimestamp}-${fileName}`
      // OOXML rels Target 相对于 word/ 目录，不含 word/ 前缀
      const originalRelsTarget = `media/${fileName}`
      const newRelsTarget = `media/${renameTimestamp}-${fileName}`
      zipPathToNewZipPath.set(mediaEntry.entryName, newZipPath)
      relsTargetToNewRelsTarget.set(originalRelsTarget, newRelsTarget)
      targetZip.addFile(newZipPath, mediaEntry.getData())
    } else {
      targetZip.addFile(mediaEntry.entryName, mediaEntry.getData())
    }
    imageCount++
  }

  // 合并 word/_rels/document.xml.rels 中的图片关系（嵌入图片 + 外链图片）
  const tempRelsEntry = tempZip.getEntry('word/_rels/document.xml.rels')
  if (tempRelsEntry) {
    const tempRelsXml = tempRelsEntry.getData().toString('utf8')
    // 嵌入图片关系：Target="media/..."
    const embeddedImageRels = tempRelsXml.match(/<Relationship[^>]*Target="media\/[^"]*"[^>]*\/>/g) ?? []
    // 外链图片关系：TargetMode="External" + Type 包含 image
    const externalImageRels = tempRelsXml.match(/<Relationship[^>]*TargetMode="External"[^>]*Type="[^"]*image[^"]*"[^>]*\/>/g) ?? []
    // 也匹配属性顺序不同的外链图片（Type 在 TargetMode 前面）
    const externalImageRelsAlt = tempRelsXml.match(/<Relationship[^>]*Type="[^"]*image[^"]*"[^>]*TargetMode="External"[^>]*\/>/g) ?? []
    const allImageRels = [...embeddedImageRels, ...externalImageRels, ...externalImageRelsAlt]

    const hasImageRels = allImageRels.length > 0
    if (hasImageRels) {
      const targetRelsEntry = targetZip.getEntry('word/_rels/document.xml.rels')
      if (targetRelsEntry) {
        let targetRelsXml = targetRelsEntry.getData().toString('utf8')

        const existingRIds = targetRelsXml.match(/Id="rId(\d+)"/g) ?? []
        const maxRIdNum = existingRIds.reduce((max: number, match: string) => {
          const num = parseInt(match.match(/\d+/)?.[0] ?? '0', 10)
          return num > max ? num : max
        }, 0)

        let nextRId = maxRIdNum + 1
        const seenTempRIds = new Set<string>()
        for (const relMatch of allImageRels) {
          const isImageRel = /Type="[^"]*image[^"]*"/.test(relMatch)
          if (!isImageRel) continue

          const tempRIdMatch = relMatch.match(/Id="rId(\d+)"/)
          const tempRId = tempRIdMatch ? `rId${tempRIdMatch[1]}` : `rId${nextRId}`
          if (seenTempRIds.has(tempRId)) continue
          seenTempRIds.add(tempRId)

          const isExternal = /TargetMode="External"/.test(relMatch)
          const targetMatch = relMatch.match(/Target="([^"]*)"/)
          const originalTarget = targetMatch ? targetMatch[1] : ''

          // 嵌入图片：冲突时使用重命名后的 rels Target（不含 word/ 前缀）
          // OOXML rels Target 相对于 word/ 目录，所以不含 word/ 前缀
          const resolvedTarget = isExternal
            ? originalTarget
            : (relsTargetToNewRelsTarget.get(originalTarget) ?? originalTarget)

          const newRId = `rId${nextRId}`
          rIdMapping.set(tempRId, newRId)
          const typeMatch = relMatch.match(/Type="([^"]*)"/)
          const newRel = isExternal
            ? `<Relationship Id="${newRId}" Type="${typeMatch?.[1] ?? ''}" Target="${resolvedTarget}" TargetMode="External"/>`
            : `<Relationship Id="${newRId}" Type="${typeMatch?.[1] ?? ''}" Target="${resolvedTarget}"/>`
          targetRelsXml = targetRelsXml.replace('</Relationships>', `${newRel}</Relationships>`)

          nextRId++
          if (!isExternal) {
            imageCount++
          }
        }

        targetZip.updateFile('word/_rels/document.xml.rels', Buffer.from(targetRelsXml, 'utf8'))
      }
    }
  }

  // 合并 [Content_Types].xml 中的图片内容类型
  if (imageCount > 0) {
    const contentTypesEntry = targetZip.getEntry('[Content_Types].xml')
    if (contentTypesEntry) {
      let contentTypesXml = contentTypesEntry.getData().toString('utf8')
      const tempContentTypesEntry = tempZip.getEntry('[Content_Types].xml')
      if (tempContentTypesEntry) {
        const tempContentTypesXml = tempContentTypesEntry.getData().toString('utf8')
        const imageContentTypeMatches = tempContentTypesXml.match(/<Default[^>]*Extension="(png|jpg|jpeg|gif|bmp|tif|tiff)"[^>]*\/>/g) ?? []
        for (const contentTypeMatch of imageContentTypeMatches) {
          const extMatch = contentTypeMatch.match(/Extension="([^"]*)"/)
          if (extMatch && !contentTypesXml.includes(`Extension="${extMatch[1]}"`)) {
            contentTypesXml = contentTypesXml.replace('</Types>', `${contentTypeMatch}</Types>`)
          }
        }
      }
      targetZip.updateFile('[Content_Types].xml', Buffer.from(contentTypesXml, 'utf8'))
    }
  }

  return { imageCount, rIdMapping }
}

/** 在 body XML 中查找顶层内容块元素（<w:p>, <w:tbl>, <w:sdt> 等）的起始位置列表。
 * 使用栈式解析确保嵌套的同名标签（如 <w:p> 内嵌套 <w:p>）不误判为顶层块。 */
function findTopLevelBlockPositions(xml: string): { startIndex: number; endIndex: number }[] {
  const positions: { startIndex: number; endIndex: number }[] = []
  const blockTags = new Set(['w:p', 'w:tbl', 'w:sdt'])
  const stack: { tag: string; startIndex: number }[] = []
  const openRegex = /<(w:\w+)[\s>\/]/g
  const closeRegex = /<\/(w:\w+)>/g

  const openTags: { index: number; tag: string }[] = []
  let m: RegExpExecArray | null
  while ((m = openRegex.exec(xml)) !== null) {
    if (blockTags.has(m[1])) {
      openTags.push({ index: m.index, tag: m[1] })
    }
  }
  const closeTags: { index: number; endIndex: number; tag: string }[] = []
  while ((m = closeRegex.exec(xml)) !== null) {
    if (blockTags.has(m[1])) {
      closeTags.push({ index: m.index, endIndex: m.index + m[0].length, tag: m[1] })
    }
  }

  let oi = 0
  let ci = 0
  while (oi < openTags.length || ci < closeTags.length) {
    const nextOpen = oi < openTags.length ? openTags[oi].index : Infinity
    const nextClose = ci < closeTags.length ? closeTags[ci].index : Infinity

    if (nextOpen < nextClose) {
      stack.push({ tag: openTags[oi].tag, startIndex: openTags[oi].index })
      oi++
    } else {
      const close = closeTags[ci]
      const top = stack.at(-1)
      if (top && top.tag === close.tag) {
        stack.pop()
        if (stack.length === 0) {
          positions.push({ startIndex: top.startIndex, endIndex: close.endIndex })
        }
      }
      ci++
    }
  }

  positions.sort((a, b) => a.startIndex - b.startIndex)
  return positions
}

// ==================== append-blocks 操作 ====================

async function handleAppendBlocks(input: DocxInput): Promise<DocxResult> {
  const file = input.file
  const blocks = input.blocks
  if (!file) {
    throw new Error('append-blocks 操作需要 file 参数')
  }
  if (!blocks || blocks.length === 0) {
    throw new Error('append-blocks 操作需要 blocks 参数且不能为空')
  }

  // 创建临时 Document 并打包
  const tempBuffer = await packTempBlocks(blocks)
  const newBodyXml = extractBodyInnerXml(tempBuffer)

  // 打开已有 DOCX
  const zip = new AdmZip(file)
  const documentEntry = zip.getEntry('word/document.xml')
  if (!documentEntry) {
    throw new Error('文件不是有效的 DOCX：缺少 word/document.xml')
  }
  const documentXml = documentEntry.getData().toString('utf8')

  // 在 </w:body> 前插入新内容
  const bodyCloseTag = '</w:body>'
  const bodyCloseIndex = documentXml.indexOf(bodyCloseTag)
  if (bodyCloseIndex === -1) {
    throw new Error('无法找到 <w:body> 结束标签')
  }

  let modifiedXml = documentXml.slice(0, bodyCloseIndex) + newBodyXml + documentXml.slice(bodyCloseIndex)

  // 合并图片资源并获取 rId 映射（临时 rId → 目标新 rId）
  const { imageCount, rIdMapping } = mergeImageResources(tempBuffer, zip)

  // 仅在新插入内容（newBodyXml）中将临时 rId 替换为目标 rId，不影响已有文档内容
  let replacedNewBodyXml = newBodyXml
  if (rIdMapping.size > 0) {
    for (const [tempRId, newRId] of rIdMapping) {
      replacedNewBodyXml = replacedNewBodyXml.split(`r:id="${tempRId}"`).join(`r:id="${newRId}"`)
      replacedNewBodyXml = replacedNewBodyXml.split(`r:embed="${tempRId}"`).join(`r:embed="${newRId}"`)
      replacedNewBodyXml = replacedNewBodyXml.split(`r:link="${tempRId}"`).join(`r:link="${newRId}"`)
    }
    // 用替换后的 newBodyXml 重建 modifiedXml
    modifiedXml = documentXml.slice(0, bodyCloseIndex) + replacedNewBodyXml + documentXml.slice(bodyCloseIndex)
  }

  zip.updateFile('word/document.xml', Buffer.from(modifiedXml, 'utf8'))
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    zip.writeZip(outputPath)
  } else {
    withBackup(file, () => zip.writeZip(outputPath))
  }

  return {
    outputPath,
    summary: `已追加 ${blocks.length} 个内容块${imageCount > 0 ? `，包含 ${imageCount} 张图片` : ''}`,
    blockCount: blocks.length,
  }
}

// ==================== update-block 操作 ====================

async function handleUpdateBlock(input: DocxInput): Promise<DocxResult> {
  const file = input.file
  const blockIndex = input.blockIndex
  const block = input.block
  if (!file) {
    throw new Error('update-block 操作需要 file 参数')
  }
  if (blockIndex === undefined || blockIndex < 0) {
    throw new Error('update-block 操作需要 blockIndex 参数（0-based 索引）')
  }
  if (!block) {
    throw new Error('update-block 操作需要 block 参数')
  }

  // 创建临时 Document 并打包
  const tempBuffer = await packTempBlocks([block])
  const newBodyXml = extractBodyInnerXml(tempBuffer)

  // 打开已有 DOCX
  const zip = new AdmZip(file)
  const documentEntry = zip.getEntry('word/document.xml')
  if (!documentEntry) {
    throw new Error('文件不是有效的 DOCX：缺少 word/document.xml')
  }
  const documentXml = documentEntry.getData().toString('utf8')

  // 提取 <w:body> 内部 XML 以查找块位置
  const bodyStartMatch = documentXml.match(/<w:body[^>]*>/)
  const bodyEndMatch = documentXml.match(/<\/w:body>/)
  if (!bodyStartMatch || !bodyEndMatch) {
    throw new Error('无法找到 <w:body> 标签')
  }
  const bodyInnerStart = bodyStartMatch.index! + bodyStartMatch[0].length
  const bodyInnerEnd = bodyEndMatch.index!
  const bodyInnerXml = documentXml.slice(bodyInnerStart, bodyInnerEnd)

  // 查找顶层块位置
  const blockPositions = findTopLevelBlockPositions(bodyInnerXml)

  if (blockIndex >= blockPositions.length) {
    throw new Error(`blockIndex ${blockIndex} 超出范围，文档共有 ${blockPositions.length} 个内容块`)
  }

  const targetBlock = blockPositions[blockIndex]

  // 替换指定块
  const beforeBlock = bodyInnerXml.slice(0, targetBlock.startIndex)
  const afterBlock = bodyInnerXml.slice(targetBlock.endIndex)

  // 从临时 XML 提取新块内容（去掉 sectPr 等尾部非块内容）
  // 临时 body 内 XML 可能包含 <w:sectPr> 等节属性，只取内容块
  const tempBlockPositions = findTopLevelBlockPositions(newBodyXml)
  if (tempBlockPositions.length === 0) {
    throw new Error('新内容块未能生成有效 XML')
  }
  const newBlockXml = newBodyXml.slice(
    tempBlockPositions[0].startIndex,
    tempBlockPositions[0].endIndex,
  )

  const newBodyInnerXml = beforeBlock + newBlockXml + afterBlock

  // 重建完整 document.xml
  const prefix = documentXml.slice(0, bodyInnerStart)
  const suffix = documentXml.slice(bodyInnerEnd)
  let modifiedXml = prefix + newBodyInnerXml + suffix

  // 合并图片资源并获取 rId 映射（临时 rId → 目标新 rId）
  const { imageCount, rIdMapping } = mergeImageResources(tempBuffer, zip)

  // 仅在新替换内容（newBlockXml）中将临时 rId 替换为目标 rId，不影响已有文档内容
  let replacedNewBlockXml = newBlockXml
  if (rIdMapping.size > 0) {
    for (const [tempRId, newRId] of rIdMapping) {
      replacedNewBlockXml = replacedNewBlockXml.split(`r:id="${tempRId}"`).join(`r:id="${newRId}"`)
      replacedNewBlockXml = replacedNewBlockXml.split(`r:embed="${tempRId}"`).join(`r:embed="${newRId}"`)
      replacedNewBlockXml = replacedNewBlockXml.split(`r:link="${tempRId}"`).join(`r:link="${newRId}"`)
    }
    // 用替换后的 newBlockXml 重建 bodyInnerXml 和 modifiedXml
    const newBodyInnerXmlReplaced = beforeBlock + replacedNewBlockXml + afterBlock
    modifiedXml = prefix + newBodyInnerXmlReplaced + suffix
  }

  zip.updateFile('word/document.xml', Buffer.from(modifiedXml, 'utf8'))
  const outputPath = input.outputPath ?? file
  if (outputPath !== file) {
    mkdirSync(path.dirname(outputPath), { recursive: true })
    zip.writeZip(outputPath)
  } else {
    withBackup(file, () => zip.writeZip(outputPath))
  }

  return {
    outputPath,
    summary: `已更新第 ${blockIndex} 个内容块${imageCount > 0 ? `，包含 ${imageCount} 张图片` : ''}`,
  }
}

// ==================== 入口 ====================

export async function processDocx(input: DocxInput): Promise<DocxResult> {
  const { resolveDocumentPath } = await import('./document-file-loader.js')
  const resolvedInput = { ...input }
  if (input.file) {
    try {
      resolvedInput.file = await resolveDocumentPath(input.file, input.worktree)
    } catch {
      // 路径不存在时保留原始值，让 handler 的参数校验先执行
    }
  }
  if (input.files && input.files.length > 0) {
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
    case 'track-changes':
      return handleTrackChanges(resolvedInput)
    case 'append-blocks':
      return handleAppendBlocks(resolvedInput)
    case 'update-block':
      return handleUpdateBlock(resolvedInput)
    case 'merge':
      return handleMerge(resolvedInput)
    case 'split':
      return handleSplit(resolvedInput)
    case 'to-markdown':
      return handleToMarkdown(resolvedInput)
    case 'to-image':
      return handleToImage(resolvedInput)
  }
}

async function handleToMarkdown(input: DocxInput): Promise<DocxResult> {
  if (!input.file) throw new Error('to-markdown 操作需要 file 参数')
  const { buffer } = await loadDocumentFile(input.file, input.worktree, 'DOCX')
  const result = await convertDocxToMarkdown(buffer)
  return writeMarkdownOutput(result.markdown, input.worktree, 'docx', input.outputPath, input.outputMode)
}

async function handleToImage(input: DocxInput): Promise<DocxResult> {
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
    return { summary: 'DOCX 转图片失败：未生成任何图片文件', content: '' }
  }
  const imageList = images.map(p => {
    const match = p.match(/page_(\d+)\.png$/)
    const pageNum = match ? parseInt(match[1]) : 0
    return `第 ${pageNum} 页: ${p}`
  }).join('\n')
  return {
    summary: `DOCX 转图片完成，生成 ${images.length} 张页面图片`,
    content: imageList,
    outputPath: outputDir,
  }
}
