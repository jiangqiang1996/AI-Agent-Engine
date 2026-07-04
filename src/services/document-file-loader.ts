import { promises as fs } from 'node:fs'
import path from 'node:path'

import { isInsideRoot } from '../utils/path-utils.js'
import {
  normalizeUserFilePath,
  rejectWindowsSpecialPath,
  isOutsideWorktree,
} from '../utils/document-path-security.js'

const DEFAULT_MAX_FILE_BYTES = 100 * 1024 * 1024

export interface FileLoaderResult {
  filePath: string
  buffer: Buffer
  fileSize: number
  outsideWorktree: boolean
}

export { normalizeUserFilePath, isOutsideWorktree }

function resolveMaxBytes(): number {
  const envValue = process.env.AE_DOCUMENT_MAX_BYTES
  if (!envValue) return DEFAULT_MAX_FILE_BYTES
  const parsed = Number(envValue)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_FILE_BYTES
  return parsed
}

/**
 * 对已 normalize 的文件路径做安全校验和 resolve。
 * 支持任意本地绝对路径（工作区内和工作区外均可读取），
 * 仅拒绝 UNC/ADS 等危险路径模式。
 * 不使用 fs.realpath 以避免 Windows 8.3 短名称转换副作用。
 */
export async function resolveDocumentPath(file: string, worktree: string): Promise<string> {
  const rawFile = normalizeUserFilePath(file)
  if (!rawFile) {
    throw new Error('请提供文件路径。')
  }

  rejectWindowsSpecialPath(rawFile)

  const resolved = path.resolve(worktree, rawFile)

  try {
    await fs.access(resolved)
  } catch {
    throw new Error('路径不存在，请确认文件路径正确。')
  }

  return resolved
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

  const outsideWorktree = !isInsideRoot(worktree, realTarget)

  return { filePath: realTarget, buffer, fileSize: stat.size, outsideWorktree }
}
