import { describe, expect, it } from 'vitest'

import { parseSwaggerSource } from '../../src/services/swagger-service.js'

describe('swagger-service', () => {
  it('应该展开主文档目录内的相对文件引用', async () => {
    const output = await parseSwaggerSource('tests/fixtures/swagger/refs/main.yaml', process.cwd(), {
      method: 'GET',
      path: '/users',
    })

    expect(output).toContain('Relative Ref API')
    expect(output).toContain('id（必填）: string - 用户 ID')
    expect(output).toContain('address: object')
  })

  it('应该拒绝展开主文档目录外的相对文件引用', async () => {
    const output = await parseSwaggerSource('tests/fixtures/swagger/refs/unsafe-main.yaml', process.cwd(), {
      method: 'GET',
      path: '/users',
    })

    expect(output).toContain('引用文件超出安全边界')
    expect(output).not.toContain('订单状态')
  })

  it('多级相对文件引用不应该漂移出主文档安全根', async () => {
    const output = await parseSwaggerSource('tests/fixtures/swagger/refs/nested-main.yaml', process.cwd(), {
      method: 'GET',
      path: '/users',
    })

    expect(output).toContain('引用文件超出安全边界')
    expect(output).not.toContain('泄露字段')
  })
})
