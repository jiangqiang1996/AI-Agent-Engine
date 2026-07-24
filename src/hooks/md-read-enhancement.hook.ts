import { basename, extname } from 'node:path'
import type { Hooks } from '@opencode-ai/plugin'

import {
  computeCoverage,
  formatStructureSummary,
  offsetSectionLines,
  parseMdStructure,
  shouldEnhance,
} from '../services/md-structure-service.js'

/**
 * tool.execute.after hook：Read 工具对 .md 文件的渐进式读取增强。
 *
 * 核心理念（来自多轮头脑风暴共识）：
 * - 零采用成本：LLM 本来就调 Read，增强自动生效，无需学习新工具
 * - 不替换原文：始终前置结构摘要，原始内容完整保留
 * - 摘要足以导航，不足以替代阅读（每章节预览 ≤80 字符）
 * - 透明降级：任何步骤失败返回原始 output，增强失败不比不增强更差
 *
 * 触发条件：
 * - event.tool === "read"
 * - 文件扩展名为 .md
 * - 内容被截断 OR 总行数 > 200 OR LLM 使用了 offset/limit
 *
 * 增强行为：
 * - 解析 Markdown AST，提取标题树 + 行范围 + 预览
 * - 使用 offset 偏移将章节行号转为文件绝对行号
 * - 计算当前 Read 已覆盖和未覆盖的章节
 * - 生成可执行的恢复指令（具体 offset/limit 参数）
 * - 将结构摘要前置到 output.output
 */

/** Read 工具名 */
const READ_TOOL_NAME = 'read'

/**
 * 判断工具是否为 read。
 */
function isReadTool(toolName: string | undefined): boolean {
  return toolName === READ_TOOL_NAME
}

/**
 * 判断文件路径是否为 .md 文件。
 */
function isMarkdownFile(filePath: string | undefined): boolean {
  if (!filePath) {
    return false
  }
  return extname(filePath).toLowerCase() === '.md'
}

/**
 * 从 hook input 的 args 中提取文件路径。
 */
function extractFilePath(args: unknown): string | undefined {
  if (!args || typeof args !== 'object') {
    return undefined
  }
  const record = args as Record<string, unknown>
  const path = record.path ?? record.filePath ?? record.file
  if (typeof path === 'string' && path.length > 0) {
    return path
  }
  return undefined
}

/**
 * 从 hook input 的 args 中提取 offset 和 limit 参数。
 */
function extractOffsetLimit(args: unknown): { offset?: number; limit?: number } {
  if (!args || typeof args !== 'object') {
    return {}
  }
  const record = args as Record<string, unknown>
  const offset = typeof record.offset === 'number' ? record.offset : undefined
  const limit = typeof record.limit === 'number' ? record.limit : undefined
  return { offset, limit }
}

/** 提取结果：文本内容 + 截断标记 + 写回函数 */
interface ExtractResult {
  content: string
  truncated: boolean
  /** 将增强后的内容写回 output */
  writeBack: (enhanced: string) => void
}

/**
 * 从 output 容器中提取文本内容、截断信息和写回函数。
 *
 * opencode Read 工具对 .md 文件可能返回多种结构，
 * 提取和写回必须对称：每条提取路径都有对应的写回路径。
 * 接收容器引用以确保字符串类型也能正确写回。
 */
function extractContent(container: { output: unknown }): ExtractResult | null {
  const output = container.output

  if (output == null) {
    return null
  }

  // 字符串
  if (typeof output === 'string') {
    return {
      content: output,
      truncated: false,
      writeBack: (enhanced) => { container.output = enhanced },
    }
  }

  if (typeof output !== 'object') {
    return null
  }

  const obj = output as Record<string, unknown>

  // { content: string }
  if (typeof obj.content === 'string') {
    const truncated = obj.truncated === true || obj.type === 'text-page'
    return {
      content: obj.content,
      truncated,
      writeBack: (enhanced) => { obj.content = enhanced },
    }
  }

  // { text: string }
  if (typeof obj.text === 'string') {
    return {
      content: obj.text,
      truncated: false,
      writeBack: (enhanced) => { obj.text = enhanced },
    }
  }

  // { output: { content: string } } 嵌套结构
  if (obj.output != null && typeof obj.output === 'object') {
    const inner = obj.output as Record<string, unknown>
    if (typeof inner.content === 'string') {
      const truncated = inner.truncated === true || inner.type === 'text-page'
      return {
        content: inner.content,
        truncated,
        writeBack: (enhanced) => { inner.content = enhanced },
      }
    }
  }

  // { output: string }
  if (typeof obj.output === 'string') {
    return {
      content: obj.output,
      truncated: false,
      writeBack: (enhanced) => { obj.output = enhanced },
    }
  }

  // { result: string }
  if (typeof obj.result === 'string') {
    return {
      content: obj.result,
      truncated: false,
      writeBack: (enhanced) => { obj.result = enhanced },
    }
  }

  return null
}

/**
 * 创建 Read 增强 hook。
 *
 * hook 行为：
 * 1. 检测 event.tool === "read" 且文件为 .md
 * 2. 从 output 提取原始内容
 * 3. 判断是否需要增强（截断/超阈值/offset-limit）
 * 4. 解析 Markdown 结构，偏移行号为绝对行号
 * 5. 计算覆盖范围，生成摘要，前置到 output.output
 * 6. 任何异常静默降级，不阻断 Read
 */
export function createMdReadEnhancementHook(): NonNullable<Hooks['tool.execute.after']> {
  return async (input, output) => {
    try {
      // 1. 检测触发条件
      if (!isReadTool(input.tool)) {
        return
      }

      const filePath = extractFilePath(input.args)
      if (!isMarkdownFile(filePath)) {
        return
      }

      // 2. 提取原始内容
      const extracted = extractContent(output)
      if (!extracted) {
        return
      }

      const { content, truncated, writeBack } = extracted
      if (content.length === 0) {
        return
      }

      // 3. 判断是否需要增强
      const { offset } = extractOffsetLimit(input.args)
      const usedOffsetLimit = offset !== undefined
      const totalLines = content.split('\n').length

      if (!shouldEnhance(totalLines, truncated, usedOffsetLimit)) {
        return
      }

      // 4. 解析 Markdown 结构
      const structure = parseMdStructure(content)
      if (!structure || structure.sections.length === 0) {
        return
      }

      // 5. 偏移行号为文件绝对行号
      const returnedStart = offset ?? 1
      const returnedEnd = returnedStart + totalLines - 1
      const lineOffset = returnedStart - 1
      const absoluteStructure = offsetSectionLines(structure, lineOffset)

      // 6. 计算覆盖范围
      const coverage = computeCoverage(absoluteStructure.sections, returnedStart, returnedEnd)

      // 7. 生成结构摘要并前置到 output
      const fileName = basename(filePath!)
      const summary = formatStructureSummary(fileName, absoluteStructure, coverage, returnedStart, returnedEnd)
      const enhancedContent = `${summary}\n\n---\n${content}`
      writeBack(enhancedContent)
    } catch (error) {
      // 增强失败绝不阻断 Read 操作，但记录错误便于排查
      console.warn('[md-read-enhancement] 增强失败，降级为原始输出:', error)
    }
  }
}
