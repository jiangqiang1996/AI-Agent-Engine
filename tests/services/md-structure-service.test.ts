import { describe, it, expect } from 'vitest'

import {
  parseMdStructure,
  computeCoverage,
  formatStructureSummary,
  shouldEnhance,
  offsetSectionLines,
  ENHANCEMENT_THRESHOLD_LINES,
} from '../../src/services/md-structure-service.js'

describe('md-structure-service', () => {
  describe('parseMdStructure', () => {
    it('应该解析标准 Markdown 标题树', () => {
      const content = [
        '# 架构规范',
        '',
        '本文件定义系统架构。',
        '',
        '## 模块边界',
        '',
        'src/index.ts 只负责注册。',
        '',
        '## 依赖方向',
        '',
        '允许方向：tools → services。',
        '',
        '# 代码风格',
        '',
        '命名约定。',
      ].join('\n')

      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.totalLines).toBe(15)
      expect(result!.sections).toHaveLength(4)

      expect(result!.sections[0]).toEqual({
        id: 's1',
        depth: 1,
        title: '架构规范',
        level: 'H1',
        startLine: 1,
        endLine: 4,
        preview: '本文件定义系统架构。',
      })

      expect(result!.sections[1]).toEqual({
        id: 's2',
        depth: 2,
        title: '模块边界',
        level: 'H2',
        startLine: 5,
        endLine: 8,
        preview: 'src/index.ts 只负责注册。',
      })

      expect(result!.sections[3]).toEqual({
        id: 's4',
        depth: 1,
        title: '代码风格',
        level: 'H1',
        startLine: 13,
        endLine: 15,
        preview: '命名约定。',
      })
    })

    it('应该处理无标题的 Markdown', () => {
      const content = '这是一段纯文本，没有标题。\n第二行。'
      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections).toHaveLength(0)
    })

    it('应该正确处理代码块内的 # 避免误匹配', () => {
      const content = [
        '# 标题一',
        '',
        '```python',
        '# 这是 Python 注释，不是 Markdown 标题',
        'x = 1',
        '```',
        '',
        '正文内容。',
      ].join('\n')

      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections).toHaveLength(1)
      expect(result!.sections[0].title).toBe('标题一')
    })

    it('应该处理空内容', () => {
      const result = parseMdStructure('')
      expect(result).not.toBeNull()
      expect(result!.totalLines).toBe(1)
      expect(result!.sections).toHaveLength(0)
    })

    it('应该截断超长预览', () => {
      const longText = 'a'.repeat(200)
      const content = `# 标题\n\n${longText}`
      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections[0].preview.length).toBeLessThanOrEqual(83)
      expect(result!.sections[0].preview).toContain('...')
    })

    it('应该处理深层嵌套标题', () => {
      const content = [
        '# H1 标题',
        '## H2 标题',
        '### H3 标题',
        '#### H4 标题',
        '##### H5 标题',
        '###### H6 标题',
      ].join('\n')

      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections).toHaveLength(6)
      expect(result!.sections[5].level).toBe('H6')
    })
  })

  describe('computeCoverage', () => {
    it('应该正确计算已覆盖和未覆盖章节', () => {
      const sections = [
        { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 50, preview: '' },
        { id: 's2', depth: 1, title: 'B', level: 'H1', startLine: 51, endLine: 100, preview: '' },
        { id: 's3', depth: 1, title: 'C', level: 'H1', startLine: 101, endLine: 150, preview: '' },
      ]

      const coverage = computeCoverage(sections, 1, 60)
      expect(coverage.covered).toContain('s1')
      expect(coverage.covered).toContain('s2')
      expect(coverage.uncovered).toHaveLength(1)
      expect(coverage.uncovered[0].id).toBe('s3')
    })

    it('应该处理全部覆盖的情况', () => {
      const sections = [
        { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 50, preview: '' },
      ]
      const coverage = computeCoverage(sections, 1, 50)
      expect(coverage.covered).toHaveLength(1)
      expect(coverage.uncovered).toHaveLength(0)
    })

    it('应该处理无覆盖的情况', () => {
      const sections = [
        { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 100, endLine: 200, preview: '' },
      ]
      const coverage = computeCoverage(sections, 1, 50)
      expect(coverage.covered).toHaveLength(0)
      expect(coverage.uncovered).toHaveLength(1)
    })

    it('应该将读取范围之前的章节归入未覆盖', () => {
      const sections = [
        { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 50, preview: '' },
        { id: 's2', depth: 1, title: 'B', level: 'H1', startLine: 51, endLine: 100, preview: '' },
        { id: 's3', depth: 1, title: 'C', level: 'H1', startLine: 101, endLine: 150, preview: '' },
      ]
      const coverage = computeCoverage(sections, 80, 120)
      expect(coverage.covered).toContain('s2')
      expect(coverage.covered).toContain('s3')
      expect(coverage.uncovered).toHaveLength(1)
      expect(coverage.uncovered[0].id).toBe('s1')
    })
  })

  describe('formatStructureSummary', () => {
    it('应该生成包含标题树和恢复指令的摘要', () => {
      const structure = {
        totalLines: 300,
        sections: [
          { id: 's1', depth: 1, title: '架构', level: 'H1', startLine: 1, endLine: 100, preview: '架构内容' },
          { id: 's2', depth: 1, title: '代码风格', level: 'H1', startLine: 101, endLine: 300, preview: '命名约定' },
        ],
      }
      const coverage = {
        covered: ['s1'],
        uncovered: [structure.sections[1]],
      }

      const summary = formatStructureSummary('test.md', structure, coverage, 1, 100)
      expect(summary).toContain('file-structure-summary')
      expect(summary).toContain('test.md')
      expect(summary).toContain('架构')
      expect(summary).toContain('代码风格')
      expect(summary).toContain('已覆盖')
      expect(summary).toContain('未覆盖')
      expect(summary).toContain('offset=101')
      expect(summary).toContain('limit=200')
    })

    it('应该处理全部覆盖的情况', () => {
      const structure = {
        totalLines: 50,
        sections: [
          { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 50, preview: '内容' },
        ],
      }
      const coverage = { covered: ['s1'], uncovered: [] }

      const summary = formatStructureSummary('test.md', structure, coverage, 1, 50)
      expect(summary).toContain('已覆盖')
      expect(summary).not.toContain('未覆盖')
    })
  })

  describe('shouldEnhance', () => {
    it('应该在截断时触发', () => {
      expect(shouldEnhance(100, true, false)).toBe(true)
    })

    it('应该在超过阈值时触发', () => {
      expect(shouldEnhance(ENHANCEMENT_THRESHOLD_LINES + 1, false, false)).toBe(true)
    })

    it('应该在使用 offset/limit 时触发', () => {
      expect(shouldEnhance(10, false, true)).toBe(true)
    })

    it('应该在小文件无截断时不触发', () => {
      expect(shouldEnhance(50, false, false)).toBe(false)
    })

    it('应该恰好在阈值时不触发', () => {
      expect(shouldEnhance(ENHANCEMENT_THRESHOLD_LINES, false, false)).toBe(false)
    })
  })

  describe('offsetSectionLines', () => {
    it('应该将章节行号偏移为文件绝对行号', () => {
      const structure = {
        totalLines: 50,
        sections: [
          { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 25, preview: '' },
          { id: 's2', depth: 1, title: 'B', level: 'H1', startLine: 26, endLine: 50, preview: '' },
        ],
      }
      const result = offsetSectionLines(structure, 49)
      expect(result.sections[0].startLine).toBe(50)
      expect(result.sections[0].endLine).toBe(74)
      expect(result.sections[1].startLine).toBe(75)
      expect(result.sections[1].endLine).toBe(99)
    })

    it('偏移量为 0 时应返回原结构', () => {
      const structure = {
        totalLines: 10,
        sections: [
          { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 10, preview: '' },
        ],
      }
      const result = offsetSectionLines(structure, 0)
      expect(result).toBe(structure)
    })
  })

  describe('extractHeadingText — 内联节点', () => {
    it('应该提取含链接的标题文本', () => {
      const content = '# Hello [world](https://example.com)\n\n内容'
      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections[0].title).toBe('Hello world')
    })

    it('应该提取含行内代码的标题文本', () => {
      const content = '# 配置 `config.json` 说明\n\n内容'
      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections[0].title).toBe('配置 config.json 说明')
    })

    it('应该提取含强调的标题文本', () => {
      const content = '# **重要** 注意事项\n\n内容'
      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      expect(result!.sections[0].title).toBe('重要 注意事项')
    })
  })

  describe('computeCoverage — 非连续未覆盖', () => {
    it('应该正确处理未覆盖章节分布在前后两端', () => {
      const sections = [
        { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 50, preview: '' },
        { id: 's2', depth: 1, title: 'B', level: 'H1', startLine: 51, endLine: 100, preview: '' },
        { id: 's3', depth: 1, title: 'C', level: 'H1', startLine: 101, endLine: 150, preview: '' },
        { id: 's4', depth: 1, title: 'D', level: 'H1', startLine: 151, endLine: 200, preview: '' },
      ]
      // 读取中间部分 60-140，s1 和 s4 未覆盖
      const coverage = computeCoverage(sections, 60, 140)
      expect(coverage.covered).toContain('s2')
      expect(coverage.covered).toContain('s3')
      expect(coverage.uncovered).toHaveLength(2)
      expect(coverage.uncovered[0].id).toBe('s1')
      expect(coverage.uncovered[1].id).toBe('s4')
    })
  })

  describe('formatStructureSummary — 非连续未覆盖行数', () => {
    it('应该逐章节累加未覆盖行数而非假设连续', () => {
      const structure = {
        totalLines: 200,
        sections: [
          { id: 's1', depth: 1, title: 'A', level: 'H1', startLine: 1, endLine: 50, preview: '' },
          { id: 's2', depth: 1, title: 'B', level: 'H1', startLine: 51, endLine: 100, preview: '' },
          { id: 's3', depth: 1, title: 'C', level: 'H1', startLine: 101, endLine: 150, preview: '' },
          { id: 's4', depth: 1, title: 'D', level: 'H1', startLine: 151, endLine: 200, preview: '' },
        ],
      }
      // s1(50行) 和 s4(50行) 未覆盖，共 100 行
      const coverage = {
        covered: ['s2', 's3'],
        uncovered: [structure.sections[0], structure.sections[3]],
      }
      const summary = formatStructureSummary('test.md', structure, coverage, 51, 150)
      // 应显示 100 行而非 200 行
      expect(summary).toContain('约 100 行')
      expect(summary).not.toContain('约 200 行')
    })
  })

  describe('escapeTableCell', () => {
    it('应该转义标题中的管道符', () => {
      const content = '# A | B\n\n内容'
      const result = parseMdStructure(content)
      expect(result).not.toBeNull()
      const structure = result!
      const coverage = computeCoverage(structure.sections, 1, 2)
      const summary = formatStructureSummary('test.md', structure, coverage, 1, 2)
      // 管道符应被转义，不破坏表格结构
      expect(summary).toContain('A \\| B')
    })
  })
})
