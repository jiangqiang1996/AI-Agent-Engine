import { describe, it, expect } from 'vitest'

import {
  parsePipDepTreeJson,
  parseRequirementsTxt,
  parsePyprojectTomlDeps,
  parseSetupPy,
  pipResolver,
} from '../../src/services/graph/pip-resolver.js'

describe('pip-resolver', () => {
  describe('parsePipDepTreeJson', () => {
    it('应该解析 pipdeptree JSON 输出', () => {
      const json = JSON.stringify([
        {
          package: { key: 'flask', package_name: 'Flask', installed_version: '2.3.0' },
          dependencies: [
            { key: 'werkzeug', package_name: 'Werkzeug', installed_version: '2.3.0' },
            { key: 'jinja2', package_name: 'Jinja2', installed_version: '3.1.2' },
          ],
        },
        {
          package: { key: 'requests', package_name: 'requests', installed_version: '2.31.0' },
          dependencies: [
            { key: 'urllib3', package_name: 'urllib3', installed_version: '2.0.0' },
          ],
        },
      ])
      const root = parsePipDepTreeJson(json)
      expect(root.name).toBe('Flask')
      expect(root.version).toBe('2.3.0')
      expect(root.children).toHaveLength(3)
      expect(root.children[0]!.name).toBe('Werkzeug')
      expect(root.children[2]!.name).toBe('requests')
      expect(root.children[2]!.children).toHaveLength(1)
    })

    it('空 JSON 应返回默认根节点', () => {
      const root = parsePipDepTreeJson('[]')
      expect(root.name).toBe('pip-project')
      expect(root.children).toHaveLength(0)
    })

    it('无效 JSON 应返回默认根节点', () => {
      const root = parsePipDepTreeJson('not json')
      expect(root.name).toBe('pip-project')
    })
  })

  describe('parseRequirementsTxt', () => {
    it('应该解析 requirements.txt', () => {
      const content = [
        'flask==2.3.0',
        'requests>=2.28.0',
        'numpy',
        '# comment',
        '-r other.txt',
      ].join('\n')
      const deps = parseRequirementsTxt(content)
      expect(deps).toHaveLength(3)
      expect(deps[0]!.name).toBe('flask')
      expect(deps[0]!.version).toBe('2.3.0')
      expect(deps[1]!.name).toBe('requests')
      expect(deps[1]!.version).toBe('2.28.0')
      expect(deps[2]!.name).toBe('numpy')
      expect(deps[2]!.version).toBeUndefined()
    })

    it('空内容应返回空数组', () => {
      expect(parseRequirementsTxt('')).toHaveLength(0)
      expect(parseRequirementsTxt('# only comments')).toHaveLength(0)
    })
  })

  describe('parsePyprojectTomlDeps', () => {
    it('应该解析 [project.dependencies] 段', () => {
      const content = [
        '[project]',
        'name = "mylib"',
        '',
        '[project.dependencies]',
        '"flask>=2.0"',
        '"requests==2.31.0"',
        '',
        '[build-system]',
      ].join('\n')
      const deps = parsePyprojectTomlDeps(content)
      expect(deps).toHaveLength(2)
      expect(deps[0]!.name).toBe('flask')
      expect(deps[1]!.name).toBe('requests')
    })

    it('无 dependencies 段应返回空数组', () => {
      const content = '[project]\nname = "mylib"\n'
      expect(parsePyprojectTomlDeps(content)).toHaveLength(0)
    })
  })

  describe('parseSetupPy', () => {
    it('应该解析 install_requires', () => {
      const content = [
        'from setuptools import setup',
        '',
        'setup(',
        '    name="mylib",',
        '    install_requires=[',
        '        "flask>=2.0",',
        '        "requests==2.31.0",',
        '        "numpy",',
        '    ],',
        ')',
      ].join('\n')
      const deps = parseSetupPy(content)
      expect(deps).toHaveLength(3)
      expect(deps[0]!.name).toBe('flask')
      expect(deps[0]!.version).toBe('2.0')
      expect(deps[1]!.name).toBe('requests')
      expect(deps[1]!.version).toBe('2.31.0')
      expect(deps[2]!.name).toBe('numpy')
      expect(deps[2]!.version).toBeUndefined()
    })

    it('无 install_requires 应返回空数组', () => {
      const content = 'setup(name="mylib")'
      expect(parseSetupPy(content)).toHaveLength(0)
    })
  })

  describe('pipResolver', () => {
    it('ecosystem 应为 pip', () => {
      expect(pipResolver.ecosystem).toBe('pip')
    })
  })
})
