import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { formatMarkitdownError } from '../services/markitdown-errors.js'
import { convertToMarkdown, generateMarkitdownOutputPath } from '../services/markitdown-service.js'

export const aeMarkitdownTool = tool({
  description: [
    '将本地文件转换为 Markdown。',
    '',
    '功能说明：',
    '- 支持格式：HTML、CSV、TSV、JSON、DOCX、XLSX、PDF、PPTX、JPG、PNG',
    '- HTML 使用 turndown 转换为 GFM Markdown（标题、列表、表格、链接等）',
    '- CSV/TSV 转换为 Markdown 表格',
    '- JSON 对象数组转换为表格，其他 JSON 格式化在代码块中',
    '- DOCX 通过 mammoth 提取 HTML 后转 Markdown',
    '- XLSX 逐工作表转换为 Markdown 表格',
    '- PDF 提取文本并识别表格/表单结构（无边框表格、表单样式）',
    '- PPTX 提取幻灯片文本和图片引用',
    '- JPG/PNG 使用配置的 vision 模型识别图片内容并输出 Markdown',
    '',
    '输出：',
    '- 转换结果自动写入当前工作区 `ae/markitdown/` 子目录',
    '- 文件名规则：`<原始文件名>-<时间戳>-<随机串>.md`，保留原始文件名便于追溯，时间戳与随机串确保反复转换不冲突',
    '- 写入路径通过 metadata.outputPath 返回',
    '',
    '调用纪律：',
    '- 本工具针对同一文件参数在一次响应中只调用一次，收到返回值后任务即完成',
    '- 禁止在未收到用户新指令的情况下，再次发起相同参数的工具调用',
    '- 如需展示结果，直接使用已返回的 output 和 outputPath，不要重复调用',
    '',
    '适用场景：',
    '- 需要将本地文档统一为 Markdown 格式',
    '- 需要读取非文本格式文件（DOCX、XLSX、PDF、PPTX 等）内容',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持音频、视频等非文档格式',
    '- 单文件默认上限 100 MB，可通过环境变量 AE_MARKITDOWN_MAX_BYTES 调整',
    '',
    '调用纪律：',
    '- 同一文件在一次会话中只调用一次；重复调用会产生冗余产物文件',
    '- 返回值 metadata.existingOutputs 列出本次之前已有的同源产物路径，非空时说明已转换过，不应再次调用',
    '- 如需保留多次转换历史（例如源文件已修改），可显式再次调用，工具不会去重',
  ].join('\n'),
  args: {
    file: z
      .string()
      .min(1)
      .describe('要转换的本地文件路径，支持绝对路径或相对于工作区的相对路径。'),
    format: z
      .enum([
        'html',
        'csv',
        'json',
        'docx',
        'xlsx',
        'pdf',
        'pptx',
        'jpg',
      ])
      .optional()
      .describe('显式指定文件格式；省略时根据文件扩展名自动推断。'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `转换文件为 Markdown: ${args.file}` })

    try {
      const result = await convertToMarkdown({
        file: args.file,
        worktree: ctx.worktree,
        format: args.format,
      })

      const header = result.title ? `# ${result.title}\n\n` : ''
      const output = header + result.markdown

      const outputPath = generateMarkitdownOutputPath(ctx.worktree, result.filePath)
      mkdirSync(path.dirname(outputPath), { recursive: true })
      writeFileSync(outputPath, output, 'utf8')

      return {
        output,
        metadata: {
          tool: TOOL.AE_MARKITDOWN,
          format: result.format,
          filePath: result.filePath,
          fileSize: result.fileSize,
          title: result.title,
          outputPath,
        },
      }
    } catch (error) {
      return formatMarkitdownError(error)
    }
  },
})
