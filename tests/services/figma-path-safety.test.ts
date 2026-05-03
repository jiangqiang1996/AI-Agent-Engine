import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ensureFileWithinSizeLimit,
  ensureNoSymlink,
  ensureNoSymlinkInExistingAncestors,
  ensureSafeDirectoryPath,
  ensureSafeOutputRoot,
  ensureSafePathBeforeDelete,
  ensureSourceFileUnchanged,
  assertOpenSourceFileUnchanged,
  openStableSourceFile,
  resolveExistingWorkspacePath,
  resolveWorkspacePath,
  snapshotSourceFile,
} from '../../src/services/figma-path-safety.js'
import { FigmaAssetError } from '../../src/services/figma-result-formatter.js'

let workspace: string

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'ae-path-safety-'))
})

afterEach(async () => {
  const { rm } = await import('node:fs/promises')
  await rm(workspace, { recursive: true, force: true })
})

describe('figma-path-safety', () => {
  describe('resolveWorkspacePath', () => {
    it('应该解析工作区内的相对路径', async () => {
      const result = await resolveWorkspacePath(workspace, 'subdir')
      expect(result).toBe(join(workspace, 'subdir'))
    })

    it('应该解析绝对路径当在工作区内', async () => {
      const result = await resolveWorkspacePath(workspace, join(workspace, 'file.txt'))
      expect(result).toBe(join(workspace, 'file.txt'))
    })

    it('应该拒绝工作区外的路径', async () => {
      await expect(resolveWorkspacePath(workspace, '../outside')).rejects.toThrow(FigmaAssetError)
    })

    it('应该拒绝绝对路径当在工作区外', async () => {
      await expect(resolveWorkspacePath(workspace, '/tmp/outside')).rejects.toThrow(FigmaAssetError)
    })
  })

  describe('resolveExistingWorkspacePath', () => {
    it('应该解析存在的文件路径', async () => {
      const filePath = join(workspace, 'test.txt')
      await writeFile(filePath, 'hello')
      const result = await resolveExistingWorkspacePath(workspace, 'test.txt')
      expect(result).toBe(filePath)
    })

    it('应该拒绝符号链接路径', async ({ skip }) => {
      if (process.platform === 'win32') skip('Windows symlink requires admin')
      const target = join(workspace, 'real.txt')
      const link = join(workspace, 'link.txt')
      await writeFile(target, 'real')
      await symlink(target, link, 'file')
      await expect(resolveExistingWorkspacePath(workspace, 'link.txt')).rejects.toThrow(FigmaAssetError)
    })
  })

  describe('ensureSafeOutputRoot', () => {
    it('应该为已存在的目录通过', async () => {
      await mkdir(join(workspace, 'out'), { recursive: true })
      await expect(ensureSafeOutputRoot(workspace, join(workspace, 'out'))).resolves.toBeUndefined()
    })

    it('应该创建不存在的目录', async () => {
      const outDir = join(workspace, 'new-out')
      await ensureSafeOutputRoot(workspace, outDir)
      const stat = await import('node:fs/promises').then((m) => m.stat(outDir))
      expect(stat.isDirectory()).toBe(true)
    })

    it('应该拒绝工作区外的输出目录', async () => {
      await expect(ensureSafeOutputRoot(workspace, '/tmp/outside')).rejects.toThrow(FigmaAssetError)
    })

    it('应该拒绝非目录路径', async () => {
      const file = join(workspace, 'file.txt')
      await writeFile(file, 'not a dir')
      await expect(ensureSafeOutputRoot(workspace, file)).rejects.toThrow()
    })
  })

  describe('ensureNoSymlink', () => {
    it('应该允许普通文件', async () => {
      const file = join(workspace, 'regular.txt')
      await writeFile(file, 'ok')
      await expect(ensureNoSymlink(file)).resolves.toBeUndefined()
    })

    it('应该拒绝符号链接', async ({ skip }) => {
      if (process.platform === 'win32') skip('Windows symlink requires admin')
      const target = join(workspace, 'target')
      const link = join(workspace, 'link')
      await writeFile(target, 'ok')
      await symlink(target, link, 'file')
      await expect(ensureNoSymlink(link)).rejects.toThrow(FigmaAssetError)
    })
  })

  describe('ensureNoSymlinkInExistingAncestors', () => {
    it('应该允许无符号链接的路径', async () => {
      await mkdir(join(workspace, 'a', 'b'), { recursive: true })
      await expect(
        ensureNoSymlinkInExistingAncestors(workspace, join(workspace, 'a', 'b')),
      ).resolves.toBeUndefined()
    })

    it('应该拒绝祖先路径含符号链接', async ({ skip }) => {
      if (process.platform === 'win32') skip('Windows symlink requires admin')
      const realDir = join(workspace, 'real')
      await mkdir(realDir, { recursive: true })
      const linkDir = join(workspace, 'linked')
      await symlink(realDir, linkDir, 'junction')
      await expect(
        ensureNoSymlinkInExistingAncestors(workspace, join(linkDir, 'file.txt')),
      ).rejects.toThrow(FigmaAssetError)
    })
  })

  describe('ensureFileWithinSizeLimit', () => {
    it('应该允许正常大小的文件', async () => {
      const file = join(workspace, 'small.txt')
      await writeFile(file, 'x')
      await expect(ensureFileWithinSizeLimit(file, 1024)).resolves.toBeUndefined()
    })

    it('应该拒绝超限文件', async () => {
      const file = join(workspace, 'large.txt')
      await writeFile(file, 'x'.repeat(100))
      await expect(ensureFileWithinSizeLimit(file, 50)).rejects.toThrow(FigmaAssetError)
    })

    it('应该拒绝非文件路径', async () => {
      const dir = join(workspace, 'dir')
      await mkdir(dir, { recursive: true })
      await expect(ensureFileWithinSizeLimit(dir, 1024)).rejects.toThrow(FigmaAssetError)
    })
  })

  describe('source file snapshot', () => {
    it('应该允许复制前后未变化的来源文件', async () => {
      const file = join(workspace, 'icon.png')
      await writeFile(file, 'image')
      const snapshot = await snapshotSourceFile(file)

      await expect(ensureSourceFileUnchanged(file, snapshot)).resolves.toBeUndefined()
    })

    it('应该拒绝复制过程中内容被替换的来源文件', async () => {
      const file = join(workspace, 'icon.png')
      await writeFile(file, 'image')
      const snapshot = await snapshotSourceFile(file)
      await writeFile(file, 'changed')

      await expect(ensureSourceFileUnchanged(file, snapshot)).rejects.toThrow(FigmaAssetError)
    })

    it('应该基于已打开文件句柄校验来源文件未变化', async () => {
      const file = join(workspace, 'icon.png')
      await writeFile(file, 'image')
      const source = await openStableSourceFile(file)
      try {
        await expect(assertOpenSourceFileUnchanged(file, source)).resolves.toBeUndefined()
      } finally {
        await source.handle.close()
      }
    })
  })

  describe('ensureSafePathBeforeDelete', () => {
    it('应该允许删除工作区内存在的路径', async () => {
      const dir = join(workspace, 'to-delete')
      await mkdir(dir, { recursive: true })
      await expect(ensureSafePathBeforeDelete(workspace, dir)).resolves.toBeUndefined()
    })

    it('应该拒绝删除工作区外路径', async () => {
      await expect(ensureSafePathBeforeDelete(workspace, '/tmp/outside')).rejects.toThrow(FigmaAssetError)
    })

    it('应该容忍不存在的路径当非安全问题', async () => {
      await expect(
        ensureSafePathBeforeDelete(workspace, join(workspace, 'nonexistent')),
      ).resolves.toBeUndefined()
    })
  })

  describe('ensureSafeDirectoryPath', () => {
    it('应该允许 baseRoot 内的目录', async () => {
      const base = join(workspace, 'out')
      const dir = join(base, 'assets')
      await mkdir(dir, { recursive: true })
      await expect(ensureSafeDirectoryPath(workspace, base, dir)).resolves.toBeUndefined()
    })

    it('应该拒绝 baseRoot 外的目录', async () => {
      const base = join(workspace, 'out')
      await mkdir(base, { recursive: true })
      await expect(
        ensureSafeDirectoryPath(workspace, base, join(workspace, 'outside')),
      ).rejects.toThrow(FigmaAssetError)
    })
  })
})
