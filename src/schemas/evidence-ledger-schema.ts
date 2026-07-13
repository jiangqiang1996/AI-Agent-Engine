import { z } from 'zod'

export const EVIDENCE_LEDGER_SCHEMA_VERSION = 1

export const EvidenceIdSchema = z.string()
  .min(1)
  .regex(/^[A-Za-z0-9._-]+$/)
  .refine((id) => id !== '.' && id !== '..')
  .describe('证据 ID，必须是单个安全文件名片段')

export const EvidenceKindSchema = z.enum([
  'validation',
  'review',
  'git-authorization',
  'git-operation',
  'worktree-decision',
  'baseline',
  'browser-acceptance',
]).describe('证据域类型')

export const EvidenceStateSchema = z.enum(['missing', 'unverifiable', 'failed', 'passed']).describe('证据四态评估结果')

export const EvidenceTrustSchema = z.enum([
  'machine-verifiable',
  'trusted-tool-output',
  'user-confirmed',
  'agent-declared',
  'unverifiable',
]).describe('证据可信度等级')

export const EvidenceProducerSchema = z.object({
  tool: z.string().min(1).describe('写入证据的工具或能力名称'),
  proofKind: z.string().min(1).describe('机器可识别的 proof 类型'),
  version: z.string().min(1).optional().describe('生产者版本或 schema 版本'),
}).describe('证据生产者信息')

export const EvidenceTrustBundleSchema = z.object({
  sourceTrust: EvidenceTrustSchema.describe('事实来源可信度'),
  captureTrust: EvidenceTrustSchema.describe('捕获过程可信度'),
  writerTrust: EvidenceTrustSchema.describe('写入者可信度'),
}).describe('证据信任分层')

export const EvidenceScopeSchema = z.object({
  workflow: z.string().min(1).optional().describe('工作流名称'),
  checkpoint: z.string().min(1).optional().describe('门禁检查点'),
  requirementsPath: z.string().min(1).optional().describe('需求文档仓库相对路径'),
  designPath: z.string().min(1).optional().describe('设计文档仓库相对路径'),
  handoffPath: z.string().min(1).optional().describe('交接文件仓库相对路径'),
  baselineHash: z.string().min(1).optional().describe('执行基线哈希'),
  files: z.array(z.string().min(1)).default([]).describe('证据覆盖的文件范围'),
  command: z.array(z.string().min(1)).optional().describe('证据覆盖的命令 argv'),
  intent: z.string().min(1).optional().describe('证据意图或验证目标'),
}).describe('证据适用范围')

export const EvidenceWorktreeFingerprintSchema = z.object({
  worktree: z.string().min(1).describe('工作区路径'),
  branch: z.string().min(1).optional().describe('Git 分支'),
  head: z.string().min(1).optional().describe('Git HEAD'),
  statusSummary: z.string().default('').describe('归一化工作区状态摘要'),
  statusSummaryHash: z.string().min(1).optional().describe('状态摘要哈希'),
  degraded: z.boolean().default(false).describe('指纹是否降级采集'),
}).describe('工作区指纹')

export const EvidenceResultSchema = z.object({
  status: EvidenceStateSchema.describe('证据结果状态'),
  summary: z.string().default('').describe('证据结果摘要'),
  exitCode: z.number().int().optional().describe('命令退出码'),
  blockingFindings: z.array(z.string().min(1)).default([]).describe('阻断发现摘要'),
}).describe('证据结果')

export const EvidenceHashesSchema = z.object({
  rawInputHash: z.string().min(1).optional().describe('原始输入哈希'),
  outputHash: z.string().min(1).optional().describe('输出哈希'),
  artifactHash: z.string().min(1).optional().describe('artifact 内容哈希'),
  recordHash: z.string().min(1).describe('记录哈希，计算时排除自身字段'),
  previousRecordHash: z.string().min(1).optional().describe('上一条 ledger 记录哈希'),
}).describe('证据哈希集合')

export const EvidenceTimestampsSchema = z.object({
  capturedAt: z.string().min(1).describe('证据捕获时间'),
  writtenAt: z.string().min(1).describe('证据写入时间'),
}).describe('证据时间戳')

export const EvidenceRecordSchema = z.object({
  id: EvidenceIdSchema,
  schemaVersion: z.literal(EVIDENCE_LEDGER_SCHEMA_VERSION).describe('证据账本 schema 版本'),
  evidenceKind: EvidenceKindSchema,
  producer: EvidenceProducerSchema,
  trust: EvidenceTrustBundleSchema,
  scope: EvidenceScopeSchema,
  worktreeFingerprint: EvidenceWorktreeFingerprintSchema,
  result: EvidenceResultSchema,
  hashes: EvidenceHashesSchema,
  timestamps: EvidenceTimestampsSchema,
  payload: z.record(z.string(), z.unknown()).default({}).describe('分域证据 payload'),
  audit: z.object({
    sessionId: z.string().min(1).optional().describe('会话 ID，仅作审计，不参与通过判定'),
  }).default({}).describe('审计字段'),
})

export const EvidenceLedgerEventSchema = z.object({
  id: EvidenceIdSchema,
  evidenceKind: EvidenceKindSchema,
  artifactPath: z.string().min(1).describe('artifact 仓库相对路径'),
  artifactHash: z.string().min(1).describe('artifact 内容哈希'),
  recordHash: z.string().min(1).describe('记录哈希'),
  previousRecordHash: z.string().min(1).optional().describe('上一条 ledger 记录哈希'),
  writtenAt: z.string().min(1).describe('写入时间'),
})

export const EvidenceIndexSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_LEDGER_SCHEMA_VERSION).describe('证据索引 schema 版本'),
  rebuiltAt: z.string().min(1).describe('索引重建时间'),
  records: z.array(EvidenceLedgerEventSchema).describe('可重建的证据事件索引'),
})

export const EvidenceEvaluationSchema = z.object({
  id: z.string().min(1).optional().describe('证据 ID'),
  evidenceKind: EvidenceKindSchema.optional().describe('证据域类型'),
  state: EvidenceStateSchema.describe('证据评估状态'),
  diagnostics: z.array(z.string().min(1)).default([]).describe('诊断信息'),
  recoverBy: z.array(z.string().min(1)).default([]).describe('恢复建议'),
})

export type EvidenceKind = z.infer<typeof EvidenceKindSchema>
export type EvidenceState = z.infer<typeof EvidenceStateSchema>
export type EvidenceTrust = z.infer<typeof EvidenceTrustSchema>
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>
export type EvidenceLedgerEvent = z.infer<typeof EvidenceLedgerEventSchema>
export type EvidenceIndex = z.infer<typeof EvidenceIndexSchema>
export type EvidenceEvaluation = z.infer<typeof EvidenceEvaluationSchema>
