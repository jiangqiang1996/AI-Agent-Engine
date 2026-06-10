import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { detectToolchain, ECOSYSTEM_PROFILES } from '../../src/services/graph/toolchain-profile.js'
import type { ToolchainInfo, ToolchainProfile } from '../../src/services/graph/toolchain-profile.js'

/** 测试用临时目录 */
const TEST_DIR = join(tmpdir(), 'ae-toolchain-profile-test')

describe('ToolchainInfo 结构校验', () => {
  it('available 为 false 时 version 可选', () => {
    const info: ToolchainInfo = {
      available: false,
      command: 'mvn',
    }
    expect(info.available).toBe(false)
    expect(info.version).toBeUndefined()
    expect(info.manifestFile).toBeUndefined()
  })

  it('available 为 true 时应携带 version 和 manifestFile', () => {
    const info: ToolchainInfo = {
      available: true,
      version: '9.6.3',
      command: 'mvn',
      manifestFile: 'pom.xml',
    }
    expect(info.available).toBe(true)
    expect(info.version).toBe('9.6.3')
    expect(info.manifestFile).toBe('pom.xml')
  })
})

describe('ECOSYSTEM_PROFILES 配置校验', () => {
  it('应包含 6 个生态系统', () => {
    expect(ECOSYSTEM_PROFILES).toHaveLength(6)
  })

  it('每个配置应有 ecosystem、command 和 versionArg', () => {
    for (const ep of ECOSYSTEM_PROFILES) {
      expect(ep.ecosystem).toBeTruthy()
      expect(ep.command).toBeTruthy()
      expect(ep.versionArg).toBeTruthy()
    }
  })

  it('每个生态系统应有 manifestFile 或 manifestFiles', () => {
    for (const ep of ECOSYSTEM_PROFILES) {
      const hasManifest = ep.manifestFile !== undefined || (ep.manifestFiles !== undefined && ep.manifestFiles.length > 0)
      expect(hasManifest).toBe(true)
    }
  })
})

describe('detectToolchain', () => {
  beforeAll(() => {
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it('在空目录应返回全 unavailable', async () => {
    const emptyDir = join(TEST_DIR, 'empty')
    mkdirSync(emptyDir, { recursive: true })

    const profile = await detectToolchain(emptyDir)
    for (const [ecosystem, info] of profile) {
      // 空目录无特征文件，即使命令可用也不标记为 available
      expect(info.available).toBe(false)
    }
  })

  it('在含 package.json 的目录应正确标记 npm', async () => {
    const npmDir = join(TEST_DIR, 'npm-project')
    mkdirSync(npmDir, { recursive: true })
    writeFileSync(join(npmDir, 'package.json'), '{}')

    const profile = await detectToolchain(npmDir)
    const npmInfo = profile.get('npm')
    expect(npmInfo).toBeDefined()
    expect(npmInfo!.manifestFile).toBe('package.json')
    // npm 命令可用性取决于运行环境，只校验结构
    if (npmInfo!.available) {
      expect(npmInfo!.version).toBeTruthy()
    }
  })

  it('在含 pom.xml 的目录应正确标记 maven', async () => {
    const mavenDir = join(TEST_DIR, 'maven-project')
    mkdirSync(mavenDir, { recursive: true })
    writeFileSync(join(mavenDir, 'pom.xml'), '<project></project>')

    const profile = await detectToolchain(mavenDir)
    const mavenInfo = profile.get('maven')
    expect(mavenInfo).toBeDefined()
    expect(mavenInfo!.manifestFile).toBe('pom.xml')
  })

  it('在含 pyproject.toml 的目录应正确标记 pip', async () => {
    const pipDir = join(TEST_DIR, 'pip-project')
    mkdirSync(pipDir, { recursive: true })
    writeFileSync(join(pipDir, 'pyproject.toml'), '[project]')

    const profile = await detectToolchain(pipDir)
    const pipInfo = profile.get('pip')
    expect(pipInfo).toBeDefined()
    expect(pipInfo!.manifestFile).toBe('pyproject.toml')
  })

  it('在含 build.gradle.kts 的目录应正确标记 gradle', async () => {
    const gradleDir = join(TEST_DIR, 'gradle-project')
    mkdirSync(gradleDir, { recursive: true })
    writeFileSync(join(gradleDir, 'build.gradle.kts'), 'plugins {}')

    const profile = await detectToolchain(gradleDir)
    const gradleInfo = profile.get('gradle')
    expect(gradleInfo).toBeDefined()
    expect(gradleInfo!.manifestFile).toBe('build.gradle.kts')
  })

  it('返回的 profile 应包含所有 6 个生态系统', async () => {
    const profile = await detectToolchain(TEST_DIR)
    expect(profile.size).toBe(6)
    const expectedEcosystems = ['maven', 'npm', 'gomod', 'pip', 'cargo', 'gradle']
    for (const eco of expectedEcosystems) {
      expect(profile.has(eco)).toBe(true)
    }
  })

  it('ToolchainProfile 是 Map 类型', async () => {
    const profile = await detectToolchain(TEST_DIR)
    expect(profile).toBeInstanceOf(Map)
  })
})
