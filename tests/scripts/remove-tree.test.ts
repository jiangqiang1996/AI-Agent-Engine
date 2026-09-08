import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { removeTreeTolerant } from '../../scripts/remove-tree.mjs'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

const rmMock = vi.mocked(fsPromises.rm)
const actualRm = rmMock.getMockImplementation() as (path: unknown, options: unknown) => Promise<void>

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-remove-tree-'))
  tempRoots.push(root)
  return root
}

function write(filePath: string, content = 'x'): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

afterEach(() => {
  rmMock.mockImplementation(actualRm)
  rmMock.mockClear()
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('removeTreeTolerant 容错删除目录树', () => {
  it('应该彻底删除目录树并返回空列表', async () => {
    const root = createTempRoot()
    const target = join(root, 'assets')

    write(join(target, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(target, 'skills', 'a', 'references', 'r.md'), 'r')
    write(join(target, 'node_modules', '@napi-rs', 'canvas', 'skia.node'), 'binary')
    write(join(target, 'package.json'), '{}')

    const failed = await removeTreeTolerant(target)

    expect(failed).toEqual([])
    expect(existsSync(target)).toBe(false)
  })

  it('应该在文件被占用时保留该文件与其祖先目录，只返回失败项而不抛出', async () => {
    const root = createTempRoot()
    const target = join(root, 'assets')

    write(join(target, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(target, 'node_modules', '@napi-rs', 'canvas', 'skia.node'), 'locked-binary')

    // 真实 Windows 下 DLL 被映射时既无法 unlink，其所在目录也无法 rmdir，
    // mock 需同时锁住文件与其全部祖先目录，否则递归删目录会把锁文件一并物理删除
    const lockedFragments = ['skia.node', 'canvas', '@napi-rs', 'node_modules', 'assets']
    rmMock.mockImplementation(async (path, options) => {
      const p = String(path)
      if (lockedFragments.some((fragment) => p.endsWith(fragment))) {
        throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' })
      }
      return actualRm(path, options)
    })

    const failed = await removeTreeTolerant(target)

    expect(failed.some((item) => item.includes('skia.node') && item.includes('EBUSY'))).toBe(true)
    // 1 个锁文件 + 3 个祖先目录（canvas/@napi-rs/node_modules）+ targetPath(assets)
    expect(failed).toHaveLength(lockedFragments.length)
    // 未被占用的资产已正常删除
    expect(existsSync(join(target, 'skills'))).toBe(false)
    // 被占用的原生模块及其祖先目录仍保留
    expect(existsSync(join(target, 'node_modules', '@napi-rs', 'canvas', 'skia.node'))).toBe(true)
    expect(existsSync(target)).toBe(true)
  })

  it('应该按先文件后目录、先子目录后父目录的顺序删除', async () => {
    const root = createTempRoot()
    const target = join(root, 'assets')

    write(join(target, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(target, 'top.md'), 't')

    const calls: string[] = []
    rmMock.mockImplementation(async (path, options) => {
      calls.push(String(path))
      return actualRm(path, options)
    })

    await removeTreeTolerant(target)

    const skillFile = calls.findIndex((c) => c.endsWith('SKILL.md'))
    const skillsDir = calls.findIndex((c) => c.endsWith('skills'))
    const assetsDir = calls.findIndex((c) => c.endsWith('assets'))

    expect(skillFile).toBeGreaterThanOrEqual(0)
    expect(skillsDir).toBeGreaterThan(skillFile)
    expect(assetsDir).toBeGreaterThan(skillsDir)
    expect(existsSync(target)).toBe(false)
  })
})
