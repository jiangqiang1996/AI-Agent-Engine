/**
 * 文档处理工具的共享错误格式化函数。
 *
 * 统一 4 个文档工具（ae-docx/pdf/pptx/xlsx）的 catch 块逻辑，
 * 避免每个 tool 文件重复编写相同的错误提取与中文提示代码。
 */
export function formatDocumentToolError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `${toolName} 处理失败：${message}。请检查文件路径和参数是否正确。`
}
