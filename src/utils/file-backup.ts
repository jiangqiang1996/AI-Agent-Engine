import { copyFileSync, existsSync, unlinkSync } from 'node:fs'

const BACKUP_SUFFIX = '.bak'

export function createBackup(filePath: string): string {
  const backupPath = filePath + BACKUP_SUFFIX
  copyFileSync(filePath, backupPath)
  return backupPath
}

export function removeBackup(backupPath: string): void {
  if (existsSync(backupPath)) {
    unlinkSync(backupPath)
  }
}

export function restoreFromBackup(backupPath: string, originalPath: string): void {
  if (existsSync(backupPath)) {
    copyFileSync(backupPath, originalPath)
    unlinkSync(backupPath)
  } else {
    console.warn(`[file-backup] 备份文件不存在，无法恢复: ${backupPath}，原始文件 ${originalPath} 可能已损坏`)
  }
}

export function withBackup<T>(filePath: string, operation: () => T): T {
  if (!existsSync(filePath)) {
    return operation()
  }
  const backupPath = createBackup(filePath)
  try {
    const result = operation()
    removeBackup(backupPath)
    return result
  } catch (error) {
    restoreFromBackup(backupPath, filePath)
    throw error
  }
}

export async function withBackupAsync<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  if (!existsSync(filePath)) {
    return operation()
  }
  const backupPath = createBackup(filePath)
  try {
    const result = await operation()
    removeBackup(backupPath)
    return result
  } catch (error) {
    restoreFromBackup(backupPath, filePath)
    throw error
  }
}
