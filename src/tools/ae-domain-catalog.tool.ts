import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { getDomainCatalog } from '../services/domain-catalog-service.js'

export const aeDomainCatalogTool = tool({
  description: [
    '查询开发专精代理目录，获取专精代理的描述与能力信息。',
    '',
    '功能说明：',
    '- 按 domain 参数精确匹配域名，返回该域的专精代理信息',
    '- 不传 domain 时返回所有域的目录信息',
    '- 返回专精代理的能力摘要',
    '',
    '适用场景：',
    '- 编排技能需要选择合适的专精代理执行任务',
    '- 了解某个域包含哪些专精代理及其选择条件',
    '',
    '不适用场景：',
    '- 不执行代理调度，只提供目录查询',
  ].join('\n'),
  args: {
    query: z
      .string()
      .optional()
      .describe('任务描述或意图，供 LLM 理解查询目的'),
    domain: z
      .string()
      .optional()
      .describe('域名过滤，精确匹配域名标识（如 development）'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: args.domain ? `查询开发专精代理: ${args.domain}` : '查询所有开发专精代理...' })

    try {
      const catalogs = getDomainCatalog(args.domain)

      const lines: string[] = []

      for (const catalog of catalogs) {
        lines.push(`## ${catalog.domain} 域`)
        lines.push('')
        lines.push('### 专精代理')
        lines.push('')

        for (const specialist of catalog.specialists) {
          lines.push(`- **${specialist.name}**: ${specialist.selectionCriteria}`)
          lines.push(`  能力: ${specialist.capabilities.join(', ')}`)
        }

        lines.push('')
      }

      return {
        output: lines.join('\n'),
        metadata: {
          domainCount: catalogs.length,
          domain: args.domain || null,
          query: args.query || null,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `查询域代理目录时出错: ${message}`
    }
  },
})
