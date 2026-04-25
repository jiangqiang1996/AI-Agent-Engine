import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { generateHelpText } from '../services/help-catalog-service.js'

export const aeHelpTool = tool({
  description: [
    '获取 AE 插件中所有可调用的技能、命令和代理的完整列表。',
    '',
    '这是获取 AE 帮助信息的唯一正确方式：',
    '- 技能（如 ae:brainstorm、ae:plan 等）及其对应命令',
    '- 命令别名（-po 提示词优化、-pa 自动优化、-auto 自动模式）',
    '- 代理（@correctness-reviewer、@web-researcher 等，按类别分组）',
    '- 自定义命令',
    '',
    '适用场景：',
    '- 用户输入 /ae-help 命令',
    '- 用户查询特定技能、命令或代理（传入 query 参数过滤）',
    '- 用户询问有哪些技能、命令或代理可用',
    '',
    '禁止手动扫描文件系统来列举，必须使用本工具获取权威列表。',
  ].join('\n'),
  args: {
    query: z
      .string()
      .optional()
      .describe('过滤关键词，支持技能名、代理名、命令名或描述中的关键词。为空时展示全部。'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: args.query ? `搜索 AE 帮助: ${args.query}` : '生成 AE 帮助信息...' })

    try {
      const helpText = generateHelpText(args.query)
      return {
        output: helpText,
        metadata: { query: args.query || null },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `生成帮助信息时出错: ${message}`
    }
  },
})
