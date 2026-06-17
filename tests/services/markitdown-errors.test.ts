import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { formatMarkitdownError, MarkitdownError } from '../../src/services/markitdown-errors.js'

describe('markitdown-errors', () => {
  it('应该格式化 MarkitdownError', () => {
    const error = new MarkitdownError('file_empty', '文件为空')
    expect(formatMarkitdownError(error)).toBe('文件为空')
  })

  it('应该格式化 SyntaxError', () => {
    const error = new SyntaxError('Unexpected token')
    const message = formatMarkitdownError(error)
    expect(message).toContain('文件解析失败')
    expect(message).toContain('Unexpected token')
  })

  it('应该格式化通用错误', () => {
    const error = new Error('boom')
    const message = formatMarkitdownError(error)
    expect(message).toContain('文件转换失败')
    expect(message).toContain('boom')
  })

  it('应该格式化非 Error 值', () => {
    const message = formatMarkitdownError('string error')
    expect(message).toContain('文件转换失败')
    expect(message).toContain('string error')
  })
})
