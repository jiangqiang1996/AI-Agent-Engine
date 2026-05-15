import { tool } from '@opencode-ai/plugin/tool'
import { Effect } from 'effect'
import { resolve } from 'node:path'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { bundleHtml, formatHtmlBundleError } from '../services/html-bundle-service.js'

function formatResult(result: ReturnType<typeof bundleHtml>): string {
  return [
    `# HTML Bundle 结果：${result.status}`,
    '',
    `- 入口：${result.entry}`,
    `- 输出：${result.output}`,
    `- 已内联资源：${result.inlinedResources}`,
    `- 保留资源：${result.retainedResources}`,
    `- 输出大小：${result.outputBytes} 字节`,
    result.warnings.length > 0 ? `- 警告：${result.warnings.join('；')}` : '- 警告：无',
  ].join('\n')
}

function formatFailedResult(message: string): string {
  return [
    '# HTML Bundle 结果：failed',
    '',
    `- 错误：${message}`,
  ].join('\n')
}

export const aeHtmlBundleTool = tool({
  description: [
    '将显式入口 HTML 打包为自包含 bundle.html。',
    '',
    '功能说明：',
    '- 读取当前工作区内的单个 HTML 文件和本地相对静态资源',
    '- 内联脚本、样式、图片、字体、srcset、CSS url(...) 与本地 @import',
    '- 删除 source map 引用并返回 warning',
    '- 外部 URL 默认保留，不联网抓取',
    '- 输出 complete、partial 或 failed 状态和资源统计',
    '',
    '适用场景：',
    '- 已有 HTML 产物需要收敛为单文件 bundle.html',
    '- 技术栈未知或不应执行项目专属构建命令时',
    '',
    '不适用场景：',
    '- 不执行 Vite、Webpack、Parcel 等项目构建',
    '- 不保证改写运行时 fetch、动态 import、WASM 或远程 CDN 资源。',
  ].join('\n'),
  args: {
    entry: z.string().min(1).describe('入口 HTML 文件路径，必须位于当前工作区内。'),
    output: z.string().min(1).describe('输出 HTML 文件路径，必须位于当前工作区内。'),
    external: z.enum(['keep', 'fail']).optional().describe('外部 URL 处理策略：keep 保留并 warning，fail 遇到即失败。默认 keep。'),
    max_resource_bytes: z.number().int().positive().optional().describe('单个资源内联大小上限，默认 10 MiB。'),
    max_total_resource_bytes: z.number().int().positive().optional().describe('总内联资源大小上限，默认 50 MiB。'),
    max_output_bytes: z.number().int().positive().optional().describe('最终 HTML 大小上限，默认 100 MiB。'),
  },
  execute: async (args, ctx) => {
    const worktree = resolve(ctx.worktree)
    const baseDirectory = resolve(ctx.directory ?? ctx.worktree)
    ctx.metadata({ title: `生成 HTML bundle: ${args.entry}` })

    try {
      if (typeof ctx.ask !== 'function') {
        const message = '当前运行环境无法请求文件写入授权，已停止写入。'
        return {
          output: formatFailedResult(message),
          metadata: { tool: TOOL.AE_HTML_BUNDLE, status: 'failed' },
        }
      }
      await Effect.runPromise(ctx.ask({
        permission: 'file',
        patterns: [resolve(baseDirectory, args.output)],
        always: [],
        metadata: { action: '写入自包含 HTML bundle 输出文件', output: args.output },
      }))

      const result = bundleHtml({
        entry: args.entry,
        output: args.output,
        worktree,
        baseDirectory,
        externalPolicy: args.external,
        maxResourceBytes: args.max_resource_bytes,
        maxTotalResourceBytes: args.max_total_resource_bytes,
        maxOutputBytes: args.max_output_bytes,
      })
      return {
        output: formatResult(result),
        metadata: { tool: TOOL.AE_HTML_BUNDLE, status: result.status, output: result.output },
      }
    } catch (error) {
      return {
        output: formatFailedResult(formatHtmlBundleError(error)),
        metadata: { tool: TOOL.AE_HTML_BUNDLE, status: 'failed' },
      }
    }
  },
})
