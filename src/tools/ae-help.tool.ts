import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { generateHelpText } from '../services/help-catalog-service.js'

export const aeHelpTool = tool({
  description: [
    '获取 AE 插件中所有可调用的技能、命令和代理的完整列表。',
    '',
    '这是获取 AE 帮助信息的唯一正确方式：',
    '- 技能（如 ae:brainstorm、ae:design 等）及其对应命令',
    '- 代理（@correctness-reviewer、@web-researcher 等，按类别分组）',
    '- 域代理（@review-domain、@development-domain 等，由编排技能通过 Task 调度）',
    '- 自定义命令',
    '',
    '适用场景：',
    '- 用户输入 /ae-help 命令',
    '- 用户查询特定技能、命令或代理（传入 query 参数过滤）',
    '- 用户询问有哪些技能、命令或代理可用',
    '',
    '详情查询：',
    '- 传入完整元素名（如 ae:design、/ae-design、@correctness-reviewer）可查看该元素的详细说明和关联信息',
    '- 元素名精确匹配时返回详情视图，否则返回子串匹配的列表视图',
    '',
    '禁止手动扫描文件系统来列举，必须使用本工具获取权威列表。',
  ].join('\n'),
  args: {
    query: z
      .string()
      .optional()
      .describe('过滤关键词或精确元素名。传入完整元素名（如 ae:design、/ae-design、@correctness-reviewer）返回详情视图；传入关键词返回子串匹配的列表。为空时展示全部。'),
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
