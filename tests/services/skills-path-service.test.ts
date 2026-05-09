import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { orderSkillPaths } from '../../src/services/skills-path-service.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-skills-path-'))
  tempRoots.push(root)
  return root
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('skills-path-service', () => {
  it('应该让项目级直接注册 skill 路径优先于全局直接注册路径和动态注册路径', () => {
    const worktree = createTempRoot()
    const home = createTempRoot()
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    const globalDirect = join(home, '.config', 'opencode', 'skills')
    const projectDirect = join(worktree, '.opencode', 'skills')
    const globalDynamic = join(home, '.config', 'opencode', 'ai-agent-engine', 'dist', 'src', 'assets', 'skills')
    const projectDynamic = join(worktree, '.opencode', 'plugins', 'ai-agent-engine', 'dist', 'src', 'assets', 'skills')
    mkdirSync(globalDirect, { recursive: true })
    mkdirSync(projectDirect, { recursive: true })

    const paths = orderSkillPaths([projectDirect, globalDynamic, globalDirect], projectDynamic, worktree)

    expect(paths).toEqual([globalDynamic, projectDynamic, globalDirect, projectDirect])
  })

  it('应该保留未知 skill 路径且避免重复注册', () => {
    const worktree = createTempRoot()
    const home = createTempRoot()
    vi.stubEnv('HOME', home)
    vi.stubEnv('USERPROFILE', home)
    const unknown = join(createTempRoot(), 'skills')
    const projectDynamic = join(worktree, '.opencode', 'plugins', 'ai-agent-engine', 'dist', 'src', 'assets', 'skills')

    const paths = orderSkillPaths([unknown, projectDynamic], projectDynamic, worktree)

    expect(paths).toEqual([unknown, projectDynamic])
  })
})
