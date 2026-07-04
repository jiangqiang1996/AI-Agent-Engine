import path from 'node:path'

import { isInsideRoot } from './path-utils.js'

/**
 * 对用户输入的文件路径做规范化处理：
 * 去除首尾空白、去除前导 @、去除成对引号包裹。
 */
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

/**
 * 拒绝 Windows 特殊路径：UNC、扩展长度路径、备用数据流。
 */
export function rejectWindowsSpecialPath(source: string): void {
  if (
    source.startsWith('\\\\') ||
    source.startsWith('\\\\?\\') ||
    /:[^\\/]+$/.test(source.replace(/^[a-zA-Z]:/, ''))
  ) {
    throw new Error('路径安全限制：不允许 UNC、扩展长度路径或备用数据流路径。')
  }
}

/**
 * 写入操作的危险等级。
 * - safe: 在工作区内，无需额外确认
 * - outside: 在工作区外，需要用户确认
 */
export type WriteDangerLevel = 'safe' | 'outside'

/**
 * 判断路径是否在指定 worktree 之外。
 * 绝对路径在 worktree 外返回 true；相对路径总是相对于 worktree 解析，不会越界。
 */
export function isOutsideWorktree(worktree: string, filePath: string): boolean {
  const rawFile = normalizeUserFilePath(filePath)
  if (!rawFile) return false
  const resolved = path.resolve(worktree, rawFile)
  return !isInsideRoot(worktree, resolved)
}

/**
 * 判断写入操作的目标路径是否在工作区外，返回危险等级。
 */
export function assessWriteDanger(worktree: string, outputPath: string | undefined): WriteDangerLevel {
  if (!outputPath) return 'safe'
  if (isOutsideWorktree(worktree, outputPath)) return 'outside'
  return 'safe'
}

/**
 * 判断文件路径列表中是否有工作区外的路径（用于 merge 等多文件操作）。
 */
export function hasOutsideWorktreePaths(worktree: string, files: string[] | undefined): boolean {
  if (!files) return false
  return files.some((f) => isOutsideWorktree(worktree, f))
}

/**
 * 判断原地修改操作的目标文件是否在工作区外。
 * 用于 edit/track-changes/append-blocks/update-block 等不指定 outputPath 的操作。
 */
export function isInPlaceEditOutsideWorktree(worktree: string, file: string | undefined): boolean {
  if (!file) return false
  return isOutsideWorktree(worktree, file)
}

/**
 * 构建工作区外写入操作的确认提示消息。
 */
export function buildOutsideWriteConfirmMessage(
  operation: string,
  formatName: string,
  paths: string[],
): string {
  const pathList = paths.map((p) => `  - ${p}`).join('\n')
  return [
    `即将在工作区外执行 ${formatName} ${operation} 操作，涉及以下路径：`,
    pathList,
    '',
    '工作区外写入可能影响其他项目的文件，是否继续？',
  ].join('\n')
}
