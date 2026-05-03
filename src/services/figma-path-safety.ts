import { lstat, mkdir, open, realpath, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'

import { FigmaAssetError } from './figma-result-formatter.js'
import { isInsideRoot } from '../utils/path-utils.js'

const MAX_FILE_BYTES = 25 * 1024 * 1024

export async function resolveWorkspacePath(workspaceRoot: string, inputPath: string): Promise<string> {
  const resolved = resolve(workspaceRoot, inputPath)
  if (!isInsideRoot(workspaceRoot, resolved)) {
    throw new FigmaAssetError(`路径不在工作区内：${inputPath}`, 'path_outside_workspace')
  }
  await ensureNoSymlinkInExistingAncestors(workspaceRoot, resolved)
  return resolved
}

export async function resolveExistingWorkspacePath(workspaceRoot: string, inputPath: string): Promise<string> {
  const resolved = await resolveWorkspacePath(workspaceRoot, inputPath)
  await ensureNoSymlink(resolved)
  const realWorkspace = await realpath(workspaceRoot)
  const realTarget = await realpath(resolved)
  if (!isInsideRoot(realWorkspace, realTarget)) {
    throw new FigmaAssetError(`路径真实位置不在工作区内：${inputPath}`, 'path_outside_workspace')
  }
  return resolved
}

export async function ensureSafeOutputRoot(workspaceRoot: string, outputRoot: string): Promise<void> {
  if (!isInsideRoot(workspaceRoot, outputRoot)) {
    throw new FigmaAssetError('输出目录必须位于工作区内。', 'output_outside_workspace')
  }
  await mkdir(outputRoot, { recursive: true })
  await ensureNoSymlink(outputRoot)
  const realWorkspace = await realpath(workspaceRoot)
  const realOutput = await realpath(outputRoot)
  if (!isInsideRoot(realWorkspace, realOutput)) {
    throw new FigmaAssetError('输出目录真实位置必须位于工作区内。', 'output_outside_workspace')
  }
  const outputStat = await stat(outputRoot)
  if (!outputStat.isDirectory()) {
    throw new FigmaAssetError('输出路径必须是目录。', 'output_not_directory')
  }
}

export async function ensureSafeDirectoryPath(workspaceRoot: string, baseRoot: string, directoryPath: string): Promise<void> {
  if (!isInsideRoot(baseRoot, directoryPath)) {
    throw new FigmaAssetError('目标目录必须位于输出目录内。', 'path_outside_output')
  }
  await ensureNoSymlinkInExistingAncestors(workspaceRoot, directoryPath)
  try {
    await ensureNoSymlink(directoryPath)
  } catch (error) {
    if (error instanceof FigmaAssetError) {
      throw error
    }
  }

  const realWorkspace = await realpath(workspaceRoot)
  const realBase = await realpath(baseRoot)
  try {
    const realDirectory = await realpath(directoryPath)
    if (!isInsideRoot(realWorkspace, realDirectory) || !isInsideRoot(realBase, realDirectory)) {
      throw new FigmaAssetError('目标目录真实位置必须位于工作区输出目录内。', 'path_outside_output')
    }
  } catch (error) {
    if (error instanceof FigmaAssetError) {
      throw error
    }
  }
}

export async function ensureNoSymlink(path: string): Promise<void> {
  const stats = await lstat(path)
  if (stats.isSymbolicLink()) {
    throw new FigmaAssetError(`路径不能是符号链接或重解析点：${path}`, 'unsafe_symlink_path')
  }
}

export async function ensureNoSymlinkInExistingAncestors(workspaceRoot: string, targetPath: string): Promise<void> {
  const rel = relative(resolve(workspaceRoot), resolve(targetPath))
  if (!rel || rel.startsWith('..')) {
    return
  }

  let current = resolve(workspaceRoot)
  for (const segment of rel.split(/[\\/]+/)) {
    current = join(current, segment)
    try {
      await ensureNoSymlink(current)
    } catch (error) {
      if (error instanceof FigmaAssetError) {
        throw error
      }
      break
    }
  }
}

export async function ensureSafePathBeforeDelete(workspaceRoot: string, targetPath: string): Promise<void> {
  try {
    await resolveExistingWorkspacePath(workspaceRoot, targetPath)
  } catch (error) {
    if (error instanceof FigmaAssetError && error.code === 'path_outside_workspace') {
      throw error
    }
  }
}

export async function ensureFileWithinSizeLimit(filePath: string, maxBytes = MAX_FILE_BYTES): Promise<void> {
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    throw new FigmaAssetError(`路径不是文件：${filePath}`, 'not_a_file')
  }
  if (fileStat.size > maxBytes) {
    throw new FigmaAssetError('素材超过单文件大小上限。', 'asset_too_large')
  }
}

interface FileSnapshot {
  realPath: string
  size: number
  mtimeMs: number
  dev: number
  ino: number
}

export interface StableSourceFile {
  handle: FileHandle
  snapshot: FileSnapshot
}

export async function snapshotSourceFile(filePath: string): Promise<FileSnapshot> {
  await ensureNoSymlink(filePath)
  const fileStat = await stat(filePath)
  if (!fileStat.isFile()) {
    throw new FigmaAssetError(`路径不是文件：${filePath}`, 'not_a_file')
  }
  return {
    realPath: await realpath(filePath),
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    dev: fileStat.dev,
    ino: fileStat.ino,
  }
}

export async function ensureSourceFileUnchanged(filePath: string, before: FileSnapshot): Promise<void> {
  const after = await snapshotSourceFile(filePath)
  assertSameFileSnapshot(before, after)
}

export async function openStableSourceFile(filePath: string): Promise<StableSourceFile> {
  await ensureNoSymlink(filePath)
  const beforePathOpen = await snapshotSourceFile(filePath)
  const handle = await open(filePath, 'r')
  try {
    const handleStat = await handle.stat()
    if (!handleStat.isFile()) {
      throw new FigmaAssetError(`路径不是文件：${filePath}`, 'not_a_file')
    }
    const afterPathOpen = await snapshotSourceFile(filePath)
    assertSameFileSnapshot(beforePathOpen, {
      realPath: afterPathOpen.realPath,
      size: handleStat.size,
      mtimeMs: handleStat.mtimeMs,
      dev: handleStat.dev,
      ino: handleStat.ino,
    })
    assertSameFileSnapshot(beforePathOpen, afterPathOpen)
    return { handle, snapshot: beforePathOpen }
  } catch (error) {
    await handle.close()
    throw error
  }
}

export async function assertOpenSourceFileUnchanged(filePath: string, source: StableSourceFile): Promise<void> {
  const handleStat = await source.handle.stat()
  assertSameFileSnapshot(source.snapshot, {
    realPath: source.snapshot.realPath,
    size: handleStat.size,
    mtimeMs: handleStat.mtimeMs,
    dev: handleStat.dev,
    ino: handleStat.ino,
  })
  await ensureSourceFileUnchanged(filePath, source.snapshot)
}

function assertSameFileSnapshot(before: FileSnapshot, after: FileSnapshot): void {
  const hasStableIdentity = before.dev !== 0 || before.ino !== 0 || after.dev !== 0 || after.ino !== 0
  if (
    before.realPath !== after.realPath
    || before.size !== after.size
    || before.mtimeMs !== after.mtimeMs
    || (hasStableIdentity && (before.dev !== after.dev || before.ino !== after.ino))
  ) {
    throw new FigmaAssetError('素材文件在复制过程中发生变化，请重新运行 collect。', 'source_changed_during_copy')
  }
}
