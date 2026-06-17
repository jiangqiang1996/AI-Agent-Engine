import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { formatSwaggerError } from '../services/swagger-errors.js'
import { parseSwaggerSource } from '../services/swagger-service.js'

function redactSourceForDisplay(source: string): string {
  try {
    const url = new URL(source)
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return source
  }
}

export const aeSwaggerParserTool = tool({
  description: [
    '解析 Swagger/OpenAPI JSON/YAML 并生成接口联调摘要。',
    '',
    '功能说明：',
    '- 支持工作区内 JSON/YAML 文件和远程 HTTP(S) URL',
    '- 支持 Swagger 2.0 和 OpenAPI 3.0/3.1 常见结构',
    '- 识别 Swagger UI HTML 误传并提示提供真实规格地址',
    '- 可按 method、path、tag、keyword 筛选接口',
    '- 输出接口概览、单接口详情或有限多接口请求摘要',
    '',
    '适用场景：',
    '- 用户需要快速理解 Swagger/OpenAPI 文档中的接口调用方式',
    '- 联调前需要查看路径、参数、认证和响应字段',
    '',
    '不适用场景：',
    '- 不生成 SDK、类型定义或测试脚手架',
    '- 不自动请求业务接口',
    '- 不自动爬取 Swagger UI 页面中的规格地址。',
  ].join('\n'),
  args: {
    source: z.string().min(1).describe('Swagger/OpenAPI JSON/YAML 来源，可以是工作区内本地路径或 HTTP(S) URL。'),
    method: z.string().optional().describe('HTTP 方法，大小写不敏感，例如 GET、POST。'),
    path: z.string().optional().describe('OpenAPI path 模板，优先精确匹配，例如 /pets/{id}。'),
    tag: z.string().optional().describe('接口标签名，大小写不敏感匹配。'),
    keyword: z.string().optional().describe('关键词，搜索 path、summary、description、operationId。'),
    mode: z.enum(['overview', 'detail']).optional().describe('输出模式：overview 或 detail。省略时根据命中数量决定。'),
  },
  execute: async (args, ctx) => {
    const displaySource = redactSourceForDisplay(args.source)
    ctx.metadata({ title: `解析 Swagger: ${displaySource}` })

    try {
      if (/^https?:\/\//i.test(args.source)) {
        await ctx.ask({
          permission: 'network',
          patterns: [displaySource],
          always: [],
          metadata: {
            action: '读取远程 Swagger/OpenAPI JSON/YAML',
            source: displaySource,
          },
        })
      }

      const output = await parseSwaggerSource(args.source, ctx.worktree, {
        method: args.method,
        path: args.path,
        tag: args.tag,
        keyword: args.keyword,
        mode: args.mode,
      })
      return {
        output,
        metadata: { tool: TOOL.AE_SWAGGER_PARSER },
      }
    } catch (error) {
      const message = formatSwaggerError(error)
      return message
    }
  },
})
