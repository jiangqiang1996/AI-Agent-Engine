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

export function generateDocumentOutputPath(
  worktree: string,
  operation: string,
  extension: string,
  baseName?: string,
): string {
  const nameBase = baseName ? basename(baseName, extension) : operation
  const timestamp = formatTimestamp(new Date())
  const random = randomBytes(3).toString('hex')
  const fileName = `${nameBase}-${operation}-${timestamp}-${random}.${extension}`
  return join(worktree, OUTPUT_BASE_DIR, extension, fileName)
}
