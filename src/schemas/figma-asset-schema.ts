import { z } from 'zod'

export const FigmaAssetModeSchema = z
  .enum(['browser', 'api', 'collect', 'validate'])
  .describe('Figma 素材处理模式：browser 浏览器授权下载、api 凭证下载、collect 收集本地导出、validate 校验清单')

export const FIGMA_BROWSER_MODE_AVAILABLE = true
export const FIGMA_DEFAULT_MODE = 'browser' satisfies z.infer<typeof FigmaAssetModeSchema>

export const FigmaExportFormatSchema = z
  .enum(['png', 'jpg', 'svg', 'pdf'])
  .default('png')
  .describe('Figma 导出格式')

export const FigmaAssetToolArgsSchema = z.object({
  mode: FigmaAssetModeSchema.default(FIGMA_DEFAULT_MODE).describe('执行模式，默认 browser'),
  source: z.string().optional().describe('Figma 文件或节点 URL，可从 URL 中解析 fileKey 与 nodeId'),
  fileKey: z.string().optional().describe('Figma 文件 Key，api 模式可由 source 解析'),
  nodeId: z.string().optional().describe('Figma 节点 ID，browser/api 模式必填或可由 source 解析'),
  token: z.string().optional().describe('已弃用：直接传入 token 不再支持。请通过 tokenEnv 或 envFile 提供令牌'),
  tokenEnv: z.string().optional().describe('仅 api 模式需要：读取 Figma 访问令牌的环境变量名，仅允许 FIGMA_OAUTH_TOKEN、FIGMA_API_KEY、FIGMA_TOKEN'),
  envFile: z.string().optional().describe('仅 api 模式需要：工作区内 dotenv 文件路径，仅读取 FIGMA_OAUTH_TOKEN、FIGMA_API_KEY、FIGMA_TOKEN'),
  outputDir: z.string().optional().describe('工作区内输出目录，默认 .figma'),
  format: FigmaExportFormatSchema.optional().describe('API 导出格式，默认 png'),
  scale: z.number().min(0.01).max(4).optional().describe('API 导出缩放，默认 1'),
  manualSourceDir: z.string().optional().describe('collect 模式下用户手动导出素材所在的工作区内目录'),
})

export const FigmaAssetManifestItemSchema = z.object({
  sourceIdHash: z.string().min(8).describe('源标识的脱敏哈希前缀'),
  fileName: z.string().describe('素材文件名'),
  relativePath: z.string().describe('相对工作区路径'),
  format: z.string().describe('素材格式'),
  bytes: z.number().int().nonnegative().describe('文件字节数'),
  sha256: z.string().length(64).describe('SHA-256 校验和'),
})

export const FigmaAssetSourceSchema = z.object({
  type: z.enum(['browser_page', 'figma_url', 'manual', 'unknown']).describe('素材来源类型'),
  host: z.string().optional().describe('脱敏后的来源域名'),
  fileKeyHash: z.string().optional().describe('Figma 文件 Key 的脱敏哈希前缀'),
  nodeIdHashes: z.array(z.string()).default([]).describe('Figma 节点 ID 的脱敏哈希前缀'),
})

export const FigmaAssetEvidenceSchema = z.object({
  agentBrowserUsed: z.boolean().describe('本次是否使用 agent-browser 辅助'),
  saved: z.literal(false).describe('本轮不落盘保存浏览器 evidence'),
  types: z.array(z.string()).describe('已保存 evidence 类型，本轮固定为空'),
  paths: z.array(z.string()).describe('已保存 evidence 路径，本轮固定为空'),
  browserAuthStatus: z.enum(['login_required', 'login_in_progress', 'access_denied', 'file_not_found', 'page_load_failed', 'node_not_visible', 'node_exportable', 'download_not_automatable', 'page_state_unknown', 'page_loaded']).optional().describe('浏览器页面授权状态'),
  downloadSourceType: z.enum(['cdn_direct', 's3_presigned', 'unknown']).optional().describe('下载资源来源类型'),
  browserSessionIdHash: z.string().optional().describe('浏览器 session 标识的 SHA-256 哈希前缀'),
  pageUrlHash: z.string().optional().describe('Figma 页面 URL 的 SHA-256 哈希前缀'),
  failureCode: z.string().optional().describe('失败分类错误码'),
  discoveryScriptId: z.string().optional().describe('资源发现使用的预定义脚本 ID'),
  discoveryCapturedAt: z.string().optional().describe('资源发现时间戳'),
  discoveryEventType: z.enum(['page_eval', 'network_observed']).optional().describe('资源发现事件类型'),
  savedLocalEvidence: z.boolean().default(false).describe('是否保存了本地调试证据；默认 false'),
  evidenceTypes: z.array(z.enum(['screenshot', 'har', 'dom', 'network_response'])).default([]).describe('显式保存的证据类型；默认空数组'),
  experimental: z.boolean().default(false).describe('是否为实验性模式'),
})

export const FigmaAssetNoticeSchema = z.object({
  code: z.string().describe('结构化提示或失败代码'),
  message: z.string().describe('脱敏后的用户可读说明'),
})

export const FigmaAssetManifestSchema = z.object({
  schemaVersion: z.literal(2).describe('manifest 版本'),
  mode: FigmaAssetModeSchema.describe('生成该 manifest 的执行模式'),
  runId: z.string().describe('运行 ID'),
  startedAt: z.string().describe('ISO 格式开始时间'),
  completedAt: z.string().describe('ISO 格式完成时间'),
  status: z.enum(['success', 'failed']).describe('本次运行状态'),
  source: FigmaAssetSourceSchema.optional().describe('结构化脱敏来源'),
  evidence: FigmaAssetEvidenceSchema.describe('本次运行证据元数据'),
  warnings: z.array(FigmaAssetNoticeSchema).describe('脱敏后的警告列表'),
  failures: z.array(FigmaAssetNoticeSchema).describe('脱敏后的失败列表'),
  assets: z.array(FigmaAssetManifestItemSchema).describe('素材条目'),
})

export type FigmaAssetToolArgs = z.infer<typeof FigmaAssetToolArgsSchema>
export type FigmaAssetMode = z.infer<typeof FigmaAssetModeSchema>
export type FigmaAssetManifest = z.infer<typeof FigmaAssetManifestSchema>
export type FigmaAssetManifestItem = z.infer<typeof FigmaAssetManifestItemSchema>
export type FigmaAssetSource = z.infer<typeof FigmaAssetSourceSchema>

export type AuthMode = 'oauth' | 'api_key' | 'legacy'
