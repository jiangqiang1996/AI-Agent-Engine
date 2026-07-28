import { z } from 'zod'

export const TestFailureBundleSchema = z.object({
  testLayer: z.enum(['unit', 'api', 'e2e']).describe('测试层'),
  failureType: z
    .enum(['assertion', 'timeout', 'selector', 'http', 'env', 'runtime'])
    .describe('失败类型'),
  testName: z.string().describe('失败测试名称'),
  stackTrace: z.string().describe('调用栈'),
  expected: z.string().describe('期望值'),
  actual: z.string().describe('实际值'),

  domSnapshot: z.string().optional().describe('DOM 快照（e2e）'),
  screenshot: z.string().optional().describe('截图路径（e2e）'),
  networkLog: z
    .array(
      z.object({
        method: z.string(),
        url: z.string(),
        status: z.number(),
        responseBody: z.string().optional(),
      }),
    )
    .optional()
    .describe('网络日志（api/e2e）'),
  httpResponse: z
    .object({
      status: z.number(),
      body: z.string(),
    })
    .optional()
    .describe('HTTP 响应（api）'),
  relatedDesignCase: z.string().optional().describe('关联设计用例 ID'),
  codeDiff: z.string().optional().describe('最近变更 diff'),
})

export type TestFailureBundle = z.infer<typeof TestFailureBundleSchema>

export const TestTriageResultSchema = z.object({
  rootCause: z.enum(['production', 'test', 'env', 'design-drift']).describe('根因分类'),
  domain: z.enum(['frontend', 'backend']).nullable().describe('域分类，rootCause 非 production 时为 null'),
  dispatchTarget: z
    .enum(['ae:frontend-fix', 'ae:backend-fix', 'ae:design', 'self-fix', 'manual'])
    .describe('分派目标'),
  summary: z.string().describe('一句话诊断结论，必须展示给用户'),
  evidence: z.string().describe('诊断依据'),
})

export type TestTriageResult = z.infer<typeof TestTriageResultSchema>
