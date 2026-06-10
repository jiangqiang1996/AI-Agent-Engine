import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { parseMavenTreeOutput, parsePomXml, mavenResolver } from '../../src/services/graph/maven-resolver.js'

const TMP_BASE = join(tmpdir(), 'ae-maven-resolver-test')

describe('parseMavenTreeOutput', () => {
  it('应解析标准 Maven 树形输出', () => {
    const output = [
      '[INFO] com.example:my-app:jar:1.0:compile',
      '[INFO] +- com.example:lib-a:jar:1.0:compile',
      '[INFO] |  +- com.example:lib-b:jar:2.0:runtime',
      '[INFO] |  \\- com.example:lib-c:jar:3.0:test',
      '[INFO] +- com.example:lib-d:jar:4.0:compile',
    ].join('\n')

    const root = parseMavenTreeOutput(output, 'com.example:my-app')
    expect(root.name).toBe('com.example:my-app')
    expect(root.children).toHaveLength(2)
    expect(root.children[0].name).toBe('com.example:lib-a')
    expect(root.children[0].version).toBe('1.0')
    expect(root.children[0].scope).toBe('compile')
    expect(root.children[0].children).toHaveLength(2)
    expect(root.children[0].children[0].name).toBe('com.example:lib-b')
    expect(root.children[0].children[0].scope).toBe('runtime')
    expect(root.children[0].children[1].name).toBe('com.example:lib-c')
    expect(root.children[0].children[1].scope).toBe('test')
    expect(root.children[1].name).toBe('com.example:lib-d')
  })

  it('应跳过 omitted for conflict 行', () => {
    const output = [
      '[INFO] com.example:my-app:jar:1.0:compile',
      '[INFO] +- com.example:lib-a:jar:1.0:compile',
      '[INFO] |  +- com.example:lib-b:jar:2.0:compile',
      '[INFO] |  +- com.example:lib-b:jar:1.5:compile (omitted for conflict with 2.0)',
    ].join('\n')

    const root = parseMavenTreeOutput(output, 'com.example:my-app')
    expect(root.children[0].children).toHaveLength(1)
    expect(root.children[0].children[0].version).toBe('2.0')
  })

  it('应跳过 omitted for duplicate 行', () => {
    const output = [
      '[INFO] com.example:my-app:jar:1.0:compile',
      '[INFO] +- com.example:lib-a:jar:1.0:compile',
      '[INFO] +- com.example:lib-a:jar:1.0:compile (omitted for duplicate)',
    ].join('\n')

    const root = parseMavenTreeOutput(output, 'com.example:my-app')
    expect(root.children).toHaveLength(1)
  })

  it('应处理空输出', () => {
    const root = parseMavenTreeOutput('', 'my-app')
    expect(root.name).toBe('my-app')
    expect(root.children).toEqual([])
  })

  it('应处理无 [INFO] 前缀的行', () => {
    const output = 'some random text\nanother line'
    const root = parseMavenTreeOutput(output, 'my-app')
    expect(root.children).toEqual([])
  })
})

describe('parsePomXml', () => {
  it('应解析 pom.xml 中的 dependencies 段', () => {
    const content = `<project>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>lib-a</artifactId>
      <version>1.0</version>
      <scope>compile</scope>
    </dependency>
    <dependency>
      <groupId>org.springframework</groupId>
      <artifactId>spring-core</artifactId>
      <version>5.3.20</version>
    </dependency>
  </dependencies>
</project>`

    const deps = parsePomXml(content)
    expect(deps).toHaveLength(2)
    expect(deps[0].name).toBe('com.example:lib-a')
    expect(deps[0].version).toBe('1.0')
    expect(deps[0].scope).toBe('compile')
    expect(deps[1].name).toBe('org.springframework:spring-core')
    expect(deps[1].version).toBe('5.3.20')
    expect(deps[1].scope).toBe('compile')
  })

  it('缺失 scope 时默认为 compile', () => {
    const content = `<project>
  <dependencies>
    <dependency>
      <groupId>com.example</groupId>
      <artifactId>lib-a</artifactId>
      <version>1.0</version>
    </dependency>
  </dependencies>
</project>`

    const deps = parsePomXml(content)
    expect(deps[0].scope).toBe('compile')
  })

  it('应处理无 dependencies 的 pom.xml', () => {
    const content = '<project></project>'
    const deps = parsePomXml(content)
    expect(deps).toEqual([])
  })

  it('应跳过缺少 groupId 或 artifactId 的 dependency', () => {
    const content = `<project>
  <dependencies>
    <dependency>
      <artifactId>lib-a</artifactId>
      <version>1.0</version>
    </dependency>
  </dependencies>
</project>`

    const deps = parsePomXml(content)
    expect(deps).toEqual([])
  })

  it('应解析 test scope 依赖', () => {
    const content = `<project>
  <dependencies>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`

    const deps = parsePomXml(content)
    expect(deps[0].scope).toBe('test')
  })
})

describe('mavenResolver', () => {
  it('ecosystem 应为 maven', () => {
    expect(mavenResolver.ecosystem).toBe('maven')
  })

  it('detect 在有 pom.xml 时返回 true', () => {
    const tmpDir = join(TMP_BASE, 'detect-yes')
    try {
      mkdirSync(tmpDir, { recursive: true })
      writeFileSync(join(tmpDir, 'pom.xml'), '<project></project>')
      expect(mavenResolver.detect(tmpDir)).toBe(true)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('detect 在无 pom.xml 时返回 false', () => {
    const tmpDir = join(TMP_BASE, 'detect-no')
    try {
      mkdirSync(tmpDir, { recursive: true })
      expect(mavenResolver.detect(tmpDir)).toBe(false)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
