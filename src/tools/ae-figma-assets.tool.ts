import { tool } from '@opencode-ai/plugin/tool'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { FigmaAssetToolArgsSchema } from '../schemas/figma-asset-schema.js'
import { formatFigmaAssetError, runFigmaAssetTool } from '../services/figma-asset-service.js'
import { showToast } from '../services/toast-holder.js'

export const aeFigmaAssetsTool = tool({
  description: [
    '从已授权的 Figma 文件或用户手动导出目录收集素材。',
    '',
    '功能说明：',
    '- api 模式使用用户提供的 Figma token 调用官方 images API 下载指定节点素材',
    '- collect 模式收集工作区内用户手动导出的图片文件',
    '- validate 模式校验 .figma/manifest.json 中的文件大小和 SHA-256',
    '- 所有产物写入工作区内 .figma 目录，并生成 manifest',
    '',
    '适用场景：',
    '- 用户需要把 Figma 节点图片素材落盘到当前项目',
    '- 用户已经通过配置、环境变量或手动导出提供授权素材来源',
    '',
    '不适用场景：',
    '- 不读取浏览器 token、cookie、localStorage 或 Trae 私有数据',
    '- 不自动遍历整个 Figma 文件。',
  ].join('\n'),
  args: FigmaAssetToolArgsSchema.shape,
  execute: async (args, ctx) => {
    ctx.metadata({ title: `处理 Figma 素材: ${args.mode ?? 'api'}` })

    try {
      const result = await runFigmaAssetTool(FigmaAssetToolArgsSchema.parse(args), ctx.worktree)
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
