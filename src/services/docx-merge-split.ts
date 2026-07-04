import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import AdmZip from 'adm-zip'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'

import type { DocxInput, DocxResult } from './docx-block-builder.js'

// ==================== merge ====================

export async function handleMerge(input: DocxInput): Promise<DocxResult> {
  const files = input.files
  if (!files || files.length < 2) {
    throw new Error('merge 操作需要至少 2 个文件路径')
  }

  const baseZip = new AdmZip(files[0])
  const baseDocXml = baseZip.readAsText('word/document.xml')
  if (!baseDocXml) {
    throw new Error(`基础文件 "${files[0]}" 不是有效的 DOCX：缺少 word/document.xml`)
  }

  const baseBodyMatch = baseDocXml.match(/<w:body>([\s\S]*?)<\/w:body>/)
  if (!baseBodyMatch) {
    throw new Error(`基础文件 "${files[0]}" 不是有效的 DOCX：缺少 <w:body> 内容`)
  }
  let mergedBodyContent = baseBodyMatch[1].replace(/<w:sectPr[\s\S]*?(?:<\/w:sectPr>|\/>)/g, '')

  // 收集基础文档已存在的 rels Id 和已使用的最大 rId
  const baseRelsXml = baseZip.readAsText('word/_rels/document.xml.rels') ?? ''
  let maxRid = 0
  for (const m of baseRelsXml.matchAll(/<Relationship\s+([^>]*?)\/>/g)) {
    const attrs = m[1]
    const idMatch = attrs.match(/Id="([^"]+)"/)
    if (idMatch) {
      const num = parseInt(idMatch[1].replace(/^rId/, ''))
      if (num > maxRid) maxRid = num
    }
  }

  for (let i = 1; i < files.length; i++) {
    const srcZip = new AdmZip(files[i])
    const srcDocXml = srcZip.readAsText('word/document.xml')
    if (!srcDocXml) {
      throw new Error(`源文件 "${files[i]}" 不是有效的 DOCX：缺少 word/document.xml`)
    }

    const bodyMatch = srcDocXml.match(/<w:body>([\s\S]*?)<\/w:body>/)
    if (!bodyMatch) {
      throw new Error(`源文件 "${files[i]}" 不是有效的 DOCX：缺少 <w:body> 内容`)
    }
    let bodyContent = bodyMatch[1]

    bodyContent = bodyContent.replace(/<w:sectPr[\s\S]*?(?:<\/w:sectPr>|\/>)/g, '')

    // 解析源文档 rels，建立 rId 映射表
    const srcRelsXml = srcZip.readAsText('word/_rels/document.xml.rels') ?? ''
    const ridMapping = new Map<string, string>()

    for (const m of srcRelsXml.matchAll(/<Relationship\s+([^>]*?)\/>/g)) {
      const attrs = m[1]
      const targetMatch = attrs.match(/Target="([^"]+)"/)
      const idMatch = attrs.match(/Id="([^"]+)"/)
      if (!targetMatch || !idMatch) continue
      const srcRid = idMatch[1]
      const target = targetMatch[1]
      const relType = attrs.match(/Type="([^"]+)"/)?.[1] ?? ''

      if (target.startsWith('media/') || target.startsWith('embeddings/')) {
        const entry = srcZip.getEntry(`word/${target}`)
        if (entry) {
          if (baseZip.getEntry(`word/${target}`)) {
            maxRid++
            const newRid = `rId${maxRid}`
            ridMapping.set(srcRid, newRid)
            const newRel = `<Relationship Id="${newRid}" Type="${relType}" Target="${target}"/>`
            const updatedBaseRels = (baseZip.readAsText('word/_rels/document.xml.rels') ?? '').replace('</Relationships>', newRel + '\n</Relationships>')
            baseZip.updateFile('word/_rels/document.xml.rels', Buffer.from(updatedBaseRels))
          } else {
            baseZip.addFile(`word/${target}`, entry.getData())
            maxRid++
            const newRid = `rId${maxRid}`
            ridMapping.set(srcRid, newRid)
            const newRel = `<Relationship Id="${newRid}" Type="${relType}" Target="${target}"/>`
            const updatedBaseRels = (baseZip.readAsText('word/_rels/document.xml.rels') ?? '').replace('</Relationships>', newRel + '\n</Relationships>')
            baseZip.updateFile('word/_rels/document.xml.rels', Buffer.from(updatedBaseRels))
          }
        }
      } else if (target.startsWith('header') || target.startsWith('footer')) {
        const entry = srcZip.getEntry(`word/${target}`)
        if (entry && !baseZip.getEntry(`word/${target}`)) {
          baseZip.addFile(`word/${target}`, entry.getData())
          const headerRelsEntry = srcZip.getEntry(`word/_rels/${target}.rels`)
          if (headerRelsEntry && !baseZip.getEntry(`word/_rels/${target}.rels`)) {
            baseZip.addFile(`word/_rels/${target}.rels`, headerRelsEntry.getData())
          }
        }
        maxRid++
        const newRid = `rId${maxRid}`
        ridMapping.set(srcRid, newRid)
        const newRel = `<Relationship Id="${newRid}" Type="${relType}" Target="${target}"/>`
        const updatedBaseRels = (baseZip.readAsText('word/_rels/document.xml.rels') ?? '').replace('</Relationships>', newRel + '\n</Relationships>')
        baseZip.updateFile('word/_rels/document.xml.rels', Buffer.from(updatedBaseRels))
      }
    }

    // 将 bodyContent 中的 r:id 和 r:embed 引用按映射表重写
    for (const [oldRid, newRid] of ridMapping) {
      bodyContent = bodyContent.replaceAll(`r:id="${oldRid}"`, `r:id="${newRid}"`)
      bodyContent = bodyContent.replaceAll(`r:embed="${oldRid}"`, `r:embed="${newRid}"`)
    }

    const srcContentTypes = srcZip.readAsText('[Content_Types].xml') ?? ''
    const ctMatches = srcContentTypes.matchAll(/<Override\s+([^>]*?)\/>/g)
    for (const ctMatch of ctMatches) {
      const attrs = ctMatch[1]
      const partNameMatch = attrs.match(/PartName="([^"]*(?:media|embeddings)[^"]*)"/)
      if (!partNameMatch) continue
      const partName = partNameMatch[1]
      const baseCt = baseZip.readAsText('[Content_Types].xml')
      if (!baseCt.includes(partName)) {
        const newCt = baseCt.replace('</Types>', ctMatch[0] + '\n</Types>')
        baseZip.updateFile('[Content_Types].xml', Buffer.from(newCt))
      }
    }

    mergedBodyContent += bodyContent
  }

  const finalXml = baseDocXml.replace(/<w:body>[\s\S]*?<\/w:body>/, `<w:body>${mergedBodyContent}</w:body>`)
  baseZip.updateFile('word/document.xml', Buffer.from(finalXml))

  const outputPath = input.outputPath ?? generateDocumentOutputPath(input.worktree, 'merge', 'docx')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, baseZip.toBuffer())

  return {
    outputPath,
    summary: `已合并 ${files.length} 个 DOCX 文件`,
  }
}

// ==================== split ====================

export async function handleSplit(input: DocxInput): Promise<DocxResult> {
  const file = input.file
  if (!file) {
    throw new Error('split 操作需要 file 参数')
  }

  const srcZip = new AdmZip(readFileSync(file))
  const docXml = srcZip.readAsText('word/document.xml')
  if (!docXml) {
    throw new Error('无法解析 DOCX 的 document.xml 内容')
  }

  const bodyMatch = docXml.match(/<w:body>([\s\S]*?)<\/w:body>/)
  if (!bodyMatch) {
    throw new Error('无法解析 DOCX 的 body 内容')
  }
  const bodyContent = bodyMatch[1]

  const sectPrs = bodyContent.match(/<w:sectPr[\s\S]*?(?:<\/w:sectPr>|<w:sectPr[^>]*\/>)/g) ?? []
  const pageBreakParagraphs = bodyContent.match(/<w:p[\s\S]*?<w:br\s+w:type="page"[^>]*\/>[\s\S]*?<\/w:p>/g) ?? []

  if (sectPrs.length <= 1 && pageBreakParagraphs.length === 0) {
    throw new Error('文档没有分页符或分节符，无法拆分')
  }

  const sections: string[] = []
  let remaining = bodyContent

  // 提取所有 sectPr（包括自闭合和完整闭合），用于后续保留原始节属性
  const allSectPrs = bodyContent.match(/<w:sectPr[\s\S]*?(?:<\/w:sectPr>|<w:sectPr[^>]*\/>)/g) ?? []

  if (allSectPrs.length > 1) {
    // 分节符模式：按 sectPr 切分，保留每段对应的原始 sectPr
    const sectSplitRegex = /<w:sectPr[\s\S]*?(?:<\/w:sectPr>|<w:sectPr[^>]*\/>)/g
    let lastEnd = 0
    let match: RegExpExecArray | null
    let sectIdx = 0
    while ((match = sectSplitRegex.exec(remaining)) !== null) {
      const sectionContent = remaining.slice(lastEnd, match.index).trim()
      const originalSectPr = allSectPrs[sectIdx] ?? allSectPrs[allSectPrs.length - 1]
      sections.push(sectionContent + originalSectPr)
      lastEnd = match.index + match[0].length
      sectIdx++
    }
    // 修复：sectPr 模式下最后一个 sectPr 之后的内容也需要作为一个区域
    if (lastEnd < remaining.length) {
      const tailContent = remaining.slice(lastEnd).trim()
      if (tailContent) {
        const lastSectPr = allSectPrs[allSectPrs.length - 1] ?? ''
        sections.push(tailContent + lastSectPr)
      }
    }
  } else {
    // 分页符模式：按 page break 段切分
    const breakRegex = /<w:p[\s\S]*?<w:br\s+w:type="page"[^>]*\/>[\s\S]*?<\/w:p>/g
    let lastEnd = 0
    let match: RegExpExecArray | null
    while ((match = breakRegex.exec(remaining)) !== null) {
      const sectionContent = remaining.slice(lastEnd, match.index + match[0].length)
      sections.push(sectionContent.trim())
      lastEnd = match.index + match[0].length
    }
    if (lastEnd < remaining.length) {
      sections.push(remaining.slice(lastEnd).trim())
    }
  }

  if (sections.length < 2) {
    throw new Error('文档只有一个区域，无法拆分')
  }

  const outputPaths: string[] = []
  const defaultSectPr = allSectPrs[0] ?? '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'

  for (let i = 0; i < sections.length; i++) {
    const sectionBody = sections[i].includes('<w:sectPr')
      ? sections[i]
      : sections[i] + defaultSectPr
    const newDocXml = docXml.replace(/<w:body[\s\S]*?<\/w:body>/, `<w:body>${sectionBody}</w:body>`)

    const newZip = new AdmZip(srcZip.toBuffer())
    newZip.updateFile('word/document.xml', Buffer.from(newDocXml))

    const outputPath = generateDocumentOutputPath(
      input.worktree,
      'split',
      'docx',
      `section${i + 1}`,
    )
    mkdirSync(path.dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, newZip.toBuffer())
    outputPaths.push(outputPath)
  }

  return {
    outputPaths,
    summary: `已将 DOCX 拆分为 ${sections.length} 个区域文件`,
  }
}
