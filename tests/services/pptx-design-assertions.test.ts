import { describe, it, expect, beforeEach } from 'vitest'

import { runAssertions, formatAssertionReport } from '../../src/services/pptx-design-assertions.js'
import { translateDesignFile, clearTemplateCache } from '../../src/services/pptx-template-translator.js'
import type { PptxDesignFile, GlobalStyle } from '../../src/schemas/pptx-design-schema.js'

const validGlobalStyle: GlobalStyle = {
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

describe('pptx-design-assertions', () => {
  beforeEach(() => {
    clearTemplateCache()
  })

  function buildDesignFile(overrides: Partial<PptxDesignFile> = {}): PptxDesignFile {
    return {
      version: 1,
      title: '测试',
      globalStyle: validGlobalStyle,
      pages: [
        {
          id: 'p1',
          template: 'cover.centered',
          tokens: { title: '标题' },
          locked: false,
        },
      ],
      ...overrides,
    }
  }

  it('应该通过有效设计文件的所有断言', () => {
    const designFile = buildDesignFile()
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    expect(report.blockingErrors.length).toBe(0)
    expect(report.totalAssertions).toBeGreaterThan(10)
  })

  it('A7 应该检测低对比度', () => {
    const designFile = buildDesignFile({
      globalStyle: {
        ...validGlobalStyle,
        colors: {
          ...validGlobalStyle.colors,
          text: '333333', // 与深色背景对比度不足
          title: '444444',
        },
      },
    })
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    const contrastFail = report.results.find((r) => r.id === 'A7' && !r.passed)
    expect(contrastFail).toBeDefined()
  })

  it('A8 应该检测主题与背景色不一致', () => {
    const designFile = buildDesignFile({
      globalStyle: {
        ...validGlobalStyle,
        theme: 'dark',
        colors: {
          ...validGlobalStyle.colors,
          background: 'FFFFFF', // 白色背景但声明为 dark
        },
      },
    })
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    const themeFail = report.results.find((r) => r.id === 'A8' && !r.passed)
    expect(themeFail).toBeDefined()
  })

  it('A10 应该检测非 CJK 字体', () => {
    const designFile = buildDesignFile({
      globalStyle: {
        ...validGlobalStyle,
        fonts: {
          headFontFace: 'Helvetica',
          bodyFontFace: 'Arial',
        },
      },
    })
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    const cjkFail = report.results.find((r) => r.id === 'A10' && !r.passed)
    expect(cjkFail).toBeDefined()
  })

  it('A6 应该检测标题正文字号差不足', () => {
    const designFile = buildDesignFile({
      globalStyle: {
        ...validGlobalStyle,
        titleStyle: { ...validGlobalStyle.titleStyle, fontSize: 20 },
        bodyStyle: { ...validGlobalStyle.bodyStyle, fontSize: 18 },
      },
    })
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    const fontSizeDiffFail = report.results.find((r) => r.id === 'A6' && !r.passed)
    expect(fontSizeDiffFail).toBeDefined()
  })

  it('A15 应该检测 overrides 字号超出范围', () => {
    const designFile = buildDesignFile({
      pages: [
        {
          id: 'p1',
          template: 'cover.centered',
          tokens: { title: '标题' },
          overrides: {
            title: {
              fontSize: 100, // 超出 8-72 范围
            },
          },
          locked: false,
        },
      ],
    })
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    const fontSizeRangeFail = report.results.find((r) => r.id === 'A15' && !r.passed)
    expect(fontSizeRangeFail).toBeDefined()
  })

  it('formatAssertionReport 应该格式化报告', () => {
    const designFile = buildDesignFile()
    const translation = translateDesignFile(designFile)
    const report = runAssertions(designFile, translation)
    const formatted = formatAssertionReport(report)
    expect(formatted).toContain('结构化断言报告')
    expect(formatted).toContain('无阻断错误')
  })
})
