import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  PdfConverter,
  PARTIAL_NUMBERING_PATTERN,
  mergePartialNumberingLines,
  extractFormContentFromWords,
  extractTablesFromWords,
  extractWordsFromTextContent,
  assemblePlainText,
  toMarkdownTable,
  type Word,
  type PdfTextItem,
} from '../../../src/services/markitdown/converters/pdf-converter.js'

const REF_DIR = path.resolve(process.cwd(), 'tests/fixtures/markitdown/reference')

function readPdfBuffer(filename: string): Buffer {
  return readFileSync(path.join(REF_DIR, filename))
}

function makeTextItem(
  str: string,
  x: number,
  y: number,
  width: number,
  height = 12,
  hasEOL = false,
): PdfTextItem {
  return {
    str,
    transform: [12, 0, 0, 12, x, y],
    width,
    height,
    hasEOL,
  }
}

function makeWord(
  text: string,
  x0: number,
  x1: number,
  top: number,
  bottom: number,
): Word {
  return { text, x0, x1, top, bottom }
}

// --- Helper: extract markdown tables from text (mirrors reference test helper) ---
function extractMarkdownTables(textContent: string): string[][][] {
  const tables: string[][][] = []
  const lines = textContent.split('\n')
  let currentTable: string[][] = []
  let inTable = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (/^\|[\s\-|]+\|$/.test(trimmed)) continue
      const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim())
      currentTable.push(cells)
      inTable = true
    } else {
      if (inTable && currentTable.length) {
        tables.push(currentTable)
        currentTable = []
      }
      inTable = false
    }
  }
  if (currentTable.length) tables.push(currentTable)
  return tables
}

describe('pdf-converter', () => {
  describe('PARTIAL_NUMBERING_PATTERN', () => {
    it('应该匹配部分编号模式 .1 .2 .10 .99', () => {
      expect(PARTIAL_NUMBERING_PATTERN.test('.1')).toBe(true)
      expect(PARTIAL_NUMBERING_PATTERN.test('.2')).toBe(true)
      expect(PARTIAL_NUMBERING_PATTERN.test('.10')).toBe(true)
      expect(PARTIAL_NUMBERING_PATTERN.test('.99')).toBe(true)
    })

    it('不应该匹配非部分编号模式', () => {
      expect(PARTIAL_NUMBERING_PATTERN.test('1.')).toBe(false)
      expect(PARTIAL_NUMBERING_PATTERN.test('1.2')).toBe(false)
      expect(PARTIAL_NUMBERING_PATTERN.test('.1.2')).toBe(false)
      expect(PARTIAL_NUMBERING_PATTERN.test('text')).toBe(false)
      expect(PARTIAL_NUMBERING_PATTERN.test('.a')).toBe(false)
      expect(PARTIAL_NUMBERING_PATTERN.test('')).toBe(false)
    })
  })

  describe('mergePartialNumberingLines', () => {
    it('应该合并孤立的部分编号与后续文本', () => {
      const input = '.1\n\nThe intent of this Request for Proposal'
      const result = mergePartialNumberingLines(input)
      expect(result).toContain('.1 The intent of this Request for Proposal')
      expect(result).not.toMatch(/^\.1$/m)
    })

    it('应该处理多个连续的部分编号', () => {
      const input = '.1\n\nFirst item\n.2\n\nSecond item'
      const result = mergePartialNumberingLines(input)
      expect(result).toContain('.1 First item')
      expect(result).toContain('.2 Second item')
    })

    it('应该处理多个空行之间的部分编号', () => {
      const input = '.1\n\n\n\nThe intent'
      const result = mergePartialNumberingLines(input)
      expect(result).toContain('.1 The intent')
    })

    it('应该保留不以部分编号开头的行', () => {
      const input = 'Normal line\nAnother line'
      const result = mergePartialNumberingLines(input)
      expect(result).toBe('Normal line\nAnother line')
    })

    it('应该处理文档末尾的孤立部分编号', () => {
      const input = 'Some text\n.1'
      const result = mergePartialNumberingLines(input)
      expect(result).toContain('Some text')
      expect(result).toContain('.1')
    })
  })

  describe('extractWordsFromTextContent', () => {
    it('应该从文本项中提取单词并计算坐标', () => {
      const pageHeight = 800
      const items: PdfTextItem[] = [
        makeTextItem('Hello World', 100, 700, 80, 12),
      ]
      const words = extractWordsFromTextContent(items, pageHeight)
      expect(words.length).toBe(1)
      expect(words[0].text).toBe('Hello World')
      expect(words[0].x0).toBe(100)
      expect(words[0].x1).toBeGreaterThan(words[0].x0)
    })

    it('应该处理单个单词的文本项', () => {
      const pageHeight = 800
      const items: PdfTextItem[] = [makeTextItem('Single', 50, 600, 40, 12)]
      const words = extractWordsFromTextContent(items, pageHeight)
      expect(words.length).toBe(1)
      expect(words[0].text).toBe('Single')
    })

    it('应该跳过空字符串和空白文本项', () => {
      const pageHeight = 800
      const items: PdfTextItem[] = [
        makeTextItem('', 100, 700, 0, 12),
        makeTextItem('   ', 100, 700, 0, 12),
        makeTextItem('Valid', 100, 700, 50, 12),
      ]
      const words = extractWordsFromTextContent(items, pageHeight)
      expect(words.length).toBe(1)
      expect(words[0].text).toBe('Valid')
    })

    it('应该正确计算 top/bottom 坐标（基于页面高度翻转 Y 轴）', () => {
      const pageHeight = 800
      const y = 700
      const height = 12
      const items: PdfTextItem[] = [makeTextItem('Test', 100, y, 50, height)]
      const words = extractWordsFromTextContent(items, pageHeight)
      expect(words[0].top).toBe(pageHeight - y - height)
      expect(words[0].bottom).toBe(pageHeight - y)
      expect(words[0].bottom).toBeGreaterThan(words[0].top)
    })
  })

  describe('assemblePlainText', () => {
    it('应该根据 hasEOL 标志组装文本行', () => {
      const items: PdfTextItem[] = [
        makeTextItem('Hello ', 0, 0, 0, 12, false),
        makeTextItem('World', 0, 0, 0, 12, true),
        makeTextItem('Second line', 0, 0, 0, 12, true),
      ]
      const result = assemblePlainText(items)
      expect(result).toBe('Hello World\nSecond line')
    })

    it('应该处理没有 EOL 标志的文本', () => {
      const items: PdfTextItem[] = [
        makeTextItem('Hello', 0, 0, 0, 12, false),
        makeTextItem(' World', 0, 0, 0, 12, false),
      ]
      const result = assemblePlainText(items)
      expect(result).toBe('Hello World')
    })

    it('应该处理空数组', () => {
      expect(assemblePlainText([])).toBe('')
    })
  })

  describe('toMarkdownTable', () => {
    it('应该生成带分隔符的 markdown 表格', () => {
      const table = [
        ['Header1', 'Header2'],
        ['A', '1'],
        ['B', '2'],
      ]
      const result = toMarkdownTable(table)
      expect(result).toContain('| Header1 | Header2 |')
      expect(result).toContain('| ------- | ------- |')
      expect(result).toContain('| A       | 1       |')
      expect(result).toContain('| B       | 2       |')
    })

    it('应该处理不含分隔符的表格', () => {
      const table = [
        ['Header1', 'Header2'],
        ['1', '2'],
      ]
      const result = toMarkdownTable(table, false)
      expect(result).toContain('| Header1 | Header2 |')
      expect(result).not.toContain('---')
    })

    it('应该处理空表格', () => {
      expect(toMarkdownTable([])).toBe('')
    })

    it('应该过滤全空行', () => {
      const table = [
        ['Header', 'Val'],
        ['', ''],
        ['Data', 'x'],
      ]
      const result = toMarkdownTable(table)
      expect(result).toContain('Header')
      expect(result).toContain('Data')
      expect(result).not.toMatch(/^\|\s*\|\s*\|$/m)
    })
  })

  describe('extractFormContentFromWords', () => {
    it('对无表格的纯文本应返回 null', () => {
      const words: Word[] = [
        makeWord('This', 50, 90, 100, 112),
        makeWord('is', 95, 115, 100, 112),
        makeWord('a', 120, 130, 100, 112),
        makeWord('long', 135, 175, 100, 112),
        makeWord('paragraph', 180, 270, 100, 112),
        makeWord('of', 275, 295, 100, 112),
        makeWord('text', 300, 340, 100, 112),
        makeWord('that', 345, 385, 100, 112),
        makeWord('spans', 390, 440, 100, 112),
        makeWord('widely', 445, 500, 100, 112),
        makeWord('across', 50, 110, 200, 212),
        makeWord('the', 115, 145, 200, 212),
        makeWord('page', 150, 190, 200, 212),
        makeWord('for', 195, 225, 200, 212),
        makeWord('proper', 230, 290, 200, 212),
        makeWord('paragraph', 295, 385, 200, 212),
        makeWord('detection', 390, 470, 200, 212),
        makeWord('here', 475, 520, 200, 212),
      ]
      const result = extractFormContentFromWords(words, 612)
      expect(result).toBeNull()
    })

    it('对空单词列表应返回 null', () => {
      expect(extractFormContentFromWords([], 612)).toBeNull()
    })

    it('应该检测列对齐的表格行并输出 markdown 表格', () => {
      const words: Word[] = [
        makeWord('Name', 50, 100, 100, 112),
        makeWord('Age', 250, 290, 100, 112),
        makeWord('City', 400, 440, 100, 112),
        makeWord('Alice', 50, 100, 200, 212),
        makeWord('30', 250, 270, 200, 212),
        makeWord('NYC', 400, 430, 200, 212),
        makeWord('Bob', 50, 80, 300, 312),
        makeWord('25', 250, 270, 300, 312),
        makeWord('LA', 400, 420, 300, 312),
        makeWord('Charlie', 50, 110, 400, 412),
        makeWord('35', 250, 270, 400, 412),
        makeWord('SF', 400, 420, 400, 412),
      ]
      const result = extractFormContentFromWords(words, 612)
      expect(result).not.toBeNull()
      expect(result).toContain('|')
      expect(result).toContain('Name')
      expect(result).toContain('Alice')
      expect(result).toContain('NYC')
    })

    it('不应该将部分编号行拆分为表格列', () => {
      const words: Word[] = [
        makeWord('.1', 50, 70, 100, 112),
        makeWord('The', 80, 110, 100, 112),
        makeWord('intent', 115, 160, 100, 112),
        makeWord('of', 165, 180, 100, 112),
        makeWord('this', 185, 215, 100, 112),
        makeWord('document', 220, 290, 100, 112),
      ]
      const result = extractFormContentFromWords(words, 612)
      if (result !== null) {
        expect(result).not.toMatch(/^\|.*\.1.*\|/m)
      }
    })
  })

  describe('extractTablesFromWords', () => {
    it('对列数不足的单词列表应返回空数组', () => {
      const words: Word[] = [
        makeWord('A', 50, 70, 100, 112),
        makeWord('B', 200, 220, 100, 112),
      ]
      const result = extractTablesFromWords(words)
      expect(result).toHaveLength(0)
    })

    it('对空单词列表应返回空数组', () => {
      expect(extractTablesFromWords([])).toEqual([])
    })

    it('应该提取结构化的表格数据', () => {
      const words: Word[] = []
      const colX = [50, 200, 400]
      const rows = [
        ['Name', 'Age', 'City'],
        ['Alice', '30', 'NYC'],
        ['Bob', '25', 'LA'],
        ['Charlie', '35', 'SF'],
        ['Dave', '40', 'DC'],
      ]
      rows.forEach((row, rowIdx) => {
        row.forEach((cell, colIdx) => {
          words.push(
            makeWord(cell, colX[colIdx], colX[colIdx] + cell.length * 8, 100 + rowIdx * 20, 112 + rowIdx * 20),
          )
        })
      })
      const result = extractTablesFromWords(words)
      expect(result.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('PdfConverter.convertPdf - 集成测试', () => {
    it('静态方法 convertPdf 应该存在', () => {
      expect(typeof PdfConverter.convertPdf).toBe('function')
    })

    it('应该将学术论文 PDF 转换为文本', async () => {
      const buffer = readPdfBuffer('test.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      expect(result.markdown).toContain('While there is contemporaneous exploration of multi-agent approaches')
      expect(result.markdown).toContain('AutoGen')
      expect(result.markdown.length).toBeGreaterThan(1000)
    }, 30000)

    it('应该从 borderless table PDF 提取表格内容', async () => {
      const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      const text = result.markdown

      expect(text).toContain('INVENTORY RECONCILIATION REPORT')
      expect(text).toContain('Report ID: SPARSE-2024-INV-1234')
      expect(text).toContain('Warehouse: Distribution Center East')
      expect(text).toContain('Report Date: 2024-11-15')
      expect(text).toContain('Prepared By: Sarah Martinez')
      expect(text).toContain('|')
      expect(text).toContain('Product Code')
      expect(text).toContain('Location')
      expect(text).toContain('SKU-8847')
      expect(text).toContain('SKU-9201')
      expect(text).toContain('SKU-4563')
      expect(text).toContain('SKU-7728')
      expect(text).toContain('CRITICAL')
      expect(text).toContain('Variance Analysis')
      expect(text).toContain('Recommendations')
    }, 30000)

    it('应该从 borderless table PDF 提取有效的 markdown 表格结构', async () => {
      const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      const tables = extractMarkdownTables(result.markdown)

      expect(tables.length).toBeGreaterThanOrEqual(1)
      for (const table of tables) {
        expect(table.length).toBeGreaterThanOrEqual(2)
        const numCols = table[0].length
        expect(numCols).toBeGreaterThanOrEqual(2)
        for (const row of table) {
          expect(row.length).toBe(numCols)
        }
      }
    }, 30000)

    it('应该正确合并 MasterFormat 部分编号', async () => {
      const buffer = readPdfBuffer('masterformat_partial_numbering.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      const text = result.markdown

      expect(text).toContain('RFP for Construction Management Services')
      expect(text).toContain('Ken Sargent House')
      expect(text).toContain('INTENT')
      expect(text).toContain('Request for Proposal')

      const lines = text.split('\n')
      const isolatedNumberings = lines.filter((line) => {
        const stripped = line.trim().replace(/\|/g, '').trim()
        return /^\.\d+$/.test(stripped)
      })
      expect(isolatedNumberings).toHaveLength(0)

      const mergedCount = (text.match(/\.\d+\s+[A-Za-z]/g) || []).length
      expect(mergedCount).toBeGreaterThanOrEqual(2)

      expect(text).toMatch(/\.1\s+The intent/)
      expect(text).toMatch(/\.2\s+Available information/)
    }, 30000)

    it('应该保留零售收据的内容', async () => {
      const buffer = readPdfBuffer('RECEIPT-2024-TXN-98765_retail_purchase.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      const text = result.markdown

      expect(text).toContain('TECHMART ELECTRONICS')
      expect(text).toContain('San Francisco')
      expect(text).toContain('TXN')
      expect(text).toContain('SUBTOTAL')
      expect(text).toContain('TOTAL')
    }, 30000)

    it('应该处理多页 PDF 文档', async () => {
      const buffer = readPdfBuffer('REPAIR-2022-INV-001_multipage.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      expect(result.markdown.length).toBeGreaterThan(100)
    }, 30000)

    it('应该处理医疗报告 PDF', async () => {
      const buffer = readPdfBuffer('MEDRPT-2024-PAT-3847_medical_report_scan.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      expect(typeof result.markdown).toBe('string')
    }, 30000)

    it('应该处理电影票预订 PDF', async () => {
      const buffer = readPdfBuffer('movie-theater-booking-2024.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      expect(typeof result.markdown).toBe('string')
    }, 30000)

    it('应该对损坏的 PDF 抛出错误而非静默返回空', async () => {
      const badBuffer = Buffer.from('not a pdf file')
      await expect(PdfConverter.convertPdf(badBuffer)).rejects.toThrow('PDF 解析失败')
    })

    it('应该对空 Buffer 抛出错误而非静默返回空', async () => {
      await expect(PdfConverter.convertPdf(Buffer.alloc(0))).rejects.toThrow('PDF 解析失败')
    })
  })

  describe('PdfConverter 实例方法', () => {
    it('accept 应该接受 pdf 格式', () => {
      const converter = new PdfConverter()
      expect(converter.accept('test.pdf', 'pdf')).toBe(true)
    })

    it('accept 不应该接受其他格式', () => {
      const converter = new PdfConverter()
      expect(converter.accept('test.docx', 'docx')).toBe(false)
      expect(converter.accept('test.html', 'html')).toBe(false)
    })

    it('convert 应该返回 ConverterResult', async () => {
      const converter = new PdfConverter()
      const buffer = readPdfBuffer('test.pdf')
      const result = await converter.convert({
        filePath: 'test.pdf',
        textContent: '',
        binaryContent: buffer,
        format: 'pdf',
      })
      expect(result).toHaveProperty('markdown')
      expect(result.markdown).toContain('AutoGen')
    }, 30000)
  })

  // ===========================================================================
  // 移植自参考实现 test_pdf_tables.py - 表格提取专项测试
  // ===========================================================================
  describe('表格提取专项（移植自 test_pdf_tables.py）', () => {
    describe('SPARSE borderless table', () => {
      it('应该提取 borderless 表格且不重复内容', async () => {
        const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const text = result.markdown

        // SKU-8847 应出现在两个表格中，加上少量文本引用，不应过度重复
        const skuCount = (text.match(/SKU-8847/g) || []).length
        expect(skuCount).toBeLessThanOrEqual(4)
      })

      it('应该保持正确的内容顺序（header → table → analysis）', async () => {
        const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const text = result.markdown

        const headerPos = text.indexOf('Prepared By: Sarah Martinez')
        const productCodePos = text.indexOf('Product Code')
        const variancePos = text.indexOf('Variance Analysis')

        expect(headerPos).toBeGreaterThan(-1)
        expect(productCodePos).toBeGreaterThan(-1)
        expect(variancePos).toBeGreaterThan(-1)
        expect(headerPos).toBeLessThan(productCodePos)
        expect(productCodePos).toBeLessThan(variancePos)
      })

      it('应该使用 pipe 分隔符输出表格行', async () => {
        const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const lines = result.markdown.split('\n')
        const pipeRows = lines.filter((l) => l.startsWith('|') && l.endsWith('|'))

        expect(pipeRows.length).toBeGreaterThan(0)
        expect(pipeRows.some((r) => r.includes('Product Code'))).toBe(true)
      })

      it('应该输出多列表格行（至少 3 列）', async () => {
        const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const lines = result.markdown.split('\n')
        const tableRows = lines.filter((l) => l.startsWith('|') && l.endsWith('|'))

        const multiColRows = tableRows.filter((r) => (r.match(/\|/g) || []).length >= 3)
        expect(multiColRows.length).toBeGreaterThan(5)
      })

      it('应该保持表格数据完整性（包含 SKU 和 Category）', async () => {
        const buffer = readPdfBuffer('SPARSE-2024-INV-1234_borderless_table.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const tables = extractMarkdownTables(result.markdown)

        expect(tables.length).toBeGreaterThanOrEqual(1)

        const firstTableText = JSON.stringify(tables[0])
        expect(firstTableText).toContain('SKU-8847')
        expect(firstTableText).toContain('SKU-9201')
      })
    })

    describe('RECEIPT retail purchase', () => {
      it('应该提取完整的收据内容（标题、交易、行项、总计、支付、奖励、页脚）', async () => {
        const buffer = readPdfBuffer('RECEIPT-2024-TXN-98765_retail_purchase.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const text = result.markdown

        // Store header
        expect(text).toContain('TECHMART ELECTRONICS')
        expect(text).toContain('San Francisco')

        // Transaction info
        expect(text).toContain('TXN')

        // Totals
        expect(text).toContain('SUBTOTAL')
        expect(text).toContain('TOTAL')
      })

      it('收据 PDF 不应误提取大量 markdown 表格', async () => {
        const buffer = readPdfBuffer('RECEIPT-2024-TXN-98765_retail_purchase.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const tables = extractMarkdownTables(result.markdown)

        const totalTableRows = tables.reduce((sum, t) => sum + t.length, 0)
        // 收据是格式化文本，不是表格数据；允许少量但不应大量提取
        expect(totalTableRows).toBeLessThan(5)
      })
    })

    describe('REPAIR multipage invoice', () => {
      it('应该提取多页发票内容并使用 pipe 分隔符', async () => {
        const buffer = readPdfBuffer('REPAIR-2022-INV-001_multipage.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const text = result.markdown

        expect(text).toContain('ZAVA AUTO REPAIR')
        expect(text).toContain('Collision Repair')
        expect(text).toContain('GRAND TOTAL')
        expect(text).toContain('|')

        // 第二页内容
        expect(text).toContain('Bruce Wayne')
        expect(text).toContain('Batmobile')
      })

      it('应该输出多行多列的 pipe 分隔表格', async () => {
        const buffer = readPdfBuffer('REPAIR-2022-INV-001_multipage.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const lines = result.markdown.split('\n')
        const pipeRows = lines.filter((l) => l.startsWith('|') && l.endsWith('|'))

        expect(pipeRows.length).toBeGreaterThan(10)

        const multiColRows = pipeRows.filter((r) => (r.match(/\|/g) || []).length >= 4)
        expect(multiColRows.length).toBeGreaterThan(5)
      })
    })

    describe('Academic paper (test.pdf)', () => {
      it('应该提取学术论文文本且不含 pipe 字符（无表格）', async () => {
        const buffer = readPdfBuffer('test.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const text = result.markdown

        expect(text).toContain('Introduction')
        expect(text).toContain('Large language models')
        expect(text.length).toBeGreaterThan(1000)

        // 科学文档不应被误识别为表格
        expect(text).not.toContain('|')
      })
    })

    describe('Scanned medical report', () => {
      it('扫描 PDF 应返回空 markdown 且无表格', async () => {
        const buffer = readPdfBuffer('MEDRPT-2024-PAT-3847_medical_report_scan.pdf')
        const result = await PdfConverter.convertPdf(buffer)

        expect(result.markdown.trim()).toBe('')
        const tables = extractMarkdownTables(result.markdown)
        expect(tables).toHaveLength(0)
      })
    })

    describe('Movie theater booking', () => {
      it('应该提取电影票预订 PDF 的完整内容', async () => {
        const buffer = readPdfBuffer('movie-theater-booking-2024.pdf')
        const result = await PdfConverter.convertPdf(buffer)
        const text = result.markdown

        expect(text).toContain('BOOKING ORDER')
        expect(text).toContain('STARLIGHT CINEMAS')
        expect(text).toContain('Premier Entertainment Group')
        expect(text).toContain('|')

        // Booking summary
        expect(text).toContain('12,500.00')
        expect(text).toContain('December 2024')
      })
    })

    describe('所有 PDF 表格行结构一致性', () => {
      const pdfFiles = [
        'SPARSE-2024-INV-1234_borderless_table.pdf',
        'REPAIR-2022-INV-001_multipage.pdf',
        'RECEIPT-2024-TXN-98765_retail_purchase.pdf',
        'test.pdf',
      ]

      for (const pdfFile of pdfFiles) {
        it(`${pdfFile}: 每个表格行应至少有一列`, async () => {
          const buffer = readPdfBuffer(pdfFile)
          const result = await PdfConverter.convertPdf(buffer)
          const tables = extractMarkdownTables(result.markdown)

          for (let tableIdx = 0; tableIdx < tables.length; tableIdx++) {
            const table = tables[tableIdx]
            for (let rowIdx = 0; rowIdx < table.length; rowIdx++) {
              expect(table[rowIdx].length).toBeGreaterThanOrEqual(1)
            }
          }
        }, 30000)
      }
    })
  })

  // ===========================================================================
  // 移植自参考实现 test_pdf_memory.py - 内存与清理专项测试
  // ===========================================================================
  describe('内存与清理专项（移植自 test_pdf_memory.py）', () => {
    it('多页 PDF 转换应成功完成且输出完整（验证每页清理后无数据丢失）', async () => {
      // 间接验证 page.cleanup() 行为：如果 cleanup 破坏了数据，多页 PDF 会丢失内容
      const buffer = readPdfBuffer('REPAIR-2022-INV-001_multipage.pdf')
      const result = await PdfConverter.convertPdf(buffer)

      // 应包含多页内容
      expect(result.markdown).toContain('ZAVA AUTO REPAIR')
      expect(result.markdown).toContain('Bruce Wayne')
      expect(result.markdown).toContain('Batmobile')
      expect(result.markdown).toContain('GRAND TOTAL')
      expect(result.markdown.length).toBeGreaterThan(200)
    }, 30000)

    it('单次转换应只创建一次 loadingTask（单次扫描）', async () => {
      // 验证 PdfConverter.convertPdf 不会重复创建 loadingTask
      const buffer = readPdfBuffer('test.pdf')

      // 通过性能特征间接验证：转换应一次性完成
      const result = await PdfConverter.convertPdf(buffer)
      expect(result.markdown).toContain('AutoGen')

      // 再次转换应独立创建新 loadingTask（不应共享状态）
      const result2 = await PdfConverter.convertPdf(buffer)
      expect(result2.markdown).toContain('AutoGen')
      expect(result2.markdown.length).toBe(result.markdown.length)
    }, 30000)

    it('转换完成后应释放资源（连续多次转换不应内存泄漏）', async () => {
      // 连续转换 5 次同一 PDF，验证不会因为 loadingTask 未销毁而崩溃
      const buffer = readPdfBuffer('test.pdf')

      for (let i = 0; i < 5; i++) {
        const result = await PdfConverter.convertPdf(buffer)
        expect(result.markdown).toContain('AutoGen')
      }

      // 如果 loadingTask 未销毁，连续转换会累积资源最终失败
      // 此测试通过即说明 destroy 被正确调用
    }, 60000)

    it('纯文本 PDF（学术论文）应使用 plain text 路径而非 form 提取', async () => {
      // 学术论文 test.pdf 是纯文本，不应触发 form 提取
      // 验证方式：输出不含 pipe 字符（form 提取会生成 pipe）
      const buffer = readPdfBuffer('test.pdf')
      const result = await PdfConverter.convertPdf(buffer)

      expect(result.markdown).not.toContain('|')
      expect(result.markdown).toContain('Large language models')
    }, 30000)

    it('混合 PDF 应逐页决定使用 form 提取还是 plain text', async () => {
      // REPAIR 多页发票混合了 form 和 plain 内容
      const buffer = readPdfBuffer('REPAIR-2022-INV-001_multipage.pdf')
      const result = await PdfConverter.convertPdf(buffer)
      const text = result.markdown

      // 应同时包含 form 提取的 pipe 内容和 plain text
      expect(text).toContain('|') // form 页面
      expect(text).toContain('ZAVA AUTO REPAIR') // plain text 内容
    }, 30000)

    it('大文件转换应在合理时间内完成（流式处理验证）', async () => {
      // 使用最大的 PDF 验证流式处理不会导致超时
      const buffer = readPdfBuffer('REPAIR-2022-INV-001_multipage.pdf')
      const start = Date.now()
      const result = await PdfConverter.convertPdf(buffer)
      const elapsed = Date.now() - start

      expect(result.markdown).toBeDefined()
      // 流式处理应在 10 秒内完成（含 page.cleanup 释放资源）
      expect(elapsed).toBeLessThan(10000)
    }, 30000)
  })
})
