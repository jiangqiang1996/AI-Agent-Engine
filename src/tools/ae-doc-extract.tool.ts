import { isAbsolute, resolve } from 'node:path'

import { tool, type ToolDefinition } from '@opencode-ai/plugin'
import { Effect } from 'effect'

import { extractDoc } from '../services/doc-extract-service.js'

export const aeDocExtractTool: ToolDefinition = tool({
  description: [
    '提取 AE 人读分片文档结构。',
    '',
    '功能说明：',
    '- 读取当前工作区内的需求、设计主文件或分片子文件',
    '- 支持 sharded 主文件按 shards 索引读取子文件',
    '- 支持按稳定 ID 或模块筛选，并返回 diagnostics',
    '',
    '适用场景：',
    '- ae:design、ae:review 或 ae:work 需要从长文档中提取局部上下文',
    '- 校验分片路径、parent 指向和索引筛选是否可恢复',
    '',
    '不适用场景：',
    '- 不替代人工语义审查',
    '- 不生成、转换或迁移文档',
  ].join('\n'),
  args: {
    path: tool.schema.string().describe('文档路径，必须位于当前工作区内'),
    ids: tool.schema.array(tool.schema.string()).optional().describe('稳定 ID 列表，支持 R*、U*、G* 等'),
    modules: tool.schema.array(tool.schema.string()).optional().describe('模块名列表'),
    includeGlobalContext: tool.schema.boolean().optional().describe('是否包含主文件全局上下文，默认 true'),
  },
  async execute(args, ctx) {
    ctx.metadata({ title: '提取文档结构...', metadata: { path: args.path } })
    return Effect.runPromise(
      Effect.try({
        try: () => {
          const worktree = resolve(ctx.worktree)
          const baseDirectory = resolve(ctx.directory ?? ctx.worktree)
          return JSON.stringify(extractDoc({
            path: isAbsolute(args.path) ? args.path : resolve(baseDirectory, args.path),
            ids: args.ids,
            modules: args.modules,
            includeGlobalContext: args.includeGlobalContext,
            repoRoot: worktree,
          }), null, 2)
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catch((error) => Effect.succeed(`文档提取失败：${error.message}`)),
      ),
    )
  },
})
