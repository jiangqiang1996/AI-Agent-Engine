import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { readMediaContent } from '../services/media-content-service.js'
import { recognizeMediaWithModel } from '../services/vision-service.js'
import { writeMarkdownOutput } from '../services/markdown-output-writer.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

export const aeImageTool = tool({
  description: [
    '将本地图片转换为 Markdown 描述。',
    '',
    '功能说明：',
    '- 读取 JPG/PNG/GIF/WebP/BMP 图片',
    '- 通过 magic bytes 检测图片 MIME 类型，扩展名作为 fallback',
    '- 调用 modelScenarios.vision 配置的模型识别图片内容，未配置时由 opencode 自行分配模型',
    '- 返回结构化 Markdown 描述，支持文字、图表、UI 截图等识别',
    '- 支持 prompt 参数指定识别重点，覆盖默认提示词',
    '- 支持 outputMode 参数：file 写入文件（默认），inline 直接返回内容',
    '',
    '输出：',
    '- outputMode=file 时写入 ae/markdown/ 子目录（除非指定 outputPath）',
    '- outputMode=inline 时直接返回 Markdown 内容，不写文件',
    '',
    '适用场景：',
    '- 用户需要将图片内容转为可阅读的 Markdown 文本',
    '- 需要识别图片中的文字、图表、UI 截图等',
    '- 需要定向识别图片特定内容（通过 prompt 参数）',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持 SVG（SVG 可用 Read 工具直接读取）',
  ].join('\n'),
  args: {
    file: z
      .string()
      .describe('图片文件路径（JPG/PNG/GIF/WebP/BMP），位于当前工作区内'),
    format: z
      .enum(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])
      .optional()
      .describe('显式指定图片格式；省略时根据文件扩展名自动推断'),
    outputPath: z
      .string()
      .optional()
      .describe('自定义输出路径；outputMode=file 时写入此路径，省略时自动生成到 ae/markdown/'),
    outputMode: z
      .enum(['file', 'inline'])
      .optional()
      .describe('输出模式：file 写入文件（默认），inline 直接返回内容不写文件'),
    prompt: z
      .string()
      .optional()
      .describe('图片识别提示词；指定时覆盖默认提示，用于定向识别图片特定内容'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `Image → Markdown`, metadata: { file: args.file } })

    try {
      const media = await readMediaContent(args.file, ctx.worktree, 'image', args.format)
      const result = await recognizeMediaWithModel({
        media,
        prompt: args.prompt,
        kind: 'image',
      })
      const markdown = result.markdown || '（vision 模型未返回有效识别内容）'
      const output = writeMarkdownOutput(markdown, ctx.worktree, 'image', args.outputPath, args.outputMode)

      return {
        output: output.content,
        metadata: {
          tool: TOOL.AE_IMAGE,
          outputPath: output.outputPath,
          summary: output.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('图片', error)
    }
  },
})
