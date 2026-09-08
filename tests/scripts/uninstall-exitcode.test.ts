import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { uninstall } from '../../scripts/uninstall.js'
import { removeTreeTolerant } from '../../scripts/remove-tree.mjs'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

vi.mock('../../scripts/remove-tree.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../scripts/remove-tree.mjs')>()
  return { ...actual, removeTreeTolerant: vi.fn(actual.removeTreeTolerant) }
})

const rmMock = vi.mocked(fsPromises.rm)
const actualRm = rmMock.getMockImplementation() as (path: unknown, options: unknown) => Promise<void>
const removeTreeMock = vi.mocked(removeTreeTolerant)

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-uninstall-exitcode-'))
  tempRoots.push(root)
  return root
}

function write(filePath: string, content = 'x'): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

const alwaysYes = async () => true

afterEach(() => {
  rmMock.mockImplementation(actualRm)
  rmMock.mockClear()
  removeTreeMock.mockReset()
  removeTreeMock.mockImplementation((path) => actualRm(path, { recursive: true, force: true }).then(() => []))
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('uninstall 退出码语义', () => {
  it('应该彻底删除成功时返回 0', async () => {
    const root = createTempRoot()
    const plugins = join(root, 'plugins')
    write(join(plugins, 'ae-server.js'), 'export default {}')
    write(join(plugins, 'ai-agent-engine', 'skills', 'ae-prd', 'SKILL.md'), 'a')
    write(join(plugins, 'other-plugin.js'), 'keep')

    const code = await uninstall(root, null, alwaysYes, false)

    expect(code).toBe(0)
    expect(existsSync(join(plugins, 'ae-server.js'))).toBe(false)
    expect(existsSync(join(plugins, 'ai-agent-engine'))).toBe(false)
    expect(existsSync(join(plugins, 'other-plugin.js'))).toBe(true)
  })

  it('应该在插件入口删除失败时返回 1（卸载未生效）', async () => {
    const root = createTempRoot()
    const plugins = join(root, 'plugins')
    write(join(plugins, 'ae-server.js'), 'export default {}')
    write(join(plugins, 'ai-agent-engine', 'skills', 'SKILL.md'), 'a')

    rmMock.mockImplementation(async (path, options) => {
      if (String(path).endsWith('ae-server.js')) {
        throw Object.assign(new Error('resource busy or locked'), { code: 'EPERM' })
      }
      return actualRm(path, options)
    })

    const code = await uninstall(root, null, alwaysYes, false)

    expect(code).toBe(1)
    expect(existsSync(join(plugins, 'ae-server.js'))).toBe(true)
  })

  it('应该在 assets 有占用残留时返回 2 并保留仓库目录以便重跑', async () => {
    const root = createTempRoot()
    const plugins = join(root, 'plugins')
    const repoDir = join(root, 'ai-agent-engine-src')
    write(join(plugins, 'ae-server.js'), 'export default {}')
    write(join(plugins, 'ai-agent-engine', 'node_modules', '@napi-rs', 'canvas', 'skia.node'), 'locked')
    write(join(repoDir, 'scripts', 'uninstall.js'), '// stub')

    removeTreeMock.mockImplementation(async (path) => {
      if (String(path).endsWith('ai-agent-engine')) {
        return [`${join(String(path), 'node_modules')} (EPERM)`]
      }
      return actualRm(path, { recursive: true, force: true }).then(() => [])
    })

    const code = await uninstall(root, null, alwaysYes, false)

    expect(code).toBe(2)
    expect(existsSync(join(plugins, 'ae-server.js'))).toBe(false)
    // 仓库目录含卸载脚本自身，assets 未清理干净时必须保留，否则恢复路径消失
    expect(existsSync(repoDir)).toBe(true)
    expect(existsSync(join(repoDir, 'scripts', 'uninstall.js'))).toBe(true)
  })

  it('应该在 --keep-repo 时不删除仓库目录', async () => {
    const root = createTempRoot()
    const plugins = join(root, 'plugins')
    const repoDir = join(root, 'ai-agent-engine-src')
    write(join(plugins, 'ae-server.js'), 'export default {}')
    write(join(plugins, 'ai-agent-engine', 'skills', 'SKILL.md'), 'a')
    write(join(repoDir, 'package.json'), '{}')

    const code = await uninstall(root, null, alwaysYes, true)

    expect(code).toBe(0)
    expect(existsSync(repoDir)).toBe(true)
    expect(existsSync(join(plugins, 'ae-server.js'))).toBe(false)
  })
})
