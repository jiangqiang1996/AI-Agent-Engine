import { tool } from '@opencode-ai/plugin/tool'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { FigmaAssetToolArgsSchema } from '../schemas/figma-asset-schema.js'
import { FigmaAssetError, formatFigmaAssetError } from '../services/figma-result-formatter.js'
import { runFigmaAssetTool } from '../services/figma-asset-service.js'
import { readSetupProof } from '../services/setup-proof-service.js'
import { showToast } from '../services/toast-holder.js'

export const aeFigmaAssetsTool = tool({
  description: [
    '从已授权的 Figma 页面或用户手动导出目录收集素材。',
    '',
    '功能说明：',
    '- browser 模式为默认推荐路径：先完成 ae:setup，再由工具内部 runner 打开 Figma 页面并受控下载素材',
    '- api 模式是需要 Figma token 的显式凭证兼容路径',
    '- collect 模式收集工作区内用户手动导出的图片文件',
    '- validate 模式校验 .figma/manifest.json 中的文件大小和 SHA-256',
    '- 所有产物写入工作区内 .figma 目录，并生成 manifest',
    '',
    '适用场景：',
    '- 用户需要把 Figma 节点图片素材落盘到当前项目',
    '- 用户提供可访问的 Figma 页面或节点 URL，并愿意在隔离浏览器中完成登录授权',
    '- 用户已经通过配置、环境变量或手动导出提供兼容素材来源',
    '',
    '不适用场景：',
    '- 不读取浏览器 token、cookie、localStorage、sessionStorage 或 Trae 私有数据',
    '- 不自动遍历整个 Figma 文件。',
  ].join('\n'),
  args: FigmaAssetToolArgsSchema.shape,
  execute: async (args, ctx) => {
    ctx.metadata({ title: `处理 Figma 素材: ${args.mode ?? 'browser'}` })

    try {
      const parsedArgs = FigmaAssetToolArgsSchema.parse(args)
      if (parsedArgs.mode === 'browser') {
        assertBrowserSetupCompleted(ctx)
      }
      const result = await runFigmaAssetTool(parsedArgs, ctx.worktree, {
        browser: parsedArgs.mode === 'browser' ? { sessionId: (ctx as { sessionID?: string }).sessionID } : undefined,
      })
      return {
        output: result,
        metadata: { tool: TOOL.AE_FIGMA_ASSETS },
      }
    } catch (error) {
      const message = formatFigmaAssetError(error)
      showToast(message)
      return message
    }
  },
})

function assertBrowserSetupCompleted(ctx: { worktree: string } & Record<string, unknown>): void {
  const sessionID = (ctx as { sessionID?: string }).sessionID
  if (!sessionID) {
    throw new FigmaAssetError('无法确认当前会话已完成 /ae-setup，请重新执行 /ae-setup。', 'setup_context_unavailable')
  }
  const proof = readSetupProof(ctx.worktree)
  if (!proof || !proof.completedAt || proof.sessionId !== sessionID) {
    throw new FigmaAssetError('请先执行 /ae-setup，完成当前会话的浏览器能力环境检查。', 'setup_not_completed')
  }
}
