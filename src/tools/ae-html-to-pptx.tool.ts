import { tool } from '@opencode-ai/plugin'
import { resolve } from 'node:path'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { convertHtmlToPptx, formatHtmlToPptxError } from '../services/html-to-pptx-service.js'

function formatResult(result: { outputPath: string; slideCount: number; warnings: string[] }): string {
  return [
    `# HTML 转 PPTX 结果：success`,
    '',
    `- 输出路径：${result.outputPath}`,
    `- 幻灯片数量：${result.slideCount}`,
    result.warnings.length > 0 ? `- 警告：${result.warnings.join('；')}` : '- 警告：无',
  ].join('\n')
}

function formatFailedResult(message: string): string {
  return [
    '# HTML 转 PPTX 结果：failed',
    '',
    `- 错误：${message}`,
  ].join('\n')
}

export const aeHtmlToPptxTool = tool({
  description: [
    '将 HTML 文件转换为 PPTX 演示文稿。',
    '',
    '功能说明：',
    '- 读取当前工作区内的 HTML 文件',
    '- 按 section / hr / h1 标签自动分页（可指定策略）',
    '- 映射 h1-h6 为标题文本、p 为正文、img 为图片、ul/ol 为列表、table 为表格、blockquote 为引用',
    '- 内联 data URI 图片直接嵌入，本地图片路径自动解析',
    '- 调用 pptxgenjs 生成 .pptx 文件，自动写入 ae/documents/pptx/ 目录',
    '',
    '适用场景：',
    '- 将 ae:html-slides 生成的 HTML 幻灯片转换为 PPTX',
    '- 将已有 HTML 内容快速转为演示文稿',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地 HTML 文件',
    '- 不保留 CSS 样式、布局和动画，仅提取结构化内容',
    '- 不处理 JavaScript 动态渲染的内容',
  ].join('\n'),
  args: {
    file: z.string().min(1).describe('HTML 文件路径，支持绝对路径或相对于工作区的相对路径'),
    title: z.string().optional().describe('演示文稿标题，省略时从 HTML 的 h1 或 title 标签提取'),
    output: z.string().optional().describe('输出 PPTX 文件路径，省略时自动生成到 ae/documents/pptx/'),
    slide_separator: z.enum(['section', 'hr', 'h1', 'auto']).optional().describe('幻灯片分页策略：section 按 <section> 分页，hr 按 <hr> 分页，h1 按 <h1> 分页，auto 自动选择（默认）'),
  },
  execute: async (args, ctx) => {
    const worktree = resolve(ctx.worktree)
    ctx.metadata({ title: `HTML 转 PPTX: ${args.file}` })

    try {
      const result = await convertHtmlToPptx({
        file: args.file,
        worktree,
        title: args.title,
        outputPath: args.output,
        slideSeparator: args.slide_separator,
      })
      return {
        output: formatResult(result),
        metadata: {
          tool: TOOL.AE_HTML_TO_PPTX,
          status: 'success',
          outputPath: result.outputPath,
          slideCount: result.slideCount,
        },
      }
    } catch (error) {
      return {
        output: formatFailedResult(formatHtmlToPptxError(error)),
        metadata: { tool: TOOL.AE_HTML_TO_PPTX, status: 'failed' },
      }
    }
  },
})
