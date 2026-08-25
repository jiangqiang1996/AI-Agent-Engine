import { describe, expect, it } from 'vitest'

import { resolveCommand, normalizeCommand, buildDelegateArgs, validateDelegateArgs, formatPreviewResult, formatRuleResult } from '../../src/tools/ae-ocr.tool.js'
import type { OcrDelegatePreview, OcrDelegateRule } from '../../src/services/ocr-service.js'

describe('ae-ocr 工具', () => {
  describe('resolveCommand', () => {
    it('command=auto 且无 shell 时应推断为 delegate', () => {
      expect(resolveCommand({ command: 'auto' })).toBe('delegate')
    })

    it('command=auto 且有 shell 时应推断为 completion', () => {
      expect(resolveCommand({ command: 'auto', shell: 'bash' })).toBe('completion')
    })

    it('command=delegate 时应直接使用', () => {
      expect(resolveCommand({ command: 'delegate' })).toBe('delegate')
    })

    it('command=d 时应归一化为 delegate', () => {
      expect(resolveCommand({ command: 'd' })).toBe('delegate')
    })

    it('command=version 时应直接使用', () => {
      expect(resolveCommand({ command: 'version' })).toBe('version')
    })

    it('command=completion 时应直接使用', () => {
      expect(resolveCommand({ command: 'completion' })).toBe('completion')
    })
  })

  describe('normalizeCommand', () => {
    it('d 应归一化为 delegate', () => {
      expect(normalizeCommand('d')).toBe('delegate')
    })

    it('delegate 应保持不变', () => {
      expect(normalizeCommand('delegate')).toBe('delegate')
    })

    it('version 应保持不变', () => {
      expect(normalizeCommand('version')).toBe('version')
    })
  })

  describe('buildDelegateArgs', () => {
    it('preview 子命令应构建基本参数', () => {
      const args = buildDelegateArgs('preview', { format: 'json' })
      expect(args).toContain('delegate')
      expect(args).toContain('preview')
      expect(args).toContain('--format')
      expect(args).toContain('json')
    })

    it('preview 应包含 from/to/commit', () => {
      const args = buildDelegateArgs('preview', { from: 'main', to: 'feature', commit: 'abc123' })
      expect(args).toContain('--from')
      expect(args).toContain('main')
      expect(args).toContain('--to')
      expect(args).toContain('feature')
      expect(args).toContain('--commit')
      expect(args).toContain('abc123')
    })

    it('preview 应包含 background/backgroundFile/exclude', () => {
      const args = buildDelegateArgs('preview', { background: 'ctx', backgroundFile: './bg.md', exclude: '**/*.json' })
      expect(args).toContain('--background')
      expect(args).toContain('ctx')
      expect(args).toContain('--background-file')
      expect(args).toContain('./bg.md')
      expect(args).toContain('--exclude')
      expect(args).toContain('**/*.json')
    })

    it('应包含 maxGitProcs 参数', () => {
      const args = buildDelegateArgs('preview', { maxGitProcs: 8 })
      expect(args).toContain('--max-git-procs')
      expect(args).toContain('8')
    })

    it('maxGitProcs 未指定时不追加', () => {
      const args = buildDelegateArgs('preview', {})
      expect(args).not.toContain('--max-git-procs')
    })

    it('rule 子命令应追加 paths 文件路径', () => {
      const args = buildDelegateArgs('rule', { paths: ['src/foo.ts', 'src/bar.ts'] })
      expect(args).toContain('src/foo.ts')
      expect(args).toContain('src/bar.ts')
    })

    it('rule 子命令无 paths 时不追加文件路径', () => {
      const args = buildDelegateArgs('rule', {})
      expect(args.filter((a) => a.endsWith('.ts'))).toHaveLength(0)
    })

    it('应追加用户透传的额外 args', () => {
      const args = buildDelegateArgs('preview', { args: ['--new-flag', 'value'] })
      expect(args).toContain('--new-flag')
      expect(args).toContain('value')
    })

    it('应过滤 paths 中的空字符串和纯空白字符串', () => {
      const args = buildDelegateArgs('rule', { paths: ['src/foo.ts', '', '  '] })
      expect(args).toContain('src/foo.ts')
      expect(args.filter((a) => a === '')).toHaveLength(0)
      expect(args.filter((a) => a.trim() === '')).toHaveLength(0)
    })

    it('应包含 repo 参数', () => {
      const args = buildDelegateArgs('preview', { repo: '/path/to/repo' })
      expect(args).toContain('--repo')
      expect(args).toContain('/path/to/repo')
    })

    it('应包含 rule 参数', () => {
      const args = buildDelegateArgs('preview', { rule: './custom-rule.json' })
      expect(args).toContain('--rule')
      expect(args).toContain('./custom-rule.json')
    })
  })

  describe('validateDelegateArgs', () => {
    const cwd = process.cwd()

    it('preview 无范围参数时应通过校验', () => {
      expect(validateDelegateArgs('preview', {}, cwd)).toBeUndefined()
    })

    it('preview 有 from 和 to 时应通过校验', () => {
      expect(validateDelegateArgs('preview', { from: 'main', to: 'feature' }, cwd)).toBeUndefined()
    })

    it('preview 有 commit 时应通过校验', () => {
      expect(validateDelegateArgs('preview', { commit: 'abc123' }, cwd)).toBeUndefined()
    })

    it('preview 只有 from 缺少 to 时应报错', () => {
      const err = validateDelegateArgs('preview', { from: 'main' }, cwd)
      expect(err).toContain('from')
      expect(err).toContain('to')
    })

    it('preview 只有 to 缺少 from 时应报错', () => {
      const err = validateDelegateArgs('preview', { to: 'feature' }, cwd)
      expect(err).toContain('to')
      expect(err).toContain('from')
    })

    it('commit 与 from/to 同时使用时应报互斥错误', () => {
      const err = validateDelegateArgs('preview', { commit: 'abc123', from: 'main', to: 'feature' }, cwd)
      expect(err).toContain('互斥')
    })

    it('commit 与 from 同时使用时应报互斥错误', () => {
      const err = validateDelegateArgs('preview', { commit: 'abc123', from: 'main' }, cwd)
      expect(err).toContain('互斥')
    })

    it('rule 子命令无 paths 时应报错', () => {
      const err = validateDelegateArgs('rule', {}, cwd)
      expect(err).toContain('paths')
      expect(err).toContain('至少 1 个')
    })

    it('rule 子命令 paths 为空数组时应报错', () => {
      const err = validateDelegateArgs('rule', { paths: [] }, cwd)
      expect(err).toContain('paths')
    })

    it('rule 子命令 paths 为全空字符串时应报错', () => {
      const err = validateDelegateArgs('rule', { paths: ['', '  '] }, cwd)
      expect(err).toContain('paths')
    })

    it('rule 子命令有有效 paths 时应通过校验', () => {
      expect(validateDelegateArgs('rule', { paths: ['src/foo.ts'] }, cwd)).toBeUndefined()
    })

    it('backgroundFile 指向不存在的文件时应报错', () => {
      const err = validateDelegateArgs('preview', { backgroundFile: '/nonexistent/file.md' }, cwd)
      expect(err).toContain('不存在')
      expect(err).toContain('backgroundFile')
    })

    it('backgroundFile 指向存在的文件时应通过校验', () => {
      const err = validateDelegateArgs('preview', { backgroundFile: 'src/assets/skills/ae-ocr/SKILL.md' }, cwd)
      expect(err).toBeUndefined()
    })

    it('rule 自定义规则文件不存在时应报错', () => {
      const err = validateDelegateArgs('preview', { rule: '/nonexistent/rule.json' }, cwd)
      expect(err).toContain('不存在')
      expect(err).toContain('rule')
    })
  })

  describe('formatPreviewResult', () => {
    it('应格式化基本 preview 结果', () => {
      const result: OcrDelegatePreview = {
        mode: 'workspace',
        reviewable_count: 2,
        excluded_count: 1,
        reviewable_files: [
          { path: 'src/foo.ts', status: 'modified', insertions: 10, deletions: 2 },
        ],
        excluded_files: [
          { path: 'docs/README.md', status: 'modified', insertions: 5, deletions: 5, exclude_reason: 'unsupported_ext' },
        ],
      }
      const output = formatPreviewResult(result, '', 0)
      expect(output).toContain('workspace')
      expect(output).toContain('src/foo.ts')
      expect(output).toContain('docs/README.md')
      expect(output).toContain('unsupported_ext')
    })

    it('空结果应输出无可审查变更', () => {
      const result: OcrDelegatePreview = {
        mode: 'workspace',
        reviewable_count: 0,
        excluded_count: 0,
        reviewable_files: [],
        excluded_files: [],
      }
      const output = formatPreviewResult(result, '', 0)
      expect(output).toContain('无可审查的代码变更')
    })

    it('exitCode 非 0 应输出警告', () => {
      const result: OcrDelegatePreview = { mode: 'workspace' }
      const output = formatPreviewResult(result, '', 1)
      expect(output).toContain('退出码非 0')
    })

    it('应包含 from/to/commit/merge_base', () => {
      const result: OcrDelegatePreview = {
        mode: 'range',
        from: 'main',
        to: 'feature',
        merge_base: 'abc123',
      }
      const output = formatPreviewResult(result, '', 0)
      expect(output).toContain('main')
      expect(output).toContain('feature')
      expect(output).toContain('abc123')
    })
  })

  describe('formatRuleResult', () => {
    it('应格式化规则组输出', () => {
      const result: OcrDelegateRule = {
        groups: [
          { group_id: 1, source: 'system', pattern: '**/*.ts', files: ['src/foo.ts'], rule: '规则文本' },
        ],
      }
      const output = formatRuleResult(result, '', 0)
      expect(output).toContain('规则组 1')
      expect(output).toContain('system')
      expect(output).toContain('**/*.ts')
      expect(output).toContain('src/foo.ts')
      expect(output).toContain('规则文本')
    })

    it('空规则组应输出无匹配', () => {
      const result: OcrDelegateRule = { groups: [] }
      const output = formatRuleResult(result, '', 0)
      expect(output).toContain('无匹配的审查规则')
    })

    it('exitCode 非 0 应输出警告', () => {
      const result: OcrDelegateRule = { groups: [] }
      const output = formatRuleResult(result, '', 1)
      expect(output).toContain('退出码非 0')
    })
  })
})
