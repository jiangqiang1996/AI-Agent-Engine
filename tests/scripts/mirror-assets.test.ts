import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { mirrorAssets } from '../../scripts/mirror-assets.mjs'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

const rmMock = vi.mocked(fsPromises.rm)
const actualRm = rmMock.getMockImplementation() as (path: unknown, options: unknown) => Promise<void>

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-mirror-assets-'))
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

describe('mirrorAssets 资产镜像同步', () => {
  it('应该复制新增与变更文件，并剪枝源端已删除的陈旧文件', async () => {
    const root = createTempRoot()
    const source = join(root, 'source')
    const target = join(root, 'target')

    write(join(source, 'skills', 'a', 'SKILL.md'), 'new-a')
    write(join(source, 'skills', 'b', 'SKILL.md'), 'new-b')
    write(join(target, 'skills', 'b', 'SKILL.md'), 'old-b')
    write(join(target, 'skills', 'removed', 'SKILL.md'), 'stale')
    write(join(target, 'stale-root.md'), 'stale')

    const failed = await mirrorAssets(source, target)

    expect(failed).toEqual([])
    expect(readFileSync(join(target, 'skills', 'a', 'SKILL.md'), 'utf8')).toBe('new-a')
    expect(readFileSync(join(target, 'skills', 'b', 'SKILL.md'), 'utf8')).toBe('new-b')
    expect(existsSync(join(target, 'skills', 'removed'))).toBe(false)
    expect(existsSync(join(target, 'stale-root.md'))).toBe(false)
  })

  it('应该保留目标端排除项，既不剪枝也不被源端同名内容覆盖', async () => {
    const root = createTempRoot()
    const source = join(root, 'source')
    const target = join(root, 'target')

    write(join(source, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(source, 'node_modules', 'skia.node'), 'source-binary')
    write(join(target, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(target, 'node_modules', '@napi-rs', 'canvas', 'skia.node'), 'locked-binary')
    write(join(target, 'package.json'), '{"type":"module"}')

    const failed = await mirrorAssets(source, target, ['node_modules', 'package.json', 'package-lock.json'])

    expect(failed).toEqual([])
    expect(existsSync(join(target, 'node_modules', '@napi-rs', 'canvas', 'skia.node'))).toBe(true)
    expect(readFileSync(join(target, 'package.json'), 'utf8')).toBe('{"type":"module"}')
    expect(existsSync(join(target, 'node_modules', 'skia.node'))).toBe(false)
  })

  it('应该在目标目录不存在时创建目录并完成首次复制', async () => {
    const root = createTempRoot()
    const source = join(root, 'source')
    const target = join(root, 'target', 'nested')

    write(join(source, 'rules', 'base.md'), 'rule')

    const failed = await mirrorAssets(source, target)

    expect(failed).toEqual([])
    expect(readFileSync(join(target, 'rules', 'base.md'), 'utf8')).toBe('rule')
  })

  it('应该在文件被占用无法删除时降级为返回值警告而不是抛出异常', async () => {
    const root = createTempRoot()
    const source = join(root, 'source')
    const target = join(root, 'target')

    write(join(source, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(target, 'skills', 'a', 'SKILL.md'), 'a')
    write(join(target, 'skills', 'locked', 'SKILL.md'), 'locked')

    rmMock.mockImplementation(async (path, options) => {
      if (String(path).includes('locked')) {
        throw Object.assign(new Error('resource busy or locked'), { code: 'EBUSY' })
      }
      return actualRm(path, options)
    })

    const failed = await mirrorAssets(source, target)

    // 陈旧文件删除失败后，其父目录因非空同样删不掉，两者都会被报告
    expect(failed).toHaveLength(2)
    expect(failed[0]).toContain('skills/locked/SKILL.md')
    expect(failed[0]).toContain('EBUSY')
    expect(failed[1]).toContain('skills/locked')
    expect(readFileSync(join(target, 'skills', 'a', 'SKILL.md'), 'utf8')).toBe('a')
    expect(existsSync(join(target, 'skills', 'locked', 'SKILL.md'))).toBe(true)
  })
})
