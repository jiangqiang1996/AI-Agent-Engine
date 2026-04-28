import type { SwaggerOperation, SwaggerParseResult } from './swagger-parser-service.js'

export type SwaggerOutputMode = 'overview' | 'detail'

export interface SwaggerFilterInput {
  method?: string
  path?: string
  tag?: string
  keyword?: string
  mode?: SwaggerOutputMode
}

export type SwaggerFilterResult =
  | { kind: 'overview'; parseResult: SwaggerParseResult; operations: SwaggerOperation[] }
  | { kind: 'detail'; parseResult: SwaggerParseResult; operation: SwaggerOperation }
  | { kind: 'candidates'; parseResult: SwaggerParseResult; operations: SwaggerOperation[]; reason: string }
  | { kind: 'multi-detail'; parseResult: SwaggerParseResult; operations: SwaggerOperation[] }
  | { kind: 'no-match'; parseResult: SwaggerParseResult; candidates: SwaggerOperation[] }

const MULTI_DETAIL_LIMIT = 5

function includesText(value: string | undefined, query: string): boolean {
  return value?.toLowerCase().includes(query) ?? false
}

export function filterSwaggerOperations(parseResult: SwaggerParseResult, filter: SwaggerFilterInput): SwaggerFilterResult {
  const method = filter.method?.toUpperCase()
  const path = filter.path
  const tag = filter.tag?.toLowerCase()
  const keyword = filter.keyword?.toLowerCase()
  const hasFilter = Boolean(method || path || tag || keyword)

  if (!hasFilter) {
    return { kind: 'overview', parseResult, operations: parseResult.operations }
  }

  const matched = parseResult.operations.filter((operation) => {
    if (method && operation.method !== method) return false
    if (path && operation.path !== path && !operation.path.includes(path)) return false
    if (tag && !operation.tags.some((item) => item.toLowerCase() === tag)) return false
    if (keyword) {
      const found = [operation.path, operation.summary, operation.description, operation.operationId]
        .some((value) => includesText(value, keyword))
      if (!found) return false
    }
    return true
  })

  if (matched.length === 0) {
    return { kind: 'no-match', parseResult, candidates: parseResult.operations.slice(0, 10) }
  }

  if (method && path && matched.length === 1) {
    return { kind: 'detail', parseResult, operation: matched[0] }
  }

  if (matched.length === 1) {
    return filter.mode === 'detail'
      ? { kind: 'detail', parseResult, operation: matched[0] }
      : { kind: 'overview', parseResult, operations: matched }
  }

  if (filter.mode === 'detail' && matched.length <= MULTI_DETAIL_LIMIT) {
    return { kind: 'multi-detail', parseResult, operations: matched }
  }

  return { kind: 'candidates', parseResult, operations: matched.slice(0, 10), reason: '筛选命中多个接口，请补充 method 和 path 缩小范围。' }
}
