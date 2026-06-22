import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { formatMarkitdownError } from '../services/markitdown-errors.js'
import { convertToMarkdown } from '../services/markitdown-service.js'
import { isInsideRoot, resolvePathWithBase } from '../utils/path-utils.js'

export const aeMarkitdownTool = tool({
  description: [
    '将本地文件转换为 Markdown。',
    '',
    '功能说明：',
    '- 支持格式：HTML、CSV、TSV、JSON、XML、YAML、TXT、Markdown、DOCX、XLSX、PDF、IPYNB、PPTX、ZIP、JPG、RSS、EPUB、MSG',
    '- HTML 使用 turndown 转换为 GFM Markdown（标题、列表、表格、链接等）',
    '- CSV/TSV 转换为 Markdown 表格',
    '- JSON 对象数组转换为表格，其他 JSON 格式化在代码块中',
    '- DOCX 通过 mammoth 提取 HTML 后转 Markdown',
    '- XLSX 逐工作表转换为 Markdown 表格',
    '- PDF 提取文本并识别表格/表单结构（无边框表格、表单样式）',
    '- IPYNB 按单元格类型输出代码块或 Markdown',
    '- PPTX 提取幻灯片文本和图片引用',
    '- ZIP 递归转换内部文件',
    '- JPG/PNG 提取 EXIF 元数据',
    '- RSS/Atom 提取频道和条目',
    '- EPUB 提取章节内容',
    '- MSG 提取 Outlook 邮件内容',
    '',
    '可选输出：',
    '- 提供 outputPath 参数时，转换结果会同时写入指定 .md 文件；路径必须位于当前工作区内',
    '- 未提供 outputPath 时，转换结果仅通过 output 字段返回',
    '',
    '适用场景：',
    '- 需要将本地文档统一为 Markdown 格式',
    '- 需要读取非文本格式文件（DOCX、XLSX、PDF、PPTX 等）内容',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持音频、视频等非文档格式',
    '- 单文件默认上限 100 MB，可通过环境变量 AE_MARKITDOWN_MAX_BYTES 调整',
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
        'xml',
        'yaml',
        'text',
        'markdown',
        'docx',
        'xlsx',
        'pdf',
        'ipynb',
        'pptx',
        'zip',
        'jpg',
        'rss',
        'epub',
        'msg',
      ])
      .optional()
      .describe('显式指定文件格式；省略时根据文件扩展名自动推断。'),
    outputPath: z
      .string()
      .min(1)
      .optional()
      .describe('可选的输出 .md 文件路径，支持绝对路径或相对于工作区的相对路径；指定后转换结果将写入该文件。'),
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

      let savedPath: string | undefined
      if (args.outputPath) {
        const baseDirectory = path.resolve(ctx.directory ?? ctx.worktree)
        const resolved = resolvePathWithBase(baseDirectory, args.outputPath)
        if (!isInsideRoot(ctx.worktree, resolved)) {
          return formatMarkitdownError(
            new Error('outputPath 路径越界：输出路径必须位于当前工作区内。'),
          )
        }
        mkdirSync(path.dirname(resolved), { recursive: true })
        writeFileSync(resolved, output, 'utf8')
        savedPath = resolved
      }

      return {
        output,
        metadata: {
          tool: TOOL.AE_MARKITDOWN,
          format: result.format,
          filePath: result.filePath,
          fileSize: result.fileSize,
          title: result.title,
          outputPath: savedPath,
        },
      }
    } catch (error) {
      return formatMarkitdownError(error)
    }
  },
})
