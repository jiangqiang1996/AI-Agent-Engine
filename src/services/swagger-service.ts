import { filterSwaggerOperations, type SwaggerFilterInput } from './swagger-filter-service.js'
import { parseSwaggerDocument } from './swagger-parser-service.js'
import { redactSwaggerOutput } from './swagger-redaction-service.js'
import { formatSwaggerSummary } from './swagger-summary-service.js'
import { loadSwaggerSource } from './swagger-source-loader.js'

export async function parseSwaggerSource(source: string, worktree: string, filter: SwaggerFilterInput): Promise<string> {
  const loaded = await loadSwaggerSource(source, worktree)
  const document = JSON.parse(loaded.content) as unknown
  const parsed = parseSwaggerDocument(document)
  const filtered = filterSwaggerOperations(parsed, filter)
  return redactSwaggerOutput(formatSwaggerSummary(filtered))
}
