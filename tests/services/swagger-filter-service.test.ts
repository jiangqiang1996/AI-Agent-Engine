import { describe, expect, it } from 'vitest'

import { filterSwaggerOperations } from '../../src/services/swagger-filter-service.js'
import type { SwaggerParseResult } from '../../src/services/swagger-parser-service.js'

const parseResult: SwaggerParseResult = {
  title: 'Test API',
  specification: 'openapi3',
  openapiVersion: '3.0',
  operations: [
    { method: 'GET', path: '/pets', tags: ['pets'], parameters: [], responses: [], security: [], servers: [], summary: 'list' },
    { method: 'POST', path: '/pets', tags: ['pets'], parameters: [], responses: [], security: [], servers: [], summary: 'create' },
  ],
}

describe('swagger-filter-service', () => {
  it('无筛选时应该输出概览模式', () => {
    expect(filterSwaggerOperations(parseResult, {}).kind).toBe('overview')
  })

  it('method 和 path 唯一命中时应该输出详情', () => {
    expect(filterSwaggerOperations(parseResult, { method: 'GET', path: '/pets' }).kind).toBe('detail')
  })

  it('非 method/path 唯一命中默认仍输出概览', () => {
    expect(filterSwaggerOperations(parseResult, { keyword: 'list' }).kind).toBe('overview')
  })

  it('显式 detail 多命中且不超过 5 个时应该输出多接口详情', () => {
    expect(filterSwaggerOperations(parseResult, { tag: 'pets', mode: 'detail' }).kind).toBe('multi-detail')
  })
})
