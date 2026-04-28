import { describe, expect, it, vi } from 'vitest'
import { Effect } from 'effect'

vi.mock('../../src/services/toast-holder.js', () => ({
  showToast: vi.fn(),
}))

async function callTool(args: Record<string, unknown>) {
  const { aeSwaggerParserTool: tool } = await import('../../src/tools/ae-swagger-parser.tool.js')
  const definition = tool as unknown as {
    execute: (args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<string | { output: string }>
  }
  const result = await definition.execute(args, {
    metadata: vi.fn(),
    ask: () => Effect.void,
    worktree: process.cwd(),
    directory: process.cwd(),
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
  return typeof result === 'string' ? result : result.output
}

describe('ae-swagger-parser 工具', () => {
  it('应该解析本地 OpenAPI 3 概览', async () => {
    const output = await callTool({ source: 'tests/fixtures/swagger/openapi-3-basic.json' })

    expect(output).toContain('# Swagger 概览')
    expect(output).toContain('GET /pets')
  })

  it('应该解析本地 Swagger 2 单接口详情', async () => {
    const output = await callTool({
      source: 'tests/fixtures/swagger/swagger-2-basic.json',
      method: 'GET',
      path: '/orders/{id}',
    })

    expect(output).toContain('# 接口详情：GET /orders/{id}')
    expect(output).toContain('认证：BearerAuth')
  })

  it('应该返回 YAML 不支持提示', async () => {
    const output = await callTool({ source: 'api.yaml' })

    expect(output).toContain('首版不支持 YAML')
  })
})
