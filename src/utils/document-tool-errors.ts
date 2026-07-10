/**
 * 文档处理工具的共享错误格式化函数。
 *
 * 统一文档工具（ae-docx/pdf/pptx/xlsx/audio/video/image）的 catch 块逻辑，
 * 根据错误类型分类输出可恢复的中文提示。
 */
export function formatDocumentToolError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)

  // 参数校验错误：消息以中文开头且包含"参数"
  if (message.includes('参数')) {
    return `${toolName} 处理失败：${message}。请修正参数后重试。`
  }

  // 文件不存在错误
  if (message.includes('不存在') || message.includes('ENOENT')) {
    return `${toolName} 处理失败：文件不存在或路径错误。请检查文件路径是否正确。`
  }

  // 文件格式错误
  if (message.includes('格式') || message.includes('invalid') || message.includes('corrupt')) {
    return `${toolName} 处理失败：文件格式不正确或已损坏。请确认文件是否为有效的 ${toolName} 文件。`
  }

  // 权限错误
  if (message.includes('EACCES') || message.includes('permission')) {
    return `${toolName} 处理失败：文件访问被拒绝。请检查文件权限或是否被其他程序占用。`
  }

  // 磁盘空间错误
  if (message.includes('ENOSPC') || message.includes('space')) {
    return `${toolName} 处理失败：磁盘空间不足。请释放磁盘空间后重试。`
  }

  // LibreOffice 相关错误
  if (message.includes('LibreOffice') || message.includes('soffice')) {
    return `${toolName} 处理失败：LibreOffice 不可用。请先通过 ae:libreoffice 技能安装或配置 LibreOffice。`
  }

  // 默认：通用错误提示
  return `${toolName} 处理失败：${message}。请检查文件路径和参数是否正确。`
}
