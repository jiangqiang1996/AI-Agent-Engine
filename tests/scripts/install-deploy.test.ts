import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { deployBuild, installNativeDeps } from '../../scripts/install.js'

const tempRoots: string[] = []

function createTempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-install-deploy-'))
  tempRoots.push(root)
  return root
}

function write(filePath: string, content = 'x'): void {
  mkdirSync(join(filePath, '..'), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

/** 构造一个已完成构建的假仓库目录，只包含 deployBuild 需要的产物 */
function createFakeRepo(root: string, bundleContent = 'export default { v: 2 }'): string {
  const repoDir = join(root, 'repo')
  const plugins = join(repoDir, '.opencode', 'plugins')
  write(join(plugins, 'ae-server.js'), bundleContent)
  write(join(plugins, 'ai-agent-engine', 'skills', 'ae-prd', 'SKILL.md'), 'v2-skill')
  write(join(plugins, 'ai-agent-engine', 'rules', 'base.md'), 'v2-rule')
  return repoDir
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('deployBuild 构建产物部署', () => {
  it('应该把 bundle 与 assets 部署到目标 plugins 目录', async () => {
    const root = createTempRoot()
    const repoDir = createFakeRepo(root)
    const targetDir = join(root, 'target')

    await deployBuild(repoDir, targetDir)

    const targetPlugins = join(targetDir, 'plugins')
    expect(readFileSync(join(targetPlugins, 'ae-server.js'), 'utf8')).toBe('export default { v: 2 }')
    expect(readFileSync(join(targetPlugins, 'ai-agent-engine', 'skills', 'ae-prd', 'SKILL.md'), 'utf8')).toBe('v2-skill')
  })

  it('应该剪枝目标端陈旧资产，避免已删除的技能继续被注册', async () => {
    const root = createTempRoot()
    const repoDir = createFakeRepo(root)
    const targetDir = join(root, 'target')
    const targetAssets = join(targetDir, 'plugins', 'ai-agent-engine')

    // 模拟上一次安装留下的陈旧资产：源端已不存在的技能和规则
    write(join(targetAssets, 'skills', 'ae-removed', 'SKILL.md'), 'stale-skill')
    write(join(targetAssets, 'rules', 'removed.md'), 'stale-rule')
    write(join(targetAssets, 'skills', 'ae-prd', 'SKILL.md'), 'v1-skill')

    await deployBuild(repoDir, targetDir)

    expect(existsSync(join(targetAssets, 'skills', 'ae-removed'))).toBe(false)
    expect(existsSync(join(targetAssets, 'rules', 'removed.md'))).toBe(false)
    expect(readFileSync(join(targetAssets, 'skills', 'ae-prd', 'SKILL.md'), 'utf8')).toBe('v2-skill')
    expect(readFileSync(join(targetAssets, 'rules', 'base.md'), 'utf8')).toBe('v2-rule')
  })

  it('应该保留目标端 node_modules 与 package.json，且不被源端同名内容覆盖', async () => {
    const root = createTempRoot()
    const repoDir = createFakeRepo(root)
    const targetDir = join(root, 'target')
    const targetAssets = join(targetDir, 'plugins', 'ai-agent-engine')

    // 目标端已由 installNativeDeps 安装过原生依赖，且 DLL 可能被运行中的进程映射
    write(join(targetAssets, 'node_modules', '@napi-rs', 'canvas', 'skia.node'), 'locked-binary')
    write(join(targetAssets, 'package.json'), '{"dependencies":{"@napi-rs/canvas":"^1.0.2"}}')
    write(join(targetAssets, 'package-lock.json'), '{"lockfileVersion":3}')
    // 源端（开发仓库）也带有自己的 node_modules，不得覆盖目标端
    write(join(repoDir, '.opencode', 'plugins', 'ai-agent-engine', 'node_modules', 'skia.node'), 'source-binary')

    await deployBuild(repoDir, targetDir)

    expect(readFileSync(join(targetAssets, 'node_modules', '@napi-rs', 'canvas', 'skia.node'), 'utf8')).toBe('locked-binary')
    expect(readFileSync(join(targetAssets, 'package.json'), 'utf8')).toContain('@napi-rs/canvas')
    expect(existsSync(join(targetAssets, 'package-lock.json'))).toBe(true)
    expect(existsSync(join(targetAssets, 'node_modules', 'skia.node'))).toBe(false)
    expect(readFileSync(join(targetAssets, 'skills', 'ae-prd', 'SKILL.md'), 'utf8')).toBe('v2-skill')
  })

  it('应该在构建产物缺失时报错而不是部署残缺产物', async () => {
    const root = createTempRoot()
    const repoDir = join(root, 'repo')
    mkdirSync(join(repoDir, '.opencode', 'plugins'), { recursive: true })

    await expect(deployBuild(repoDir, join(root, 'target'))).rejects.toThrow('构建产物不存在')
  })
})

describe('installNativeDeps 原生依赖安装', () => {
  it('应该在 @napi-rs/canvas 已存在时跳过安装，避免触碰被映射的 DLL', async () => {
    const root = createTempRoot()
    const assetsDir = join(root, 'plugins', 'ai-agent-engine')
    write(join(assetsDir, 'node_modules', '@napi-rs', 'canvas', 'package.json'), '{"name":"@napi-rs/canvas"}')
    const marker = join(assetsDir, 'node_modules', '@napi-rs', 'canvas', 'skia.node')
    write(marker, 'locked-binary')

    // 若未跳过，会执行 npm install 并可能重写 node_modules；这里断言原生模块原封不动
    await installNativeDeps(root)

    expect(readFileSync(marker, 'utf8')).toBe('locked-binary')
    expect(existsSync(join(assetsDir, 'package.json'))).toBe(false)
  })
})
