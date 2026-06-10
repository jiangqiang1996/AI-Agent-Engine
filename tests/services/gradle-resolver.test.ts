import { describe, it, expect } from 'vitest'

import {
  parseGradleDependenciesOutput,
  parseBuildGradle,
  gradleResolver,
} from '../../src/services/graph/gradle-resolver.js'

describe('gradle-resolver', () => {
  describe('parseGradleDependenciesOutput', () => {
    it('应该解析 gradle dependencies 输出', () => {
      const output = [
        'com.example:app:1.0',
        '+--- com.google:guava:32.0',
        '|    \\--- com.google:failureaccess:1.0',
        '\\--- org.slf4j:slf4j-api:2.0',
      ].join('\n')
      const root = parseGradleDependenciesOutput(output)
      expect(root.name).toBe('gradle-project')
      expect(root.children).toHaveLength(1)
      expect(root.children[0]!.name).toBe('com.example:app')
      expect(root.children[0]!.children).toHaveLength(2)
      expect(root.children[0]!.children[0]!.name).toBe('com.google:guava')
      expect(root.children[0]!.children[0]!.children).toHaveLength(1)
      expect(root.children[0]!.children[1]!.name).toBe('org.slf4j:slf4j-api')
    })

    it('空输出应返回默认根节点', () => {
      const root = parseGradleDependenciesOutput('')
      expect(root.name).toBe('gradle-project')
    })
  })

  describe('parseBuildGradle', () => {
    it('应该解析 Groovy 格式依赖', () => {
      const content = [
        'dependencies {',
        "    implementation 'com.google:guava:32.0'",
        "    testImplementation 'junit:junit:4.13'",
        '}',
      ].join('\n')
      const deps = parseBuildGradle(content)
      expect(deps).toHaveLength(2)
      expect(deps[0]!.name).toBe('com.google:guava')
      expect(deps[0]!.version).toBe('32.0')
      expect(deps[1]!.name).toBe('junit:junit')
    })

    it('应该解析 Kotlin DSL 格式依赖', () => {
      const content = [
        'dependencies {',
        '    implementation("com.google:guava:32.0")',
        '    api("org.slf4j:slf4j-api:2.0")',
        '}',
      ].join('\n')
      const deps = parseBuildGradle(content)
      expect(deps).toHaveLength(2)
      expect(deps[0]!.name).toBe('com.google:guava')
      expect(deps[1]!.name).toBe('org.slf4j:slf4j-api')
    })

    it('无依赖应返回空数组', () => {
      expect(parseBuildGradle('dependencies {}')).toHaveLength(0)
    })
  })

  describe('gradleResolver', () => {
    it('ecosystem 应为 gradle', () => {
      expect(gradleResolver.ecosystem).toBe('gradle')
    })
  })
})
