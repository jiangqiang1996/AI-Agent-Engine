import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseNpmLsJson, parsePackageJson, npmResolver } from '../../src/services/graph/npm-resolver.js'

const TMP_BASE = join(tmpdir(), 'ae-npm-resolver-test')

describe('parseNpmLsJson', () => {
  it('应解析标准 npm ls JSON 输出', () => {
    const json = JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      dependencies: {
        lodash: { version: '4.17.21', dependencies: {} },
        express: {
          version: '4.18.2',
          dependencies: {
            accepts: { version: '1.3.8', dependencies: {} },
          },
        },
      },
    })

    const root = parseNpmLsJson(json)
    expect(root.name).toBe('my-project')
    expect(root.version).toBe('1.0.0')
    expect(root.children).toHaveLength(2)
    expect(root.children[0].name).toBe('lodash')
    expect(root.children[0].version).toBe('4.17.21')
    expect(root.children[1].name).toBe('express')
    expect(root.children[1].children).toHaveLength(1)
    expect(root.children[1].children[0].name).toBe('accepts')
  })

  it('应处理空依赖', () => {
    const json = JSON.stringify({
      name: 'empty-project',
      version: '1.0.0',
      dependencies: {},
    })

    const root = parseNpmLsJson(json)
    expect(root.name).toBe('empty-project')
    expect(root.children).toEqual([])
  })

  it('应处理无效 JSON', () => {
    const root = parseNpmLsJson('not json')
    expect(root.name).toBe('npm-project')
    expect(root.children).toEqual([])
  })

  it('应处理缺失 name 字段', () => {
    const json = JSON.stringify({
      version: '1.0.0',
      dependencies: {
        lodash: { version: '4.17.21', dependencies: {} },
      },
    })

    const root = parseNpmLsJson(json)
    expect(root.name).toBe('npm-project')
    expect(root.children).toHaveLength(1)
  })

  it('应处理深层嵌套依赖', () => {
    const json = JSON.stringify({
      name: 'deep-project',
      version: '1.0.0',
      dependencies: {
        a: {
          version: '1.0.0',
          dependencies: {
            b: {
              version: '2.0.0',
              dependencies: {
                c: { version: '3.0.0', dependencies: {} },
              },
            },
          },
        },
      },
    })

    const root = parseNpmLsJson(json)
    expect(root.children[0].children[0].children[0].name).toBe('c')
    expect(root.children[0].children[0].children[0].version).toBe('3.0.0')
  })
})

describe('parsePackageJson', () => {
  it('应解析 dependencies 和 devDependencies', () => {
    const content = JSON.stringify({
      name: 'my-project',
      dependencies: {
        express: '4.18.2',
        lodash: '4.17.21',
      },
      devDependencies: {
        vitest: '1.0.0',
      },
    })

    const deps = parsePackageJson(content)
    expect(deps).toHaveLength(3)
    expect(deps[0].name).toBe('express')
    expect(deps[0].scope).toBe('dependencies')
    expect(deps[2].name).toBe('vitest')
    expect(deps[2].scope).toBe('dev')
  })

  it('devDependencies 的 scope 应为 dev', () => {
    const content = JSON.stringify({
      devDependencies: {
        typescript: '5.0.0',
      },
    })

    const deps = parsePackageJson(content)
    expect(deps[0].scope).toBe('dev')
  })

  it('应去除版本号前缀 ^ 和 ~', () => {
    const content = JSON.stringify({
      dependencies: {
        express: '^4.18.2',
        lodash: '~4.17.21',
      },
    })

    const deps = parsePackageJson(content)
    expect(deps[0].version).toBe('4.18.2')
    expect(deps[1].version).toBe('4.17.21')
  })

  it('应处理无依赖的 package.json', () => {
    const content = JSON.stringify({ name: 'empty' })
    const deps = parsePackageJson(content)
    expect(deps).toEqual([])
  })

  it('应处理无效 JSON', () => {
    const deps = parsePackageJson('not json')
    expect(deps).toEqual([])
  })

  it('保留不含前缀的版本号', () => {
    const content = JSON.stringify({
      dependencies: {
        react: '18.2.0',
      },
    })

    const deps = parsePackageJson(content)
    expect(deps[0].version).toBe('18.2.0')
  })
})

describe('npmResolver', () => {
  it('ecosystem 应为 npm', () => {
    expect(npmResolver.ecosystem).toBe('npm')
  })

  it('detect 在有 package.json 时返回 true', () => {
    const tmpDir = join(TMP_BASE, 'detect-yes')
    try {
      mkdirSync(tmpDir, { recursive: true })
      writeFileSync(join(tmpDir, 'package.json'), '{}')
      expect(npmResolver.detect(tmpDir)).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('detect 在无 package.json 时返回 false', () => {
    const tmpDir = join(TMP_BASE, 'detect-no')
    try {
      mkdirSync(tmpDir, { recursive: true })
      expect(npmResolver.detect(tmpDir)).toBe(false)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
