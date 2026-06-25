import { describe, it, expect } from 'vitest'

import {
  buildExtractionScript,
  mapBrowserSlideToPptxSlide,
  type BrowserSlideData,
  type BrowserPptxElement,
  type BrowserSlideDimensions,
  type SlideSeparator,
} from '../../src/services/browser-pptx-renderer.js'

const DEFAULT_DIMENSIONS: BrowserSlideDimensions = { width: 13.33, height: 7.5 }

describe('browser-pptx-renderer', () => {
  describe('buildExtractionScript', () => {
    it('应该生成包含 IIFE 包裹的可执行 JavaScript', () => {
      const script = buildExtractionScript('auto')
      expect(script).toContain('(function()')
      expect(script).toContain('return result')
      expect(script).toContain('})();')
    })

    it('section 模式应该包含 getSlideSections 函数查询 section 元素', () => {
      const script = buildExtractionScript('section')
      expect(script).toContain("querySelectorAll('section')")
    })

    it('hr 模式应该包含 HR 分隔逻辑', () => {
      const script = buildExtractionScript('hr')
      expect(script).toContain("'HR'")
    })

    it('h1 模式应该包含 H1 分隔逻辑', () => {
      const script = buildExtractionScript('h1')
      expect(script).toContain("'H1'")
    })

    it('auto 模式应该包含所有三种分隔逻辑', () => {
      const script = buildExtractionScript('auto')
      expect(script).toContain("querySelectorAll('section')")
      expect(script).toContain("'HR'")
      expect(script).toContain("'H1'")
    })

    it('应该包含 pxToInch 转换函数', () => {
      const script = buildExtractionScript('auto')
      expect(script).toContain('function pxToInch')
      expect(script).toContain('/ PX_PER_IN')
    })

    it('应该包含 rgbToHex 转换函数', () => {
      const script = buildExtractionScript('auto')
      expect(script).toContain('function rgbToHex')
    })

    it('应该包含 extractElementData 函数处理多种元素类型', () => {
      const script = buildExtractionScript('auto')
      expect(script).toContain('function extractElement')
      expect(script).toContain("'IMG'")
      expect(script).toContain("'UL'")
      expect(script).toContain("'TABLE'")
    })

    it('无效 slideSeparator 类型不应该崩溃', () => {
      const invalid = 'unknown' as SlideSeparator
      const script = buildExtractionScript(invalid)
      expect(typeof script).toBe('string')
      expect(script.length).toBeGreaterThan(0)
    })
  })

  describe('mapBrowserSlideToPptxSlide', () => {
    const worktree = '/tmp/test-worktree'
    const baseDir = '/tmp/test-worktree'
    const warnings: string[] = []

    it('应该将文本元素映射为 PptxInputElement', () => {
      const element: BrowserPptxElement = {
        type: 'text',
        x: 0.5,
        y: 1.0,
        w: 8.0,
        h: 0.5,
        text: '标题文本',
        style: { fontSize: 28, bold: true, color: '333333' },
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements).toHaveLength(1)
      expect(result.elements![0].type).toBe('text')
      expect(result.elements![0].text).toBe('标题文本')
      expect(result.elements![0].fontSize).toBe(28)
      expect(result.elements![0].bold).toBe(true)
    })

    it('应该将 textRuns 映射为 PptxTextRun', () => {
      const element: BrowserPptxElement = {
        type: 'text',
        x: 0.5,
        y: 1.0,
        w: 8.0,
        h: 0.5,
        textRuns: [
          { text: '粗体', bold: true, fontSize: 24 },
          { text: '普通', fontSize: 18 },
        ],
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements![0].textRuns).toHaveLength(2)
      expect(result.elements![0].textRuns![0].bold).toBe(true)
    })

    it('应该将图片元素映射为 PptxInputElement（data URI）', () => {
      const element: BrowserPptxElement = {
        type: 'image',
        x: 1.0,
        y: 2.0,
        w: 4.0,
        h: 3.0,
        src: 'data:image/png;base64,iVBOR',
        alt: '测试图片',
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements).toHaveLength(1)
      expect(result.elements![0].type).toBe('image')
      expect(result.elements![0].imageData).toBe('iVBOR')
    })

    it('应该跳过 SVG 格式的 data URI 图片并记录警告', () => {
      const element: BrowserPptxElement = {
        type: 'image',
        x: 1.0,
        y: 2.0,
        w: 4.0,
        h: 3.0,
        src: 'data:image/svg+xml;base64,...',
        alt: 'SVG 图标',
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const localWarnings: string[] = []
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, localWarnings)
      expect(result.elements).toHaveLength(0)
      expect(localWarnings).toHaveLength(1)
      expect(localWarnings[0]).toContain('SVG')
    })

    it('应该将形状元素映射为 PptxInputElement', () => {
      const element: BrowserPptxElement = {
        type: 'shape',
        x: 1.0,
        y: 1.0,
        w: 5.0,
        h: 2.0,
        shape: 'rect',
        fill: { color: '336699' },
        border: { color: '000000', width: 1, type: 'solid' },
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements![0].type).toBe('shape')
      expect(result.elements![0].fill).toEqual({ type: 'solid', color: '336699' })
    })

    it('应该将列表元素映射为多个文本元素', () => {
      const element: BrowserPptxElement = {
        type: 'list',
        x: 0.5,
        y: 1.0,
        w: 8.0,
        h: 2.0,
        items: [
          { text: '项目 1' },
          { text: '项目 2' },
        ],
        style: { fontSize: 18 },
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements).toHaveLength(1)
      expect(result.elements![0].type).toBe('text')
      expect(result.elements![0].textRuns!.length).toBeGreaterThanOrEqual(2)
    })

    it('应该将表格元素映射为 PptxInputElement', () => {
      const element: BrowserPptxElement = {
        type: 'table',
        x: 1.0,
        y: 2.0,
        w: 8.0,
        h: 3.0,
        rows: [
          { cells: [{ text: '列 1', bold: true }, { text: '列 2', bold: true }] },
          { cells: [{ text: '值 1' }, { text: '值 2' }] },
        ],
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements![0].type).toBe('table')
      expect(result.elements![0].rows).toHaveLength(2)
    })

    it('应该将背景色映射到幻灯片背景（非白色）', () => {
      const slide: BrowserSlideData = {
        background: { type: 'color', value: '1a1a2e' },
        elements: [],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.background).toEqual({ color: '1a1a2e' })
    })

    it('白色背景应该设置幻灯片背景（不按颜色歧视过滤）', () => {
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.background).toEqual({ color: 'ffffff' })
    })

    it('深色背景应该设置幻灯片背景', () => {
      const slide: BrowserSlideData = {
        background: { type: 'color', value: '0a0a0a' },
        elements: [],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.background).toEqual({ color: '0a0a0a' })
    })

    it('纯黑背景应该设置幻灯片背景（不再过滤 000000）', () => {
      const slide: BrowserSlideData = {
        background: { type: 'color', value: '000000' },
        elements: [],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.background).toEqual({ color: '000000' })
    })

    it('空列表应该被跳过', () => {
      const element: BrowserPptxElement = {
        type: 'list',
        x: 0.5,
        y: 1.0,
        w: 8.0,
        h: 2.0,
        items: [],
        style: { fontSize: 18 },
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements).toHaveLength(0)
    })

    it('空 src 图片应该被跳过', () => {
      const element: BrowserPptxElement = {
        type: 'image',
        x: 1.0,
        y: 2.0,
        w: 4.0,
        h: 3.0,
        src: '',
        alt: '空图片',
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements).toHaveLength(0)
    })

    it('线条元素应该映射为 shape line', () => {
      const element: BrowserPptxElement = {
        type: 'line',
        x: 0.5,
        y: 3.0,
        w: 8.0,
        h: 0.02,
        border: { color: 'cccccc', width: 1, type: 'solid' },
      }
      const slide: BrowserSlideData = {
        background: { type: 'color', value: 'ffffff' },
        elements: [element],
        dimensions: DEFAULT_DIMENSIONS,
        errors: [],
      }
      const result = mapBrowserSlideToPptxSlide(slide, worktree, baseDir, warnings)
      expect(result.elements![0].type).toBe('shape')
      expect(result.elements![0].shape).toBe('line')
    })
  })
})
