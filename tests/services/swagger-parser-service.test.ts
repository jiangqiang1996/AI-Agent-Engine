import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseSwaggerDocument } from '../../src/services/swagger-parser-service.js'

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(path), 'utf8')) as unknown
}

describe('swagger-parser-service', () => {
  it('应该解析 OpenAPI 3 基础接口', () => {
    const result = parseSwaggerDocument(readJson('tests/fixtures/swagger/openapi-3-basic.json'))

    expect(result.specification).toBe('openapi3')
    expect(result.openapiVersion).toBe('3.0')
    expect(result.operations).toHaveLength(3)
    expect(result.operations[1].requestBody?.fields).toContainEqual({
      name: 'name',
      type: 'string',
      required: true,
      description: '宠物名称',
    })
  })

  it('应该解析 Swagger 2 基础接口', () => {
    const result = parseSwaggerDocument(readJson('tests/fixtures/swagger/swagger-2-basic.json'))

    expect(result.specification).toBe('swagger2')
    expect(result.operations[0].servers).toEqual(['https://api.example.com/v1'])
    expect(result.operations[0].parameters[0]).toMatchObject({ name: 'id', in: 'path', required: true })
  })

  it('应该区分 OpenAPI 3.1 并展示常见 JSON Schema 字段', () => {
    const result = parseSwaggerDocument(readJson('tests/fixtures/swagger/openapi-3-1-basic.json'))

    expect(result.specification).toBe('openapi3')
    expect(result.openapiVersion).toBe('3.1')
    expect(result.operations[0].parameters[0].type).toBe('string | null')
    expect(result.operations[0].responses[0].fields).toContainEqual(expect.objectContaining({
      name: 'kind',
      type: 'const:pet',
    }))
  })

  it('应该展开内部 schema 引用', () => {
    const result = parseSwaggerDocument({
      openapi: '3.0.0',
      info: { title: 'Ref API' },
      paths: {
        '/users': {
          get: {
            responses: {
              200: {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          User: {
            type: 'object',
            required: ['id'],
            properties: {
              id: { type: 'string', description: '用户 ID' },
            },
          },
        },
      },
    })

    expect(result.operations[0].responses[0].fields).toContainEqual({
      name: 'id',
      type: 'string',
      required: true,
      description: '用户 ID',
      enumValues: undefined,
      defaultValue: undefined,
      example: undefined,
    })
  })

  it('应该拒绝不支持的规格版本', () => {
    expect(() => parseSwaggerDocument({ paths: {} })).toThrow('不支持的规格版本')
    expect(() => parseSwaggerDocument({ openapi: '4.0.0', paths: {} })).toThrow('不支持的规格版本')
    expect(() => parseSwaggerDocument({ openapi: '3.10.0', paths: {} })).toThrow('不支持的规格版本')
    expect(() => parseSwaggerDocument({ openapi: '3.1-preview', paths: {} })).toThrow('不支持的规格版本')
  })

  it('应该允许 operation.security 空数组覆盖全局认证', () => {
    const result = parseSwaggerDocument({
      openapi: '3.0.0',
      info: { title: 'Auth API' },
      security: [{ BearerAuth: [] }],
      paths: {
        '/public': {
          get: {
            security: [],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    })

    expect(result.operations[0].security).toEqual([])
  })

  it('应该优先使用 operation 和 path 级 servers', () => {
    const result = parseSwaggerDocument({
      openapi: '3.0.0',
      info: { title: 'Server API' },
      servers: [{ url: 'https://root.example.com' }],
      paths: {
        '/path-server': {
          servers: [{ url: 'https://path.example.com' }],
          get: { responses: { 200: { description: 'ok' } } },
        },
        '/operation-server': {
          servers: [{ url: 'https://path.example.com' }],
          get: {
            servers: [{ url: 'https://operation.example.com' }],
            responses: { 200: { description: 'ok' } },
          },
        },
      },
    })

    expect(result.operations[0].servers).toEqual(['https://path.example.com'])
    expect(result.operations[1].servers).toEqual(['https://operation.example.com'])
  })
})
