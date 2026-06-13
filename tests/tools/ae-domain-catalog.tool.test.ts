import { describe, expect, it } from 'vitest'

async function callTool(args: { domain?: string; query?: string }) {
  const { aeDomainCatalogTool } = await import('../../src/tools/ae-domain-catalog.tool.js')

  return aeDomainCatalogTool.execute(args, {
    metadata: () => undefined,
  } as unknown as Parameters<typeof aeDomainCatalogTool.execute>[1])
}

describe('ae-domain-catalog 工具', () => {
  it('应该在 domain 为空时返回全部域目录', async () => {
    const result = await callTool({ query: '查看可用域' })

    expect(result).toMatchObject({
      metadata: {
        domainCount: 2,
        domain: null,
        query: '查看可用域',
      },
    })
    expect((result as { output: string }).output).toContain('## review 域')
    expect((result as { output: string }).output).toContain('## development 域')
  })

  it('应该按 domain 精确返回单个域目录', async () => {
    const result = await callTool({ domain: 'review' })

    expect(result).toMatchObject({
      metadata: {
        domainCount: 1,
        domain: 'review',
      },
    })
    expect((result as { output: string }).output).toContain('**域代理**: review-domain')
    expect((result as { output: string }).output).not.toContain('pattern-recognition-specialist')
  })

  it('应该在未知 domain 时返回空列表而非错误', async () => {
    const result = await callTool({ domain: 'unknown' })

    expect(result).toEqual({
      output: '',
      metadata: {
        domainCount: 0,
        domain: 'unknown',
        query: null,
      },
    })
  })
})
