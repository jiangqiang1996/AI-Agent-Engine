import { copyFileSync, lstatSync, renameSync, rmSync, writeFileSync } from 'node:fs'

export function isRetryableFsError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (
    error.code === 'EPERM' ||
    error.code === 'EBUSY' ||
    error.code === 'EACCES' ||
    error.code === 'EEXIST'
  )
}

export function runWithFsRetry(operation: () => void): void {
  let lastError: unknown
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      operation()
      return
    } catch (error) {
      lastError = error
      if (!isRetryableFsError(error)) {
        throw error
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50)
    }
  }
  throw lastError
}

export function assertWritableGraphFile(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) {
      throw new Error('图谱存储文件不能是符号链接')
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }
    throw error
  }
}

export function graphFileExists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export function writeJsonAtomic(path: string, value: unknown): void {
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const backupPath = `${tempPath}.bak`
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  try {
    renameSync(tempPath, path)
  } catch (error) {
    if (!isRetryableFsError(error)) {
      rmSync(tempPath, { force: true })
      throw error
    }
    const hasBackup = graphFileExists(path)
    if (hasBackup) {
      assertWritableGraphFile(path)
      copyFileSync(path, backupPath)
    }
    runWithFsRetry(() => {
      assertWritableGraphFile(path)
      renameSync(tempPath, path)
    })
    try {
      rmSync(tempPath, { force: true })
    } catch {
      // 替换成功后临时文件只影响磁盘清洁度，不应回滚已持久化的新图谱。
    }
    try {
      runWithFsRetry(() => rmSync(backupPath, { force: true }))
    } catch {
      // 备份残留不影响新图谱已写入；后续构建会清理 graph.json.tmp-* 残留文件。
    }
  }
}
