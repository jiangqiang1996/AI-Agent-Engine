export type SwaggerErrorCode =
  | 'input_empty'
  | 'path_not_found'
  | 'path_outside_root'
  | 'path_not_file'
  | 'file_empty'
  | 'file_too_large'
  | 'json_parse_failed'
  | 'yaml_parse_failed'
  | 'html_document_received'
  | 'document_structure_invalid'
  | 'unsupported_version'
  | 'remote_protocol_unsupported'
  | 'remote_address_blocked'
  | 'remote_timeout'
  | 'remote_connection_aborted'
  | 'remote_redirect_limit'
  | 'remote_response_too_large'
  | 'remote_non_2xx'
  | 'remote_empty_response'

export class SwaggerError extends Error {
  constructor(
    readonly code: SwaggerErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SwaggerError'
  }
}

export function formatSwaggerError(error: unknown): string {
  if (error instanceof SwaggerError) {
    return error.message
  }

  if (error instanceof SyntaxError) {
    return 'JSON 解析失败：请确认输入是合法的 Swagger/OpenAPI JSON 或 YAML 文件。'
  }

  const message = error instanceof Error ? error.message : String(error)
  return `Swagger 解析失败：${message}`
}
