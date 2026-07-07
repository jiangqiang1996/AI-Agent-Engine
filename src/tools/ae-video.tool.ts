import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { loadDocumentFile } from '../services/document-file-loader.js'
import { recognizeMediaWithModel } from '../services/vision-service.js'
import { writeMarkdownOutput } from '../services/markdown-output-writer.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

export const aeVideoTool = tool({
  description: [
    '将本地视频转换为 Markdown 描述。',
    '',
    '功能说明：',
    '- 读取 MP4/WebM/AVI/MOV/MKV/FLV 视频',
    '- 调用 modelScenarios.video 配置的模型识别视频内容，未配置时由 opencode 自行分配模型',
    '- 返回结构化 Markdown 描述，支持场景时间线、对话转写、字幕识别、动作事件等',
    '- 支持 prompt 参数指定识别重点，覆盖默认提示词',
    '- 支持 outputMode 参数：file 写入文件（默认），inline 直接返回内容',
    '',
    '输出：',
    '- outputMode=file 时写入 ae/markdown/ 子目录（除非指定 outputPath）',
    '- outputMode=inline 时直接返回 Markdown 内容，不写文件',
    '',
    '适用场景：',
    '- 用户需要将视频内容转为可阅读的 Markdown 文本',
    '- 需要识别视频中的画面、对话、旁白、字幕、动作等',
    '- 需要定向识别视频特定内容（通过 prompt 参数）',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持图片、音频等非视频格式',
  ].join('\n'),
  args: {
    file: z
      .string()
      .describe('视频文件路径（MP4/WebM/AVI/MOV/MKV/FLV），位于当前工作区内'),
    format: z
      .enum(['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv'])
      .optional()
      .describe('显式指定视频格式；省略时根据文件扩展名自动推断'),
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
      .describe('视频识别提示词；指定时覆盖默认提示，用于定向识别视频特定内容'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `Video → Markdown`, metadata: { file: args.file } })

    try {
      const { buffer, filePath } = await loadDocumentFile(args.file, ctx.worktree, '视频')
      const result = await recognizeMediaWithModel({
        filePath,
        mediaBuffer: buffer,
        prompt: args.prompt,
        format: args.format,
        kind: 'video',
      })
      const markdown = result.markdown || '（视频模型未返回有效识别内容）'
      const output = writeMarkdownOutput(markdown, ctx.worktree, 'video', args.outputPath, args.outputMode)

      return {
        output: output.content,
        metadata: {
          tool: TOOL.AE_VIDEO,
          outputPath: output.outputPath,
          summary: output.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('视频', error)
    }
  },
})
