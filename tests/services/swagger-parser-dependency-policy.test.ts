import { describe, expect, it } from 'vitest'

import { createSwaggerParserDependencyPolicy } from '../../src/services/swagger-parser-dependency-policy.js'

describe('swagger-parser-dependency-policy', () => {
  it('应该默认禁用外部 file/http resolver', () => {
    expect(createSwaggerParserDependencyPolicy()).toEqual({
      allowExternalFileResolver: false,
      allowExternalHttpResolver: false,
      fallback: 'internal-json-pointer',
    })
  })
})
