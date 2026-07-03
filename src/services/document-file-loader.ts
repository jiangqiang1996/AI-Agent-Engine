import { promises as fs } from 'node:fs'
import path from 'node:path'

const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024

export interface FileLoaderResult {
  filePath: string
  buffer: Buffer
  fileSize: number
}

export function normalizeUserFilePath(file: string): string {
  let normalized = file.trim()
  if (normalized.startsWith('@')) normalized = normalized.slice(1)
  const wrappers = [['"', '"'], ["'", "'"], ['`', '`']] as const
  for (const [open, close] of wrappers) {
    if (normalized.length >= 2 && normalized.startsWith(open) && normalized.endsWith(close)) {
      normalized = normalized.slice(1, -1)
      break
    }
  }
  return normalized.trim()
}

function rejectWindowsSpecialPath(source: string): void {
  if (
    source.startsWith('\\\\') ||
    source.startsWith('\\\\?\\') ||
    /:[^\\/]+$/.test(source.replace(/^[a-zA-Z]:/, ''))
  ) {
    throw new Error('路径越界：不允许 UNC、扩展长度路径或备用数据流路径。')
  }
}

function resolveMaxBytes(): number {
  const envValue = process.env.AE_DOCUMENT_MAX_BYTES
  if (!envValue) return DEFAULT_MAX_FILE_BYTES
  const parsed = Number(envValue)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_FILE_BYTES
  return parsed
}

/**
 * 对已 normalize 的文件路径做完整安全校验和 resolve，
 * 返回 worktree 内的绝对路径。复用 loadDocumentFile 的
 * UNC 拒绝、realpath 解析和越界检测逻辑，但不读文件内容。
 */
export async function resolveDocumentPath(file: string, worktree: string): Promise<string> {
  const rawFile = normalizeUserFilePath(file)
  if (!rawFile) {
    throw new Error('请提供文件路径。')
  }

  rejectWindowsSpecialPath(rawFile)

  const root = await fs.realpath(worktree)
  const target = path.resolve(root, rawFile)
  let realTarget: string
  try {
    realTarget = await fs.realpath(target)
  } catch {
    throw new Error('路径不存在，请确认文件位于当前工作区内。')
  }

  const relative = path.relative(root, realTarget)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('路径越界：只能读取当前工作区内的文件。')
  }

  return realTarget
}

export async function loadDocumentFile(
  file: string,
  worktree: string,
  formatName: string,
): Promise<FileLoaderResult> {
  let realTarget: string
  try {
    realTarget = await resolveDocumentPath(file, worktree)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`${formatName} 读取失败：${msg}`)
  }

  const stat = await fs.stat(realTarget)
  if (!stat.isFile()) {
    throw new Error(`${formatName} 读取失败：路径不是文件，请提供文件路径而非目录。`)
  }

  const maxBytes = resolveMaxBytes()
  if (stat.size > maxBytes) {
    throw new Error(
      `${formatName} 读取失败：文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），当前上限为 ${(maxBytes / 1024 / 1024).toFixed(0)} MB。`,
    )
  }

  const buffer = await fs.readFile(realTarget)
  if (buffer.length === 0) {
    throw new Error(`${formatName} 读取失败：文件为空，请提供有效的文件内容。`)
  }

  return { filePath: realTarget, buffer, fileSize: stat.size }
}
