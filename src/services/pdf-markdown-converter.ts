import { createRequire } from 'node:module'
import path from 'node:path'
import type { MarkdownConversionResult } from './markdown-conversion-types.js'

const PARTIAL_NUMBERING_PATTERN = /^\.\d+$/

const nodeRequire = createRequire(import.meta.url)

const PDFJS_DIST_ROOT = path.dirname(nodeRequire.resolve('pdfjs-dist/package.json'))
const STANDARD_FONT_DATA_URL = `${PDFJS_DIST_ROOT.replace(/\\/g, '/')}/standard_fonts/`
const CMAP_URL = `${PDFJS_DIST_ROOT.replace(/\\/g, '/')}/cmaps/`

let workerBootstrapPromise: Promise<void> | null = null

function ensurePdfWorkerBootstrap(): Promise<void> {
  if (workerBootstrapPromise) return workerBootstrapPromise
  workerBootstrapPromise = (async () => {
    if ((globalThis as { pdfjsWorker?: unknown }).pdfjsWorker) return
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
    ;(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker
  })().catch((error) => {
    workerBootstrapPromise = null
    throw error
  })
  return workerBootstrapPromise
}

interface Word {
  x0: number
  x1: number
  top: number
  bottom: number
  text: string
}

interface RowInfo {
  yKey: number
  words: Word[]
  text: string
  xGroups: number[]
  isParagraph: boolean
  numColumns: number
  hasPartialNumbering: boolean
  isTableRow?: boolean
}

interface PdfTextItem {
  str: string
  transform: number[]
  width: number
  height: number
  hasEOL: boolean
}

function mergePartialNumberingLines(text: string): string {
  const lines = text.split('\n')
  const resultLines: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const stripped = line.trim()

    if (PARTIAL_NUMBERING_PATTERN.test(stripped)) {
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) {
        j++
      }

      if (j < lines.length) {
        resultLines.push(`${stripped} ${lines[j].trim()}`)
        i = j + 1
      } else {
        resultLines.push(line)
        i++
      }
    } else {
      resultLines.push(line)
      i++
    }
  }

  return resultLines.join('\n')
}

function isTextItem(item: unknown): item is PdfTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item
}

function extractWordsFromTextContent(items: PdfTextItem[], pageHeight: number): Word[] {
  const words: Word[] = []
  for (const item of items) {
    if (!item.str || !item.str.trim()) continue
    const x0 = item.transform[4]
    const y = item.transform[5]
    const height = item.height || 0
    const x1 = x0 + item.width
    const top = pageHeight - y - height
    const bottom = pageHeight - y

    words.push({ x0, x1, top, bottom, text: item.str })
  }
  return words
}

function assemblePlainText(items: PdfTextItem[]): string {
  const lines: string[] = []
  let currentLine = ''
  for (const item of items) {
    currentLine += item.str
    if (item.hasEOL) {
      lines.push(currentLine)
      currentLine = ''
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines.join('\n')
}

function extractFormContentFromWords(words: Word[], pageWidth: number): string | null {
  if (!words.length) return null

  const yTolerance = 5
  const rowsByY = new Map<number, Word[]>()
  for (const word of words) {
    const yKey = Math.round(word.top / yTolerance) * yTolerance
    if (!rowsByY.has(yKey)) rowsByY.set(yKey, [])
    rowsByY.get(yKey)!.push(word)
  }

  const sortedYKeys = [...rowsByY.keys()].sort((a, b) => a - b)

  const rowInfo: RowInfo[] = []
  for (const yKey of sortedYKeys) {
    const rowWords = [...rowsByY.get(yKey)!].sort((a, b) => a.x0 - b.x0)
    if (!rowWords.length) continue

    const firstX0 = rowWords[0].x0
    const lastX1 = rowWords[rowWords.length - 1].x1
    const lineWidth = lastX1 - firstX0
    const combinedText = rowWords.map((w) => w.text).join(' ')

    const xPositions = rowWords.map((w) => w.x0).sort((a, b) => a - b)
    const xGroups: number[] = []
    for (const x of xPositions) {
      if (!xGroups.length || x - xGroups[xGroups.length - 1] > 50) xGroups.push(x)
    }

    const isParagraph = lineWidth > pageWidth * 0.55 && combinedText.length > 60

    let hasPartialNumbering = false
    if (rowWords.length) {
      const firstWord = rowWords[0].text.trim()
      if (PARTIAL_NUMBERING_PATTERN.test(firstWord)) hasPartialNumbering = true
    }

    rowInfo.push({
      yKey,
      words: rowWords,
      text: combinedText,
      xGroups,
      isParagraph,
      numColumns: xGroups.length,
      hasPartialNumbering,
    })
  }

  const allTableXPositions: number[] = []
  for (const info of rowInfo) {
    if (info.numColumns >= 3 && !info.isParagraph) {
      allTableXPositions.push(...info.xGroups)
    }
  }
  if (!allTableXPositions.length) return null

  allTableXPositions.sort((a, b) => a - b)

  const gaps: number[] = []
  for (let i = 0; i < allTableXPositions.length - 1; i++) {
    const gap = allTableXPositions[i + 1] - allTableXPositions[i]
    if (gap > 5) gaps.push(gap)
  }

  let adaptiveTolerance: number
  if (gaps.length >= 3) {
    const sortedGaps = [...gaps].sort((a, b) => a - b)
    const percentile70Idx = Math.floor(sortedGaps.length * 0.7)
    adaptiveTolerance = sortedGaps[percentile70Idx]
    adaptiveTolerance = Math.max(25, Math.min(50, adaptiveTolerance))
  } else {
    adaptiveTolerance = 35
  }

  const globalColumns: number[] = []
  for (const x of allTableXPositions) {
    if (!globalColumns.length || x - globalColumns[globalColumns.length - 1] > adaptiveTolerance) {
      globalColumns.push(x)
    }
  }

  if (globalColumns.length > 1) {
    const contentWidth = globalColumns[globalColumns.length - 1] - globalColumns[0]
    const avgColWidth = contentWidth / globalColumns.length
    if (avgColWidth < 30) return null
    const columnsPerInch = globalColumns.length / (contentWidth / 72)
    if (columnsPerInch > 10) return null
    const adaptiveMaxColumns = Math.max(15, Math.floor(20 * (pageWidth / 612)))
    if (globalColumns.length > adaptiveMaxColumns) return null
  } else {
    return null
  }

  for (const info of rowInfo) {
    if (info.isParagraph) {
      info.isTableRow = false
      continue
    }
    if (info.hasPartialNumbering) {
      info.isTableRow = false
      continue
    }
    const alignedColumns = new Set<number>()
    for (const word of info.words) {
      for (let colIdx = 0; colIdx < globalColumns.length; colIdx++) {
        if (Math.abs(word.x0 - globalColumns[colIdx]) < 40) {
          alignedColumns.add(colIdx)
          break
        }
      }
    }
    info.isTableRow = alignedColumns.size >= 2
  }

  const tableRegions: Array<[number, number]> = []
  let i = 0
  while (i < rowInfo.length) {
    if (rowInfo[i].isTableRow) {
      const startIdx = i
      while (i < rowInfo.length && rowInfo[i].isTableRow) i++
      const regionLength = i - startIdx
      if (regionLength >= 3) {
        tableRegions.push([startIdx, i])
      }
    } else {
      i++
    }
  }

  const totalTableRows = tableRegions.reduce((sum, [s, e]) => sum + (e - s), 0)
  if (rowInfo.length > 0 && totalTableRows / rowInfo.length < 0.25) return null
  if (tableRegions.length === 0) return null

  const resultLines: string[] = []
  const numCols = globalColumns.length

  const extractCells = (info: RowInfo): string[] => {
    const cells: string[] = new Array(numCols).fill('')
    for (const word of info.words) {
      let assignedCol = numCols - 1
      for (let colIdx = 0; colIdx < numCols - 1; colIdx++) {
        const colEnd = globalColumns[colIdx + 1]
        if (word.x0 < colEnd - 20) {
          assignedCol = colIdx
          break
        }
      }
      if (cells[assignedCol]) cells[assignedCol] += ' ' + word.text
      else cells[assignedCol] = word.text
    }
    return cells
  }

  let idx = 0
  while (idx < rowInfo.length) {
    const info = rowInfo[idx]
    let tableRegion: [number, number] | undefined
    for (const [start, end] of tableRegions) {
      if (idx === start) {
        tableRegion = [start, end]
        break
      }
    }
    if (tableRegion) {
      const [start, end] = tableRegion
      const tableData: string[][] = []
      for (let tableIdx = start; tableIdx < end; tableIdx++) {
        const cells = extractCells(rowInfo[tableIdx])
        tableData.push(cells)
      }
      if (tableData.length) {
        const colWidths = Array.from({ length: numCols }, (_, col) => {
          let maxLen = 0
          for (const row of tableData) {
            const cell = row[col] ?? ''
            if (cell.length > maxLen) maxLen = cell.length
          }
          return Math.max(maxLen, 3)
        })
        const header = tableData[0]
        resultLines.push(
          '| ' + header.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ') + ' |',
        )
        resultLines.push('| ' + colWidths.map((w) => '-'.repeat(w)).join(' | ') + ' |')
        for (let r = 1; r < tableData.length; r++) {
          const row = tableData[r]
          resultLines.push(
            '| ' + row.map((cell, i) => cell.padEnd(colWidths[i])).join(' | ') + ' |',
          )
        }
      }
      idx = end
    } else {
      let inTable = false
      for (const [start, end] of tableRegions) {
        if (start < idx && idx < end) {
          inTable = true
          break
        }
      }
      if (!inTable) resultLines.push(info.text)
      idx++
    }
  }

  return resultLines.join('\n')
}

export async function convertPdfToMarkdown(buffer: Buffer): Promise<MarkdownConversionResult> {
  await ensurePdfWorkerBootstrap()

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const uint8 = new Uint8Array(buffer)
  const loadingTask = pdfjs.getDocument({
    data: uint8,
    useSystemFonts: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
  })
  const doc = await loadingTask.promise

  const markdownChunks: string[] = []
  let formPageCount = 0

  try {
    for (let pageIdx = 1; pageIdx <= doc.numPages; pageIdx++) {
      const page = await doc.getPage(pageIdx)
      try {
        const viewport = page.getViewport({ scale: 1 })
        const pageWidth = viewport.width
        const pageHeight = viewport.height
        const textContent = await page.getTextContent()
        const textItems = textContent.items.filter(isTextItem) as PdfTextItem[]

        const words = extractWordsFromTextContent(textItems, pageHeight)
        const formContent = extractFormContentFromWords(words, pageWidth)

        if (formContent !== null) {
          formPageCount++
          if (formContent.trim()) markdownChunks.push(formContent)
        } else {
          const text = assemblePlainText(textItems).trim()
          if (text) markdownChunks.push(text)
        }
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  const markdown = mergePartialNumberingLines(markdownChunks.join('\n\n').trim())
  return { markdown }
}
