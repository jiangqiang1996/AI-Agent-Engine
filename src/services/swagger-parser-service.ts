import { SwaggerError } from './swagger-errors.js'
import { resolveLocalJsonPointer } from './swagger-ref-resolver.js'

export interface SwaggerParameter {
  name: string
  in: string
  required: boolean
  type?: string
  description?: string
}

export interface SwaggerSchemaField {
  name: string
  type?: string
  required: boolean
  description?: string
  enumValues?: string[]
  defaultValue?: string
  example?: string
}

export interface SwaggerRequestBody {
  contentType?: string
  required: boolean
  fields: SwaggerSchemaField[]
}

export interface SwaggerResponse {
  status: string
  description?: string
  fields: SwaggerSchemaField[]
}

export interface SwaggerSecurityRequirement {
  name: string
  scopes: string[]
}

export interface SwaggerOperation {
  method: string
  path: string
  operationId?: string
  summary?: string
  description?: string
  tags: string[]
  parameters: SwaggerParameter[]
  requestBody?: SwaggerRequestBody
  responses: SwaggerResponse[]
  security: SwaggerSecurityRequirement[]
  servers: string[]
}

export interface SwaggerParseResult {
  title?: string
  version?: string
  specification: 'openapi3' | 'swagger2'
  openapiVersion?: '3.0' | '3.1'
  operations: SwaggerOperation[]
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function displayValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value)
  return undefined
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function readSecurity(value: unknown): SwaggerSecurityRequirement[] {
  return asRecordArray(value).flatMap((item) =>
    Object.entries(item).map(([name, scopes]) => ({
      name,
      scopes: Array.isArray(scopes) ? scopes.filter((scope): scope is string => typeof scope === 'string') : [],
    })),
  )
}

function resolveSchema(document: unknown, schema: unknown, depth = 0, visited = new Set<string>()): unknown {
  if (!isRecord(schema) || typeof schema.$ref !== 'string') return schema
  if (!schema.$ref.startsWith('#/')) return schema
  if (depth >= 4 || visited.has(schema.$ref)) {
    return { $ref: schema.$ref, description: '引用过深或存在循环，已停止展开。' }
  }

  visited.add(schema.$ref)
  const resolved = resolveLocalJsonPointer(document, schema.$ref)
  return resolveSchema(document, resolved, depth + 1, visited)
}

function schemaType(schema: Record<string, unknown> | undefined): string | undefined {
  if (!schema) return undefined
  if (typeof schema.type === 'string') return schema.type
  if (Array.isArray(schema.type) && schema.type.every((item) => typeof item === 'string')) return schema.type.join(' | ')
  if (typeof schema.const === 'string') return `const:${schema.const}`
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').at(-1)
  return undefined
}

function schemaFields(document: unknown, schema: unknown, requiredNames: string[] = []): SwaggerSchemaField[] {
  const resolvedSchema = resolveSchema(document, schema)
  if (!isRecord(resolvedSchema)) return []

  if (typeof resolvedSchema.$ref === 'string') {
    return [{
      name: '$ref',
      type: resolvedSchema.$ref,
      required: false,
      description: asString(resolvedSchema.description) ?? '外部引用或无法展开的引用，已按引用标识展示。',
    }]
  }

  const required = Array.isArray(resolvedSchema.required) ? resolvedSchema.required.filter((v): v is string => typeof v === 'string') : requiredNames
  const properties = isRecord(resolvedSchema.properties) ? resolvedSchema.properties : undefined
  if (!properties) return []

  return Object.entries(properties).map(([name, value]) => {
    const fieldSchema = isRecord(resolveSchema(document, value)) ? resolveSchema(document, value) as Record<string, unknown> : undefined
    const enumValues = Array.isArray(fieldSchema?.enum)
      ? fieldSchema.enum.map(displayValue).filter((item): item is string => Boolean(item))
      : undefined
    return {
      name,
      type: schemaType(fieldSchema),
      required: required.includes(name),
      description: fieldSchema ? asString(fieldSchema.description) : undefined,
      enumValues,
      defaultValue: fieldSchema ? displayValue(fieldSchema.default) : undefined,
      example: fieldSchema ? displayValue(fieldSchema.example ?? fieldSchema.examples) : undefined,
    }
  })
}

function parseParameters(value: unknown): SwaggerParameter[] {
  return asRecordArray(value).map((parameter) => ({
    name: asString(parameter.name) ?? '未命名参数',
    in: asString(parameter.in) ?? 'unknown',
    required: parameter.required === true,
    type: asString(parameter.type) ?? (isRecord(parameter.schema) ? schemaType(parameter.schema) : undefined),
    description: asString(parameter.description),
  }))
}

function parseOpenApiRequestBody(document: unknown, value: unknown): SwaggerRequestBody | undefined {
  if (!isRecord(value)) return undefined
  const content = isRecord(value.content) ? value.content : {}
  const [contentType, media] = Object.entries(content).find(([, item]) => isRecord(item)) ?? []
  const mediaRecord = isRecord(media) ? media : undefined
  return {
    contentType,
    required: value.required === true,
    fields: schemaFields(document, mediaRecord?.schema),
  }
}

function parseSwaggerRequestBody(document: unknown, parameters: SwaggerParameter[], rawParameters: unknown): SwaggerRequestBody | undefined {
  const bodyParameter = asRecordArray(rawParameters).find((parameter) => parameter.in === 'body')
  const formParameters = asRecordArray(rawParameters).filter((parameter) => parameter.in === 'formData')
  if (formParameters.length > 0) {
    return {
      contentType: 'application/x-www-form-urlencoded',
      required: formParameters.some((parameter) => parameter.required === true),
      fields: formParameters.map((parameter) => ({
        name: asString(parameter.name) ?? '未命名字段',
        type: asString(parameter.type),
        required: parameter.required === true,
        description: asString(parameter.description),
        enumValues: Array.isArray(parameter.enum)
          ? parameter.enum.map(displayValue).filter((item): item is string => Boolean(item))
          : undefined,
        defaultValue: displayValue(parameter.default),
        example: displayValue(parameter.example),
      })),
    }
  }
  if (!bodyParameter) return undefined
  return {
    required: parameters.some((parameter) => parameter.in === 'body' && parameter.required),
    fields: schemaFields(document, bodyParameter.schema),
  }
}

function parseResponses(document: unknown, value: unknown): SwaggerResponse[] {
  if (!isRecord(value)) return []

  return Object.entries(value).map(([status, response]) => {
    const record = isRecord(response) ? response : {}
    const content = isRecord(record.content) ? record.content : undefined
    const media = content ? Object.values(content).find(isRecord) : undefined
    const schema = isRecord(media) ? media.schema : record.schema
    return {
      status,
      description: asString(record.description),
      fields: schemaFields(document, schema),
    }
  })
}

function swagger2Servers(doc: Record<string, unknown>): string[] {
  const host = asString(doc.host)
  const basePath = asString(doc.basePath) ?? ''
  const schemes = Array.isArray(doc.schemes) ? doc.schemes.filter((v): v is string => typeof v === 'string') : ['https']
  if (!host) return []
  return schemes.map((scheme) => `${scheme}://${host}${basePath}`)
}

function openApiServers(doc: Record<string, unknown>): string[] {
  return asRecordArray(doc.servers).map((server) => asString(server.url)).filter((url): url is string => Boolean(url))
}

function operationSecurity(
  operation: Record<string, unknown>,
  globalSecurity: SwaggerSecurityRequirement[],
): SwaggerSecurityRequirement[] {
  return Object.hasOwn(operation, 'security') ? readSecurity(operation.security) : globalSecurity
}

function operationServers(
  specification: SwaggerParseResult['specification'],
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  rootServers: string[],
): string[] {
  if (specification !== 'openapi3') {
    return rootServers
  }

  const ownServers = openApiServers(operation)
  if (ownServers.length > 0) {
    return ownServers
  }

  const pathServers = openApiServers(pathItem)
  return pathServers.length > 0 ? pathServers : rootServers
}

export function parseSwaggerDocument(input: unknown): SwaggerParseResult {
  if (!isRecord(input)) {
    throw new SwaggerError('json_parse_failed', 'JSON 解析失败：Swagger/OpenAPI 根节点必须是对象。')
  }

  const info = isRecord(input.info) ? input.info : {}
  const paths = isRecord(input.paths) ? input.paths : undefined
  if (!paths) {
    throw new SwaggerError('unsupported_version', '不支持的规格版本：缺少 paths 对象。')
  }

  const openapiVersion = typeof input.openapi === 'string' && /^3\.0(?:\.\d+)?$/.test(input.openapi)
    ? '3.0'
    : typeof input.openapi === 'string' && /^3\.1(?:\.\d+)?$/.test(input.openapi)
      ? '3.1'
      : undefined
  const specification = openapiVersion
    ? 'openapi3'
    : input.swagger === '2.0'
      ? 'swagger2'
      : undefined

  if (!specification) {
    throw new SwaggerError('unsupported_version', '不支持的规格版本：支持 Swagger 2.0 和 OpenAPI 3.x JSON/YAML。')
  }

  const servers = specification === 'openapi3' ? openApiServers(input) : swagger2Servers(input)
  const globalSecurity = readSecurity(input.security)
  const operations: SwaggerOperation[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!isRecord(pathItem)) continue
    const pathParameters = parseParameters(pathItem.parameters)

    for (const [methodName, operation] of Object.entries(pathItem)) {
      const method = methodName.toLowerCase()
      if (!HTTP_METHODS.has(method) || !isRecord(operation)) continue

      const operationParameters = [...pathParameters, ...parseParameters(operation.parameters)]
      const requestBody = specification === 'openapi3'
        ? parseOpenApiRequestBody(input, operation.requestBody)
        : parseSwaggerRequestBody(input, operationParameters, operation.parameters)

      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: asString(operation.operationId),
        summary: asString(operation.summary),
        description: asString(operation.description),
        tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        parameters: operationParameters,
        requestBody,
        responses: parseResponses(input, operation.responses),
        security: operationSecurity(operation, globalSecurity),
        servers: operationServers(specification, operation, pathItem, servers),
      })
    }
  }

  return {
    title: asString(info.title),
    version: asString(info.version),
    specification,
    openapiVersion,
    operations,
  }
}
