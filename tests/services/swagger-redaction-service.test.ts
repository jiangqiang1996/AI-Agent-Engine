import { describe, expect, it } from 'vitest'

import { redactSwaggerOutput } from '../../src/services/swagger-redaction-service.js'

describe('swagger-redaction-service', () => {
  it('应该脱敏中文冒号后的敏感内容', () => {
    const output = redactSwaggerOutput('认证：Bearer secret-token')

    expect(output).toBe('认证：[已脱敏]')
    expect(output).not.toContain('secret-token')
  })

  it('应该脱敏不含冒号的敏感整行', () => {
    const output = redactSwaggerOutput('Bearer secret-token')

    expect(output).toBe('[已脱敏]')
  })
})
