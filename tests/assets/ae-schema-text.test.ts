import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MODEL_SCENARIO } from '../../src/schemas/model-scenario-schema.js'

interface JsonSchemaStringNode {
  type?: string
  minLength?: number
  description?: string
}

interface AeConfigSchema {
  properties?: {
    modelScenarios?: {
      type?: string
      description?: string
      properties?: Record<string, JsonSchemaStringNode>
      additionalProperties?: JsonSchemaStringNode
      examples?: Array<Record<string, string>>
    }
  }
  definitions?: {
    localMcp?: { required?: string[] }
    remoteMcp?: { required?: string[] }
    mcpOverlay?: { properties?: Record<string, unknown>; required?: string[] }
  }
}

const schema = JSON.parse(readFileSync('src/assets/config/ae.schema.json', 'utf8')) as AeConfigSchema
const config = JSON.parse(readFileSync('src/assets/config/ae.jsonc', 'utf8')) as { $schema?: string }

describe('ae.schema.json 模型场景契约', () => {
  it('默认配置应该引用同目录本地 schema', () => {
    expect(config.$schema).toBe('./ae.schema.json')
    expect(existsSync('src/assets/config/ae.schema.json')).toBe(true)
  })

  it('应该与稳定模型场景常量保持一致', () => {
    const modelScenarios = schema.properties?.modelScenarios
    const stableScenarios = Object.values(MODEL_SCENARIO)

    expect(modelScenarios?.type).toBe('object')
    expect(Object.keys(modelScenarios?.properties ?? {}).sort()).toEqual([...stableScenarios].sort())

    for (const scenario of stableScenarios) {
      expect(modelScenarios?.properties?.[scenario]).toMatchObject({ type: 'string', minLength: 1 })
    }
  })

  it('应该允许自定义场景映射到非空字符串', () => {
    expect(schema.properties?.modelScenarios?.additionalProperties).toMatchObject({ type: 'string', minLength: 1 })
  })

  it('应该提供覆盖所有稳定场景的示例', () => {
    const example = schema.properties?.modelScenarios?.examples?.[0]

    expect(example).toBeDefined()
    for (const scenario of Object.values(MODEL_SCENARIO)) {
      expect(example?.[scenario]).toMatch(/^provider\/.+/)
    }
  })

  it('MCP schema 必须要求运行时必要字段', () => {
    expect(schema.definitions?.localMcp?.required).toEqual(['command'])
    expect(schema.definitions?.remoteMcp?.required).toEqual(['url'])
    expect(schema.definitions?.mcpOverlay?.required).toBeUndefined()
    expect(schema.definitions?.mcpOverlay?.properties).toHaveProperty('type')
    expect(schema.definitions?.mcpOverlay?.properties).toHaveProperty('url')
    expect(schema.definitions?.mcpOverlay?.properties).toHaveProperty('command')
  })
})
