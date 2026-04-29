import type { SwaggerFilterResult } from './swagger-filter-service.js'
import type { SwaggerOperation, SwaggerParameter, SwaggerResponse, SwaggerSchemaField } from './swagger-parser-service.js'

const DEFAULT_OVERVIEW_LIMIT = 30
const DETAIL_BUDGET = 12000

function line(value: string): string {
  return value.trimEnd()
}

function operationTitle(operation: SwaggerOperation): string {
  return `${operation.method} ${operation.path}`
}

function formatFieldMeta(field: SwaggerSchemaField): string {
  const meta = [
    field.type ?? 'unknown',
    field.enumValues && field.enumValues.length > 0 ? `enum=${field.enumValues.join('|')}` : undefined,
    field.defaultValue !== undefined ? `default=${field.defaultValue}` : undefined,
    field.example !== undefined ? `example=${field.example}` : undefined,
  ].filter((item): item is string => Boolean(item))

  return meta.join('；')
}

function formatFields(fields: SwaggerSchemaField[]): string[] {
  if (fields.length === 0) return ['- 未声明字段。']
  return fields.map((field) => `- ${field.name}${field.required ? '（必填）' : ''}: ${formatFieldMeta(field)}${field.description ? ` - ${field.description}` : ''}`)
}

function formatParameters(parameters: SwaggerParameter[], location: string): string[] {
  const items = parameters.filter((parameter) => parameter.in === location)
  if (items.length === 0) return ['- 未声明。']
  return items.map((parameter) => `- ${parameter.name}${parameter.required ? '（必填）' : ''}: ${parameter.type ?? 'unknown'}${parameter.description ? ` - ${parameter.description}` : ''}`)
}

function formatResponses(responses: SwaggerResponse[]): string[] {
  if (responses.length === 0) return ['- 未声明响应。']
  return responses.flatMap((response) => [
    `- ${response.status}: ${response.description ?? '未提供说明'}`,
    ...formatFields(response.fields).map((item) => `  ${item}`),
  ])
}

function truncateOutput(output: string): string {
  if (output.length <= DETAIL_BUDGET) return output
  return `${output.slice(0, DETAIL_BUDGET)}\n\n> 输出已截断。请增加 method/path/tag/keyword 筛选后重新调用。`
}

export function formatSwaggerSummary(result: SwaggerFilterResult, redact: (output: string) => string = (output) => output): string {
  if (result.kind === 'detail') {
    return truncateOutput(redact(formatDetail(result.operation, result.parseResult.title)))
  }

  if (result.kind === 'multi-detail') {
    return truncateOutput(redact([
      '# 多接口请求摘要',
      '',
      `命中 ${result.operations.length} 个接口。以下仅展示请求关键信息，不展开完整响应 schema。`,
      '',
      ...result.operations.flatMap(formatRequestCard),
    ].map(line).join('\n')))
  }

  if (result.kind === 'candidates') {
    return redact(formatOverview(result.parseResult.title, result.operations, result.reason))
  }

  if (result.kind === 'no-match') {
    return redact(formatOverview(result.parseResult.title, result.candidates, '未找到匹配接口。请调整 method、path、tag 或 keyword。'))
  }

  return redact(formatOverview(result.parseResult.title, result.operations))
}

function formatOverview(title: string | undefined, operations: SwaggerOperation[], note?: string): string {
  const tags = new Map<string, number>()
  for (const operation of operations) {
    for (const tag of operation.tags) tags.set(tag, (tags.get(tag) ?? 0) + 1)
  }

  const visible = operations.slice(0, DEFAULT_OVERVIEW_LIMIT)
  const lines = [
    '# Swagger 概览',
    '',
    `文档：${title ?? '未命名 API'}`,
    `接口数量：${operations.length}`,
    `标签统计：${tags.size === 0 ? '未声明' : [...tags.entries()].map(([tag, count]) => `${tag}(${count})`).join('、')}`,
  ]

  if (note) lines.push(`提示：${note}`)

  lines.push('', '## 接口列表')
  for (const operation of visible) {
    lines.push(`- ${operationTitle(operation)}${operation.summary ? ` - ${operation.summary}` : ''}${operation.operationId ? ` (${operation.operationId})` : ''}`)
  }

  if (operations.length > visible.length) {
    lines.push('', `> 仅展示前 ${visible.length} 个接口。请使用 method/path/tag/keyword 继续筛选。`)
  }

  lines.push('', '下一步示例：`method:GET path:/pets mode:detail`')
  return lines.map(line).join('\n')
}

function formatDetail(operation: SwaggerOperation, title: string | undefined): string {
  return [
    `# 接口详情：${operationTitle(operation)}`,
    '',
    `文档：${title ?? '未命名 API'}`,
    `说明：${operation.summary ?? operation.description ?? '未提供说明'}`,
    `Base URL：${operation.servers[0] ?? '未声明'}`,
    `认证：${operation.security.length === 0 ? '未声明' : operation.security.map((item) => item.name).join('、')}`,
    '',
    '## 路径参数',
    ...formatParameters(operation.parameters, 'path'),
    '',
    '## 查询参数',
    ...formatParameters(operation.parameters, 'query'),
    '',
    '## 请求头',
    ...formatParameters(operation.parameters, 'header'),
    '',
    '## Cookie 参数',
    ...formatParameters(operation.parameters, 'cookie'),
    '',
    '## 请求体字段',
    ...(operation.requestBody ? formatFields(operation.requestBody.fields) : ['- 未声明请求体。']),
    '',
    '## curl 示例',
    '```bash',
    formatCurlExample(operation),
    '```',
    '> 示例使用占位值，不代表请求可直接成功。',
    '',
    '## 响应',
    ...formatResponses(operation.responses),
  ].map(line).join('\n')
}

function parameterPlaceholder(parameter: SwaggerParameter): string {
  return `<${parameter.name}>`
}

function formatCurlExample(operation: SwaggerOperation): string {
  const baseUrl = operation.servers[0] ?? 'https://example.com'
  let requestPath = operation.path
  for (const parameter of operation.parameters.filter((item) => item.in === 'path')) {
    requestPath = requestPath.replace(`{${parameter.name}}`, parameterPlaceholder(parameter))
  }

  const query = operation.parameters
    .filter((item) => item.in === 'query')
    .map((item) => `${encodeURIComponent(item.name)}=${encodeURIComponent(parameterPlaceholder(item))}`)
    .join('&')
  const url = `${baseUrl}${requestPath}${query ? `?${query}` : ''}`
  const parts = [`curl -X ${operation.method} ${shellQuote(url)}`]
  for (const parameter of operation.parameters.filter((item) => item.in === 'header')) {
    parts.push(`  -H ${shellQuote(`${parameter.name}: ${parameterPlaceholder(parameter)}`)}`)
  }
  for (const parameter of operation.parameters.filter((item) => item.in === 'cookie')) {
    parts.push(`  -H ${shellQuote(`Cookie: ${parameter.name}=${parameterPlaceholder(parameter)}`)}`)
  }
  if (operation.requestBody) {
    parts.push(`  -H ${shellQuote(`Content-Type: ${operation.requestBody.contentType ?? 'application/json'}`)}`)
    parts.push(`  -d ${shellQuote('<request-body>')}`)
  }
  return parts.join(' \\\n')
}

function shellQuote(value: string): string {
  return `'${value.replace(/[\r\n]+/g, ' ').replaceAll("'", "'\"'\"'")}'`
}

function formatRequestCard(operation: SwaggerOperation): string[] {
  return [
    `## ${operationTitle(operation)}`,
    `认证：${operation.security.length === 0 ? '未声明' : operation.security.map((item) => item.name).join('、')}`,
    '路径参数：',
    ...formatParameters(operation.parameters, 'path'),
    '查询参数：',
    ...formatParameters(operation.parameters, 'query'),
    '请求头：',
    ...formatParameters(operation.parameters, 'header'),
    '请求体字段：',
    ...(operation.requestBody ? formatFields(operation.requestBody.fields) : ['- 未声明请求体。']),
    '',
  ]
}
