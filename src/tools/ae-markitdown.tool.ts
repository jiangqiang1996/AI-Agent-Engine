import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { formatMarkitdownError } from '../services/markitdown-errors.js'
import { convertToMarkdown } from '../services/markitdown-service.js'

export const aeMarkitdownTool = tool({
  description: [
    '将本地文件转换为 Markdown。',
    '',
    '功能说明：',
    '- 支持格式：HTML、CSV、TSV、JSON、XML、YAML、TXT、Markdown、DOCX、XLSX、PDF、IPYNB',
    '- HTML 使用 turndown 转换为 GFM Markdown（标题、列表、表格、链接等）',
    '- CSV/TSV 转换为 Markdown 表格',
    '- JSON 对象数组转换为表格，其他 JSON 格式化在代码块中',
    '- DOCX 通过 mammoth 提取 HTML 后转 Markdown',
    '- XLSX 逐工作表转换为 Markdown 表格',
    '- PDF 提取纯文本到代码块',
    '- IPYNB 按单元格类型输出代码块或 Markdown',
    '',
    '适用场景：',
    '- 需要将本地文档统一为 Markdown 格式',
    '- 需要读取非文本格式文件（DOCX、XLSX、PDF）内容',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持音频、视频、图片等非文档格式',
    '- 单文件上限 10 MB',
  ].join('\n'),
  args: {
    file: z
      .string()
      .min(1)
      .describe('要转换的本地文件路径，支持绝对路径或相对于工作区的相对路径。'),
    format: z
      .enum(['html', 'csv', 'json', 'xml', 'yaml', 'text', 'markdown', 'docx', 'xlsx', 'pdf', 'ipynb'])
      .optional()
      .describe('显式指定文件格式；省略时根据文件扩展名自动推断。'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `转换文件为 Markdown: ${args.file}` })

    try {
      const result = await convertToMarkdown({
        file: args.file,
        worktree: ctx.worktree,
      })

      const header = result.title ? `# ${result.title}\n\n` : ''
      const output = header + result.markdown

      return {
        output,
        metadata: {
          tool: TOOL.AE_MARKITDOWN,
          format: result.format,
          filePath: result.filePath,
          fileSize: result.fileSize,
          title: result.title,
        },
      }
    } catch (error) {
      return formatMarkitdownError(error)
    }
  },
})
