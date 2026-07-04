import { mkdirSync } from 'node:fs'
import path from 'node:path'

import AdmZip from 'adm-zip'
import type { IZipEntry } from 'adm-zip'

import { generateDocumentOutputPath } from '../utils/document-output-path.js'

import type { PptxInput, PptxResult } from './pptx-service.js'

export async function handleMerge(input: PptxInput): Promise<PptxResult> {
  const files = input.files
  if (!files || files.length < 2) {
    throw new Error('merge 操作需要至少 2 个文件路径')
  }

  const baseZip = new AdmZip(files[0])
  const basePresXml = baseZip.readAsText('ppt/presentation.xml')
  if (!basePresXml) {
    throw new Error(`基础文件 "${files[0]}" 不是有效的 PPTX：缺少 ppt/presentation.xml`)
  }

  // 解析基础文件的幻灯片 ID 体系
  // sldIdLst 包含 <p:sldId id="..." r:id="rId..."/> 条目
  // 自闭合 <p:sldIdLst/> 也兼容
  const sldIdLstMatch = basePresXml.match(/<p:sldIdLst(\s[^>]*)?>([\s\S]*?)<\/p:sldIdLst>/)
    ?? basePresXml.match(/<p:sldIdLst(\s[^>]*)?\/>/)
  let mergedSldIds = sldIdLstMatch?.[2] ?? ''
  const hasSldIdLst = !!sldIdLstMatch
  if (!hasSldIdLst) {
    // 基础文件没有 sldIdLst，稍后插入新的
  }

  // 解析基础文件的 rels，建立 rId -> slide 路径映射
  const baseRelsXml = baseZip.readAsText('ppt/_rels/presentation.xml.rels') ?? ''
  const baseRelMap = new Map<string, string>()
  for (const m of baseRelsXml.matchAll(/<Relationship\s+([^>]*?)\/>/g)) {
    const attrs = m[1]
    const idMatch = attrs.match(/Id="([^"]+)"/)
    const targetMatch = attrs.match(/Target="([^"]+)"/)
    if (idMatch && targetMatch) {
      baseRelMap.set(idMatch[1], targetMatch[1])
    }
  }

  // 找到基础文件中已使用的最大 rId 和最大 slide N
  let maxRid = 0
  for (const rid of baseRelMap.keys()) {
    const num = parseInt(rid.replace(/^rId/, ''))
    if (num > maxRid) maxRid = num
  }
  let maxSlideN = 0
  const slideEntries = baseZip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
  for (const e of slideEntries) {
    const m = e.entryName.match(/slide(\d+)\.xml$/)
    if (m) {
      const n = parseInt(m[1])
      if (n > maxSlideN) maxSlideN = n
    }
  }

  // 找到基础文件中已使用的最大 sldId
  let maxSldId = 256
  for (const m of mergedSldIds.matchAll(/id="(\d+)"/g)) {
    const n = parseInt(m[1])
    if (n > maxSldId) maxSldId = n
  }

  // 用于追踪源文件被复制的幻灯片顺序：按源 sldIdLst 顺序处理
  for (let i = 1; i < files.length; i++) {
    const srcZip = new AdmZip(files[i])
    const srcPresXml = srcZip.readAsText('ppt/presentation.xml')
    if (!srcPresXml) {
      throw new Error(`源文件 "${files[i]}" 不是有效的 PPTX：缺少 ppt/presentation.xml`)
    }

    // 解析源文件 sldIdLst 以确定幻灯片顺序
    const srcSldIdLstMatch = srcPresXml.match(/<p:sldIdLst(\s[^>]*)?>([\s\S]*?)<\/p:sldIdLst>/)
      ?? srcPresXml.match(/<p:sldIdLst(\s[^>]*)?\/>/)
    const srcSldIds = srcSldIdLstMatch?.[2] ?? ''

    // 从源 sldIdLst 提取 r:id 顺序
    const srcRidOrder: string[] = []
    for (const m of srcSldIds.matchAll(/r:id="([^"]+)"/g)) {
      srcRidOrder.push(m[1])
    }

    // 解析源文件 rels
    const srcRelsXml = srcZip.readAsText('ppt/_rels/presentation.xml.rels') ?? ''
    const srcRelMap = new Map<string, string>()
    for (const m of srcRelsXml.matchAll(/<Relationship\s+([^>]*?)\/>/g)) {
      const attrs = m[1]
      const idMatch = attrs.match(/Id="([^"]+)"/)
      const targetMatch = attrs.match(/Target="([^"]+)"/)
      if (idMatch && targetMatch) {
        srcRelMap.set(idMatch[1], targetMatch[1])
      }
    }

    // 如果 sldIdLst 中有 r:id，按其顺序处理；否则按文件名排序处理所有 slide
    const srcSlideEntries: IZipEntry[] = srcZip.getEntries().filter((e: IZipEntry) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))

    // 建立 rId -> srcEntry 映射
    const ridToEntry = new Map<string, IZipEntry>()
    for (const entry of srcSlideEntries) {
      // 从 rels 中找到指向该 slide 的 rId
      const slideFileName = entry.entryName.split('/').pop() ?? ''
      const slideTarget = `slides/${slideFileName}`
      for (const [rid, target] of srcRelMap.entries()) {
        if (target === slideTarget) {
          ridToEntry.set(rid, entry)
          break
        }
      }
    }

    // 确定处理顺序：优先按 sldIdLst 的 r:id 顺序，未匹配的按文件名排序追加
    const orderedEntries: IZipEntry[] = []
    const processedRids = new Set<string>()
    for (const rid of srcRidOrder) {
      const entry = ridToEntry.get(rid)
      if (entry) {
        orderedEntries.push(entry)
        processedRids.add(rid)
      }
    }
    // 追加 sldIdLst 中未匹配的 slide（如 rels 损坏或 sldIdLst 不完整）
    for (const entry of srcSlideEntries) {
      const slideFileName = entry.entryName.split('/').pop() ?? ''
      const slideTarget = `slides/${slideFileName}`
      const matchedRid = [...srcRelMap.entries()].find(([, t]) => t === slideTarget)?.[0]
      if (!matchedRid || !processedRids.has(matchedRid)) {
        if (!orderedEntries.includes(entry)) {
          orderedEntries.push(entry)
        }
      }
    }

    for (const srcEntry of orderedEntries) {
      maxSlideN++
      const newSlideName = `slide${maxSlideN}.xml`
      const newSlidePath = `ppt/slides/${newSlideName}`

      // 复制幻灯片 XML
      baseZip.addFile(newSlidePath, srcEntry.getData())

      // 复制幻灯片 rels（media 引用），并重映射 slide 内部 rels 的 rId
      const srcSlideFileName = srcEntry.entryName.split('/').pop() ?? ''
      const srcSlideRelsEntry = srcZip.getEntry(`ppt/slides/_rels/${srcSlideFileName}.rels`)
      if (srcSlideRelsEntry) {
        const newRelsPath = `ppt/slides/_rels/${newSlideName}.rels`
        let relsXml = srcSlideRelsEntry.getData().toString('utf8')

        // 收集基础文档中已存在的 slide rels rId，用于冲突检测
        const existingSlideRids = new Set<string>()
        for (const e of baseZip.getEntries()) {
          const m = e.entryName.match(/^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/)
          if (m) {
            const content = baseZip.readAsText(e.entryName) ?? ''
            for (const rm of content.matchAll(/Id="([^"]+)"/g)) {
              existingSlideRids.add(rm[1])
            }
          }
        }

        // 为该 slide 的 rels 构建 rId 映射表
        const slideRidMapping = new Map<string, string>()
        for (const m of relsXml.matchAll(/<Relationship\s+([^>]*?)\/>/g)) {
          const attrs = m[1]
          const idMatch = attrs.match(/Id="([^"]+)"/)
          if (!idMatch) continue
          const oldRid = idMatch[1]

          // 解析 Target
          const targetMatch = attrs.match(/Target="([^"]+)"/)
          if (!targetMatch) continue
          const target = targetMatch[1]

          // 处理 media 引用
          const mediaMatch = target.match(/\.\.\/(?:\.\.\/)?(media\/[^"]+)/)
          if (mediaMatch) {
            const mediaPath = mediaMatch[1]
            const srcMediaEntry = srcZip.getEntry(`ppt/${mediaPath}`)
            if (srcMediaEntry) {
              if (!baseZip.getEntry(`ppt/${mediaPath}`)) {
                // 新 media 文件：复制到基础文档
                baseZip.addFile(`ppt/${mediaPath}`, srcMediaEntry.getData())
                // 同步 Content_Types
                const baseCt = baseZip.readAsText('[Content_Types].xml') ?? ''
                const ext = mediaPath.match(/\.(\w+)$/)?.[1]?.toLowerCase()
                if (ext && !baseCt.includes(`Extension="${ext}"`)) {
                  const srcCt = srcZip.readAsText('[Content_Types].xml') ?? ''
                  const extMatch = srcCt.match(new RegExp(`<Default\\s+Extension="${ext}"[^>]*/>`))
                  if (extMatch && !baseCt.includes(extMatch[0])) {
                    const newCt = baseCt.replace('</Types>', extMatch[0] + '\n</Types>')
                    baseZip.updateFile('[Content_Types].xml', Buffer.from(newCt, 'utf8'))
                  }
                }
              }
              // 检查 rId 是否冲突
              if (existingSlideRids.has(oldRid)) {
                // 分配新 rId
                maxRid++
                const newRid = `rId${maxRid}`
                slideRidMapping.set(oldRid, newRid)
                existingSlideRids.add(newRid)
              } else {
                existingSlideRids.add(oldRid)
              }
            }
          } else {
            // 非 media 关系（如 layout、master 引用），也需检查 rId 冲突
            if (existingSlideRids.has(oldRid)) {
              maxRid++
              const newRid = `rId${maxRid}`
              slideRidMapping.set(oldRid, newRid)
              existingSlideRids.add(newRid)
            } else {
              existingSlideRids.add(oldRid)
            }
          }
        }

        // 应用 rId 重映射到 slide rels XML
        for (const [oldRid, newRid] of slideRidMapping) {
          relsXml = relsXml.replaceAll(`Id="${oldRid}"`, `Id="${newRid}"`)
        }

        // 同时重映射 slide XML 中对这些 rId 的引用
        let slideXml = baseZip.readAsText(newSlidePath) ?? ''
        for (const [oldRid, newRid] of slideRidMapping) {
          slideXml = slideXml.replaceAll(`r:embed="${oldRid}"`, `r:embed="${newRid}"`)
          slideXml = slideXml.replaceAll(`r:link="${oldRid}"`, `r:link="${newRid}"`)
          slideXml = slideXml.replaceAll(`r:id="${oldRid}"`, `r:id="${newRid}"`)
        }
        if (slideRidMapping.size > 0) {
          baseZip.updateFile(newSlidePath, Buffer.from(slideXml, 'utf8'))
        }

        baseZip.addFile(newRelsPath, Buffer.from(relsXml, 'utf8'))
      }

      // 分配新的 rId 和 sldId（presentation.xml.rels 中的 slide 关系）
      maxRid++
      const newRid = `rId${maxRid}`
      maxSldId++
      const newSldId = maxSldId

      // 在 presentation.xml.rels 中添加关系
      const newRel = `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/${newSlideName}"/>`
      const updatedBaseRels = (baseZip.readAsText('ppt/_rels/presentation.xml.rels') ?? '').replace('</Relationships>', newRel + '\n</Relationships>')
      baseZip.updateFile('ppt/_rels/presentation.xml.rels', Buffer.from(updatedBaseRels, 'utf8'))

      // 在 sldIdLst 中添加条目
      mergedSldIds += `<p:sldId id="${newSldId}" r:id="${newRid}"/>`
    }
  }

  // 更新 presentation.xml 中的 sldIdLst
  let finalPresXml: string
  if (hasSldIdLst) {
    finalPresXml = basePresXml.replace(/<p:sldIdLst(\s[^>]*)?>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>$1>${mergedSldIds}</p:sldIdLst>`)
  } else {
    // 没有 sldIdLst，在 sldMasterIdLst 之后插入
    const insertAfter = basePresXml.match(/<\/p:sldMasterIdLst>/)
    if (insertAfter) {
      finalPresXml = basePresXml.replace(/<\/p:sldMasterIdLst>/, `</p:sldMasterIdLst><p:sldIdLst>${mergedSldIds}</p:sldIdLst>`)
    } else {
      // 退化：直接追加
      finalPresXml = basePresXml.replace(/<\/p:presentation>/, `<p:sldIdLst>${mergedSldIds}</p:sldIdLst></p:presentation>`)
    }
  }
  baseZip.updateFile('ppt/presentation.xml', Buffer.from(finalPresXml, 'utf8'))

  const outputPath = input.outputPath ?? generateDocumentOutputPath(input.worktree, 'merge', 'pptx')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  baseZip.writeZip(outputPath)

  return {
    outputPath,
    summary: `已合并 ${files.length} 个 PPTX 文件`,
  }
}
