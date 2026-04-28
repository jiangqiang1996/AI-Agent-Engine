import { SwaggerError } from './swagger-errors.js'

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
  operations: SwaggerOperation[]
}

const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'options', 'head', 'trace'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
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

function schemaType(schema: Record<string, unknown> | undefined): string | undefined {
  if (!schema) return undefined
  if (typeof schema.type === 'string') return schema.type
  if (typeof schema.$ref === 'string') return schema.$ref.split('/').at(-1)
  return undefined
}

function schemaFields(schema: unknown, requiredNames: string[] = []): SwaggerSchemaField[] {
  if (!isRecord(schema)) return []

  if (typeof schema.$ref === 'string') {
    return [{ name: '$ref', type: schema.$ref, required: false, description: '内部引用，首版按引用标识展示。' }]
  }

  const required = Array.isArray(schema.required) ? schema.required.filter((v): v is string => typeof v === 'string') : requiredNames
  const properties = isRecord(schema.properties) ? schema.properties : undefined
  if (!properties) return []

  return Object.entries(properties).map(([name, value]) => {
    const fieldSchema = isRecord(value) ? value : undefined
    return {
      name,
      type: schemaType(fieldSchema),
      required: required.includes(name),
      description: fieldSchema ? asString(fieldSchema.description) : undefined,
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

function parseOpenApiRequestBody(value: unknown): SwaggerRequestBody | undefined {
  if (!isRecord(value)) return undefined
  const content = isRecord(value.content) ? value.content : {}
  const [contentType, media] = Object.entries(content).find(([, item]) => isRecord(item)) ?? []
  const mediaRecord = isRecord(media) ? media : undefined
  return {
    contentType,
    required: value.required === true,
    fields: schemaFields(mediaRecord?.schema),
  }
}

function parseSwaggerRequestBody(parameters: SwaggerParameter[], rawParameters: unknown): SwaggerRequestBody | undefined {
  const bodyParameter = asRecordArray(rawParameters).find((parameter) => parameter.in === 'body')
  if (!bodyParameter) return undefined
  return {
    required: parameters.some((parameter) => parameter.in === 'body' && parameter.required),
    fields: schemaFields(bodyParameter.schema),
  }
}

function parseResponses(value: unknown): SwaggerResponse[] {
  if (!isRecord(value)) return []

  return Object.entries(value).map(([status, response]) => {
    const record = isRecord(response) ? response : {}
    const content = isRecord(record.content) ? record.content : undefined
    const media = content ? Object.values(content).find(isRecord) : undefined
    const schema = isRecord(media) ? media.schema : record.schema
    return {
      status,
      description: asString(record.description),
      fields: schemaFields(schema),
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

  const specification = typeof input.openapi === 'string'
    ? 'openapi3'
    : input.swagger === '2.0'
      ? 'swagger2'
      : undefined

  if (!specification) {
    throw new SwaggerError('unsupported_version', '不支持的规格版本：首版支持 Swagger 2.0 和 OpenAPI 3.x JSON。')
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
        ? parseOpenApiRequestBody(operation.requestBody)
        : parseSwaggerRequestBody(operationParameters, operation.parameters)

      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: asString(operation.operationId),
        summary: asString(operation.summary),
        description: asString(operation.description),
        tags: Array.isArray(operation.tags) ? operation.tags.filter((tag): tag is string => typeof tag === 'string') : [],
        parameters: operationParameters,
        requestBody,
        responses: parseResponses(operation.responses),
        security: operationSecurity(operation, globalSecurity),
        servers: operationServers(specification, operation, pathItem, servers),
      })
    }
  }

  return {
    title: asString(info.title),
    version: asString(info.version),
    specification,
    operations,
  }
}
