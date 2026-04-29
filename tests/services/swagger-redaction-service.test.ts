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

  it('应该脱敏 URL 查询中的敏感值并保留非敏感标题', () => {
    const output = redactSwaggerOutput([
      '## Cookie 参数',
      "curl 'https://api.example.com/pets?api_key=real-secret&status=open'",
    ].join('\n'))

    expect(output).toContain('## Cookie 参数')
    expect(output).toContain('api_key=[已脱敏]')
    expect(output).not.toContain('real-secret')
  })

  it('应该脱敏 URL userinfo 凭证', () => {
    const output = redactSwaggerOutput("Base URL：https://user:real-password@example.com/v1")

    expect(output).toContain('https://[已脱敏]@example.com/v1')
    expect(output).not.toContain('real-password')
  })
})
