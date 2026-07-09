import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { readMediaContent } from '../services/media-content-service.js'
import { recognizeMediaWithModel } from '../services/vision-service.js'
import { writeMarkdownOutput } from '../services/markdown-output-writer.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

export const aeAudioTool = tool({
  description: [
    '将本地音频转换为 Markdown 描述。',
    '',
    '功能说明：',
    '- 读取 MP3/WAV/OGG/FLAC/M4A/AAC 音频',
    '- 通过 magic bytes 检测音频 MIME 类型，扩展名作为 fallback',
    '- 调用 modelScenarios.audio 配置的模型识别音频内容，未配置时由 opencode 自行分配模型',
    '- 返回结构化 Markdown 描述，支持语音转写、背景声音识别、情绪分析等',
    '- 支持 prompt 参数指定识别重点，覆盖默认提示词',
    '- 支持 outputMode 参数：file 写入文件（默认），inline 直接返回内容',
    '',
    '输出：',
    '- outputMode=file 时写入 ae/markdown/ 子目录（除非指定 outputPath）',
    '- outputMode=inline 时直接返回 Markdown 内容，不写文件',
    '',
    '适用场景：',
    '- 用户需要将音频内容转为可阅读的 Markdown 文本',
    '- 需要识别音频中的语音、对话、环境声音、音乐等',
    '- 需要定向识别音频特定内容（通过 prompt 参数）',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持图片、视频等非音频格式',
  ].join('\n'),
  args: {
    file: z
      .string()
      .describe('音频文件路径（MP3/WAV/OGG/FLAC/M4A/AAC），位于当前工作区内'),
    format: z
      .enum(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'])
      .optional()
      .describe('显式指定音频格式；省略时根据文件扩展名自动推断'),
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
      .describe('音频识别提示词；指定时覆盖默认提示，用于定向识别音频特定内容'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `Audio → Markdown`, metadata: { file: args.file } })

    try {
      const media = await readMediaContent(args.file, ctx.worktree, 'audio', args.format)
      const result = await recognizeMediaWithModel({
        media,
        prompt: args.prompt,
        kind: 'audio',
      })
      const markdown = result.markdown || '（音频模型未返回有效识别内容）'
      const output = writeMarkdownOutput(markdown, ctx.worktree, 'audio', args.outputPath, args.outputMode)

      return {
        output: output.content,
        metadata: {
          tool: TOOL.AE_AUDIO,
          outputPath: output.outputPath,
          summary: output.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('音频', error)
    }
  },
})
