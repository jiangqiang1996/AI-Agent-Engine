import { describe, it, expect, beforeEach } from 'vitest'

import {
  translatePage,
  translateDesignFile,
  loadAllTemplates,
  clearTemplateCache,
} from '../../src/services/pptx-template-translator.js'
import type { PptxDesignFile, PageDesign, GlobalStyle } from '../../src/schemas/pptx-design-schema.js'

const mockGlobalStyle: GlobalStyle = {
  theme: 'dark',
  colors: {
    primary: '1A2028',
    accent: '4ADE80',
    background: '0F1419',
    text: 'E5E7EB',
    title: 'F9FAFB',
  },
  fonts: {
    headFontFace: 'Microsoft YaHei',
    bodyFontFace: 'Microsoft YaHei',
  },
  titleStyle: {
    fontSize: 32,
    bold: true,
    color: 'F9FAFB',
  },
  bodyStyle: {
    fontSize: 18,
    color: 'E5E7EB',
    align: 'left',
  },
  layout: {
    size: 'LAYOUT_WIDE',
    margin: 0.5,
    titleAreaY: 0.3,
    titleAreaH: 0.9,
    contentStartY: 1.5,
    elementGap: 0.2,
  },
  shapeConsistency: 'rounded',
  accentColorLock: true,
}

describe('pptx-template-translator', () => {
  beforeEach(() => {
    clearTemplateCache()
  })

  describe('loadAllTemplates', () => {
    it('应该加载全部 14 个模板', () => {
      const templates = loadAllTemplates()
      expect(templates.size).toBe(14)
    })

    it('应该包含 cover.centered 模板', () => {
      const templates = loadAllTemplates()
      expect(templates.has('cover.centered')).toBe(true)
    })
  })

  describe('translatePage', () => {
    it('应该翻译 cover.centered 模板', () => {
      const page: PageDesign = {
        id: 'p1',
        template: 'cover.centered',
        tokens: {
          title: '测试标题',
          subtitle: '测试副标题',
        },
        locked: false,
      }
      const result = translatePage(page, mockGlobalStyle)
      expect(result.pageId).toBe('p1')
      expect(result.template).toBe('cover.centered')
      expect(result.elements.length).toBe(3) // title + subtitle + divider
      expect(result.elements[0].type).toBe('text')
      expect(result.background?.color).toBe('0F1419')
    })

    it('应该翻译 content.bullets 模板并生成带项目符号的 textRuns', () => {
      const page: PageDesign = {
        id: 'p2',
        template: 'content.bullets',
        tokens: {
          title: '要点列表',
          bullets: ['要点一', '要点二', '要点三'],
        },
        locked: false,
      }
      const result = translatePage(page, mockGlobalStyle)
      expect(result.elements.length).toBe(2) // title + bullets
      const bulletsEl = result.elements[1]
      expect(bulletsEl.type).toBe('text')
      expect(Array.isArray(bulletsEl.textRuns)).toBe(true)
      expect((bulletsEl.textRuns as unknown[]).length).toBe(3)
    })

    it('应该跳过可选 slot 且无值时', () => {
      const page: PageDesign = {
        id: 'p1',
        template: 'cover.centered',
        tokens: {
          title: '只有标题',
          // subtitle 是可选的
        },
        locked: false,
      }
      const result = translatePage(page, mockGlobalStyle)
      expect(result.elements.length).toBe(2) // title + divider (subtitle skipped)
    })

    it('应该合并 overrides 微调', () => {
      const page: PageDesign = {
        id: 'p1',
        template: 'cover.centered',
        tokens: {
          title: '测试标题',
        },
        overrides: {
          title: {
            x: 1.0,
            color: '4ADE80',
            fontSize: 48,
          },
        },
        locked: false,
      }
      const result = translatePage(page, mockGlobalStyle)
      const titleEl = result.elements[0]
      expect(titleEl.x).toBe(1.0)
      expect(titleEl.color).toBe('4ADE80')
      expect(titleEl.fontSize).toBe(48)
    })

    it('locked 页应忽略 overrides', () => {
      const page: PageDesign = {
        id: 'p1',
        template: 'cover.centered',
        tokens: {
          title: '测试标题',
        },
        overrides: {
          title: {
            x: 1.0,
            fontSize: 48,
          },
        },
        locked: true,
      }
      const result = translatePage(page, mockGlobalStyle)
      const titleEl = result.elements[0]
      // 应使用模板默认值
      expect(titleEl.x).not.toBe(1.0)
    })

    it('应该翻译 data.table 模板并归一化字符串二维数组 rows', () => {
      const page: PageDesign = {
        id: 'p3',
        template: 'data.table',
        tokens: {
          title: '资产表',
          rows: [
            ['类型', '数量'],
            ['技能', '38'],
            ['命令', '41'],
          ],
        },
        locked: false,
      }
      const result = translatePage(page, mockGlobalStyle)
      expect(result.pageId).toBe('p3')
      const tableEl = result.elements.find((e) => e.type === 'table')
      expect(tableEl).toBeDefined()
      const rows = tableEl!.rows as unknown[]
      expect(rows.length).toBe(3)
      // 第一行表头应归一化为 { text } 对象
      const firstRow = rows[0] as unknown[]
      expect(firstRow.length).toBe(2)
      expect((firstRow[0] as { text: string }).text).toBe('类型')
      expect((firstRow[1] as { text: string }).text).toBe('数量')
    })

    it('应该翻译 data.table 模板并保留对象二维数组 rows', () => {
      const page: PageDesign = {
        id: 'p4',
        template: 'data.table',
        tokens: {
          title: '对象表',
          rows: [
            [{ text: '列A' }, { text: '列B' }],
            [{ text: '值1' }, { text: '值2' }],
          ],
        },
        locked: false,
      }
      const result = translatePage(page, mockGlobalStyle)
      const tableEl = result.elements.find((e) => e.type === 'table')
      expect(tableEl).toBeDefined()
      const rows = tableEl!.rows as unknown[]
      const firstRow = rows[0] as { text: string }[]
      expect(firstRow[0].text).toBe('列A')
      expect(firstRow[1].text).toBe('列B')
    })
  })

  describe('translateDesignFile', () => {
    it('应该翻译完整设计文件', () => {
      const designFile: PptxDesignFile = {
        version: 1,
        title: '测试演示',
        globalStyle: mockGlobalStyle,
        pages: [
          {
            id: 'p1',
            template: 'cover.centered',
            tokens: { title: '标题' },
            locked: false,
          },
          {
            id: 'p2',
            template: 'content.bullets',
            tokens: {
              title: '要点',
              bullets: ['一', '二'],
            },
            locked: false,
          },
        ],
      }
      const result = translateDesignFile(designFile)
      expect(result.pages.length).toBe(2)
      expect(result.title).toBe('测试演示')
      expect(result.errors.length).toBe(0)
    })
  })
})
