import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Heading, Root, Text, PhrasingContent, InlineCode } from 'mdast'

/**
 * Markdown 渐进式读取结构解析服务。
 *
 * 使用 mdast-util-from-markdown 将 Markdown 解析为 AST，
 * 提取标题树和每个章节的行范围，生成轻量结构摘要。
 *
 * 设计原则：
 * - 纯函数无状态，每次调用实时解析
 * - 摘要足以导航，不足以替代阅读（每章节预览 ≤80 字符）
 * - 透明降级：解析失败返回 null，调用方回退到原始内容
 */

/** 触发增强的最小行数阈值 */
export const ENHANCEMENT_THRESHOLD_LINES = 200

/** 每个章节预览的最大字符数 */
export const MAX_PREVIEW_CHARS = 80

/** 结构摘要的最大 token 估算值 */
export const MAX_SUMMARY_TOKENS = 800

/** 标题层级前缀映射 */
const HEADING_PREFIX: Record<number, string> = {
  1: 'H1',
  2: 'H2',
  3: 'H3',
  4: 'H4',
  5: 'H5',
  6: 'H6',
}

/** 章节结构信息 */
export interface MdSection {
  /** 章节序号，如 s1、s2 */
  id: string
  /** 标题层级 1-6 */
  depth: number
  /** 标题文本 */
  title: string
  /** 层级标签，如 H1、H2 */
  level: string
  /** 起始行号（1-based） */
  startLine: number
  /** 结束行号（1-based，含） */
  endLine: number
  /** 章节预览文本（≤80 字符） */
  preview: string
}

/** 文档结构解析结果 */
export interface MdStructure {
  /** 文件总行数 */
  totalLines: number
  /** 所有章节列表 */
  sections: MdSection[]
}

/** 已覆盖/未覆盖的章节分组 */
export interface CoverageResult {
  /** 已覆盖的章节 ID 列表 */
  covered: string[]
  /** 未覆盖的章节信息列表 */
  uncovered: MdSection[]
}

/**
 * 转义 Markdown 表格单元格中的特殊字符。
 * | 会破坏表格列分隔，换行会破坏行结构。
 */
function escapeTableCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/**
 * 从 mdast 节点递归提取所有 text 子节点的纯文本。
 * 处理 link/code/emphasis/strong 等内联节点的嵌套 children。
 */
function extractInlineText(children: ReadonlyArray<PhrasingContent>): string {
  const texts: string[] = []
  for (const child of children) {
    if (child.type === 'text') {
      texts.push((child as Text).value)
    } else if (child.type === 'inlineCode') {
      texts.push((child as InlineCode).value)
    } else if ('children' in child && child.children) {
      texts.push(extractInlineText(child.children as ReadonlyArray<PhrasingContent>))
    }
  }
  return texts.join('')
}

/**
 * 从 mdast heading 节点提取纯文本标题，递归处理内联节点。
 */
function extractHeadingText(node: Heading): string {
  return extractInlineText(node.children).trim()
}

/**
 * 提取章节预览：该 heading 之后、下一个 heading 之前的首行非标题文本。
 */
function extractPreview(lines: string[], headingLine: number, nextHeadingLine: number | undefined): string {
  const end = nextHeadingLine !== undefined ? nextHeadingLine - 1 : lines.length
  for (let i = headingLine; i < end; i++) {
    const line = lines[i]?.trim() ?? ''
    if (line === '' || line.startsWith('#')) {
      continue
    }
    return line.length > MAX_PREVIEW_CHARS ? line.slice(0, MAX_PREVIEW_CHARS) + '...' : line
  }
  return ''
}

/**
 * 解析 Markdown 文本，提取标题树和章节行范围。
 *
 * @param content Markdown 文本内容
 * @returns 解析结果；解析失败返回 null
 */
export function parseMdStructure(content: string): MdStructure | null {
  try {
    const tree = fromMarkdown(content) as Root
    const lines = content.split('\n')
    const totalLines = lines.length

    const headings: { node: Heading; text: string; line: number }[] = []
    for (const child of tree.children) {
      if (child.type === 'heading' && child.position?.start?.line) {
        headings.push({
          node: child,
          text: extractHeadingText(child),
          line: child.position.start.line,
        })
      }
    }

    if (headings.length === 0) {
      return { totalLines, sections: [] }
    }

    const sections: MdSection[] = headings.map((item, index) => {
      const nextHeading = headings[index + 1]
      const startLine = item.line
      const endLine = nextHeading ? nextHeading.line - 1 : totalLines
      const preview = extractPreview(lines, startLine, nextHeading?.line)

      return {
        id: `s${index + 1}`,
        depth: item.node.depth,
        title: item.text,
        level: HEADING_PREFIX[item.node.depth] ?? `H${item.node.depth}`,
        startLine,
        endLine,
        preview,
      }
    })

    return { totalLines, sections }
  } catch {
    return null
  }
}

/**
 * 将章节的行号偏移为文件绝对行号。
 *
 * parseMdStructure 返回的行号是相对于传入内容的 1-based 行号。
 * 当 LLM 使用 offset 读取文件中间部分时，需要加上偏移量转为绝对行号。
 *
 * @param structure 解析结果
 * @param lineOffset 偏移量（offset - 1），如 offset=50 则偏移 49
 */
export function offsetSectionLines(structure: MdStructure, lineOffset: number): MdStructure {
  if (lineOffset === 0) {
    return structure
  }
  return {
    totalLines: structure.totalLines,
    sections: structure.sections.map(s => ({
      ...s,
      startLine: s.startLine + lineOffset,
      endLine: s.endLine + lineOffset,
    })),
  }
}

/**
 * 计算已覆盖和未覆盖的章节。
 *
 * @param sections 所有章节
 * @param returnedStart 当前 Read 返回的起始行（1-based）
 * @param returnedEnd 当前 Read 返回的结束行（1-based）
 */
export function computeCoverage(sections: MdSection[], returnedStart: number, returnedEnd: number): CoverageResult {
  const covered: string[] = []
  const uncovered: MdSection[] = []

  for (const section of sections) {
    if (section.startLine <= returnedEnd && section.endLine >= returnedStart) {
      covered.push(section.id)
    } else {
      uncovered.push(section)
    }
  }

  return { covered, uncovered }
}

/**
 * 逐章节累加实际未覆盖行数。
 */
function sumUncoveredLines(uncovered: ReadonlyArray<MdSection>): number {
  return uncovered.reduce((sum, s) => sum + (s.endLine - s.startLine + 1), 0)
}

/**
 * 生成结构摘要文本。
 *
 * @param fileName 文件名
 * @param structure 文档结构
 * @param coverage 覆盖信息
 * @param returnedStart 当前 Read 返回的起始行
 * @param returnedEnd 当前 Read 返回的结束行
 * @returns 结构摘要文本；超过 token 上限时截断
 */
export function formatStructureSummary(
  fileName: string,
  structure: MdStructure,
  coverage: CoverageResult,
  returnedStart: number,
  returnedEnd: number,
): string {
  const { totalLines, sections } = structure
  const lines: string[] = []

  lines.push(`<file-structure-summary file="${fileName}" total-lines="${totalLines}" returned-lines="${returnedStart}-${returnedEnd}">`)
  lines.push('## 文档结构')
  lines.push('')

  // 标题树表
  lines.push('| 章节 | 层级 | 行范围 | 预览 |')
  lines.push('|------|------|--------|------|')
  for (const section of sections) {
    const title = escapeTableCell(section.title)
    const preview = escapeTableCell(section.preview)
    lines.push(`| ${title} | ${section.level} | ${section.startLine}-${section.endLine} | ${preview} |`)
  }
  lines.push('')

  // 已覆盖
  if (coverage.covered.length > 0) {
    lines.push('## 已覆盖')
    lines.push(coverage.covered.map(id => `✅ ${id}`).join(' '))
    lines.push('')
  }

  // 未覆盖
  if (coverage.uncovered.length > 0) {
    const uncoveredLines = sumUncoveredLines(coverage.uncovered)
    lines.push(`## 未覆盖（${coverage.uncovered.length} 个章节，约 ${uncoveredLines} 行）`)
    for (const section of coverage.uncovered) {
      const title = escapeTableCell(section.title)
      const preview = escapeTableCell(section.preview)
      lines.push(`⬜ ${title} (${section.startLine}-${section.endLine}) — ${preview}`)
    }
    lines.push('')

    // 读取建议
    lines.push('## 读取建议')
    lines.push(`可用以下方式继续读取：`)
    for (const section of coverage.uncovered.slice(0, 5)) {
      const limit = section.endLine - section.startLine + 1
      lines.push(`- 读"${section.title}"：Read(path, offset=${section.startLine}, limit=${limit})`)
    }
    if (coverage.uncovered.length > 5) {
      const firstUncovered = coverage.uncovered[0].startLine
      lines.push(`- 读全部剩余：Read(path, offset=${firstUncovered})`)
    }
  }

  lines.push('</file-structure-summary>')

  const result = lines.join('\n')

  // token 估算：粗略按 4 字符 = 1 token
  const estimatedTokens = result.length / 4
  if (estimatedTokens > MAX_SUMMARY_TOKENS) {
    // 截断深层标题：只保留 H1-H2
    const truncatedSections = sections.filter(s => s.depth <= 2)
    // 如果截断后章节集与原集相同（已全是 H1-H2），直接硬截断避免无限递归
    if (truncatedSections.length === sections.length) {
      return result.slice(0, MAX_SUMMARY_TOKENS * 4) + '\n[摘要已截断]'
    }
    const truncatedStructure: MdStructure = { totalLines, sections: truncatedSections }
    const truncatedCoverage = computeCoverage(truncatedSections, returnedStart, returnedEnd)
    return formatStructureSummary(fileName, truncatedStructure, truncatedCoverage, returnedStart, returnedEnd)
  }

  return result
}

/**
 * 判断是否需要增强。
 *
 * @param totalLines 文件总行数
 * @param truncated Read 是否返回了截断标记
 * @param usedOffsetLimit LLM 是否使用了 offset/limit 参数
 */
export function shouldEnhance(totalLines: number, truncated: boolean, usedOffsetLimit: boolean): boolean {
  return truncated || totalLines > ENHANCEMENT_THRESHOLD_LINES || usedOffsetLimit
}
