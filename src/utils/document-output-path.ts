import { randomBytes } from 'node:crypto'
import { basename, join } from 'node:path'

const OUTPUT_BASE_DIR = 'ae/documents'

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  )
}

/**
 * 将 baseName 中的非 ASCII 字符替换为连字符，确保生成的文件名在所有平台和 shell 环境下安全。
 * Windows PowerShell 5.1 默认使用系统编码（中文环境为 GBK），含中文的文件名在获取路径时会出现乱码，
 * 进而导致后续工具调用传入文件路径时 JSON 序列化失败。
 */
function sanitizeBaseName(baseName: string): string {
  const sanitized = baseName.replace(/[^\x20-\x7E]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return sanitized || 'output'
}

export function generateDocumentOutputPath(
  worktree: string,
  operation: string,
  extension: string,
  baseName?: string,
): string {
  const rawName = baseName ? basename(baseName, extension) : operation
  const nameBase = sanitizeBaseName(rawName)
  const timestamp = formatTimestamp(new Date())
  const random = randomBytes(3).toString('hex')
  const fileName = `${nameBase}-${operation}-${timestamp}-${random}.${extension}`
  return join(worktree, OUTPUT_BASE_DIR, extension, fileName)
}

