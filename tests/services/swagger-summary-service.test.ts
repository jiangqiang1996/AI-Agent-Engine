import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { filterSwaggerOperations } from '../../src/services/swagger-filter-service.js'
import { parseSwaggerDocument } from '../../src/services/swagger-parser-service.js'
import { formatSwaggerSummary } from '../../src/services/swagger-summary-service.js'

function readText(path: string): string {
  return readFileSync(resolve(path), 'utf8').trim()
}

function parseFixture(path: string) {
  return parseSwaggerDocument(JSON.parse(readText(path)) as unknown)
}

describe('swagger-summary-service', () => {
  it('应该生成 OpenAPI 3 概览 golden output', () => {
    const parsed = parseFixture('tests/fixtures/swagger/openapi-3-basic.json')
    const output = formatSwaggerSummary(filterSwaggerOperations(parsed, {}))

    expect(output).toBe(readText('tests/fixtures/swagger/golden/openapi-3-overview.md'))
  })

  it('应该生成 Swagger 2 单接口详情 golden output', () => {
    const parsed = parseFixture('tests/fixtures/swagger/swagger-2-basic.json')
    const output = formatSwaggerSummary(filterSwaggerOperations(parsed, { method: 'GET', path: '/orders/{id}' }))

    expect(output).toBe(readText('tests/fixtures/swagger/golden/swagger-2-detail.md'))
  })

  it('应该在显式 detail 多命中时输出有限多接口请求摘要', () => {
    const parsed = parseFixture('tests/fixtures/swagger/openapi-3-basic.json')
    const output = formatSwaggerSummary(filterSwaggerOperations(parsed, { tag: 'pets', mode: 'detail' }))

    expect(output).toContain('# 多接口请求摘要')
    expect(output).toContain('路径参数：')
    expect(output).toContain('请求体字段：')
  })
})
