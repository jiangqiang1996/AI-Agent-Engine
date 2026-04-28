import { z } from 'zod'

export const FigmaAssetModeSchema = z
  .enum(['api', 'collect', 'validate'])
  .describe('Figma 素材处理模式：api 下载、collect 收集本地导出、validate 校验清单')

export const FigmaExportFormatSchema = z
  .enum(['png', 'jpg', 'svg', 'pdf'])
  .default('png')
  .describe('Figma 导出格式')

export const FigmaAssetToolArgsSchema = z.object({
  mode: FigmaAssetModeSchema.default('api').describe('执行模式，默认 api'),
  source: z.string().optional().describe('Figma 文件或节点 URL，可从 URL 中解析 fileKey 与 nodeId'),
  fileKey: z.string().optional().describe('Figma 文件 Key，API 模式可由 source 解析'),
  nodeId: z.string().optional().describe('Figma 节点 ID，API 模式必填或可由 source 解析'),
  token: z.string().optional().describe('Figma 访问令牌。仅用于本次调用，工具不会写入日志、manifest 或输出'),
  tokenEnv: z.string().optional().describe('读取 Figma 访问令牌的环境变量名，默认 FIGMA_TOKEN'),
  envFile: z.string().optional().describe('工作区内 dotenv 文件路径，用于读取 tokenEnv 指定的令牌'),
  outputDir: z.string().optional().describe('工作区内输出目录，默认 .figma'),
  format: FigmaExportFormatSchema.optional().describe('API 导出格式，默认 png'),
  scale: z.number().min(0.01).max(4).optional().describe('API 导出缩放，默认 1'),
  manualSourceDir: z.string().optional().describe('collect 模式下用户手动导出素材所在的工作区内目录'),
})

export const FigmaAssetManifestItemSchema = z.object({
  nodeId: z.string().describe('Figma 节点 ID 或本地素材标识'),
  fileName: z.string().describe('素材文件名'),
  relativePath: z.string().describe('相对工作区路径'),
  format: z.string().describe('素材格式'),
  bytes: z.number().int().nonnegative().describe('文件字节数'),
  sha256: z.string().length(64).describe('SHA-256 校验和'),
})

export const FigmaAssetManifestSchema = z.object({
  version: z.literal(1).describe('manifest 版本'),
  mode: FigmaAssetModeSchema.describe('生成该 manifest 的执行模式'),
  runId: z.string().describe('运行 ID'),
  createdAt: z.string().describe('ISO 格式创建时间'),
  source: z.string().optional().describe('脱敏后的 Figma 来源'),
  fileKey: z.string().optional().describe('Figma 文件 Key'),
  nodeIds: z.array(z.string()).describe('本次处理的节点 ID 列表'),
  assets: z.array(FigmaAssetManifestItemSchema).describe('素材条目'),
})

export type FigmaAssetToolArgs = z.infer<typeof FigmaAssetToolArgsSchema>
export type FigmaAssetMode = z.infer<typeof FigmaAssetModeSchema>
export type FigmaAssetManifest = z.infer<typeof FigmaAssetManifestSchema>
export type FigmaAssetManifestItem = z.infer<typeof FigmaAssetManifestItemSchema>
