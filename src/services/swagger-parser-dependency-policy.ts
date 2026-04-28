export interface SwaggerParserDependencyPolicy {
  allowExternalFileResolver: false
  allowExternalHttpResolver: false
  fallback: 'internal-json-pointer'
}

export function createSwaggerParserDependencyPolicy(): SwaggerParserDependencyPolicy {
  return {
    allowExternalFileResolver: false,
    allowExternalHttpResolver: false,
    fallback: 'internal-json-pointer',
  }
}
