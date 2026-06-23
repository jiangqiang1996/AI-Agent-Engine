export type MarkitdownErrorCode =
  | 'input_empty'
  | 'path_not_found'
  | 'path_outside_root'
  | 'path_not_file'
  | 'file_empty'
  | 'file_too_large'
  | 'unsupported_format'
  | 'text_parse_failed'
  | 'json_parse_failed'
  | 'html_convert_failed'
  | 'docx_convert_failed'
  | 'xlsx_convert_failed'
  | 'pdf_convert_failed'
  | 'pptx_convert_failed'
  | 'image_convert_failed'
  | 'image_vision_unavailable'
  | 'image_vision_failed'
  | 'no_converter_matched'

export class MarkitdownError extends Error {
  constructor(
    readonly code: MarkitdownErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MarkitdownError'
  }
}

export function formatMarkitdownError(error: unknown): string {
  if (error instanceof MarkitdownError) {
    return error.message
  }

  if (error instanceof SyntaxError) {
    return `文件解析失败：${error.message}。请确认文件内容格式正确。`
  }

  const message = error instanceof Error ? error.message : String(error)
  return `文件转换失败：${message}`
}
