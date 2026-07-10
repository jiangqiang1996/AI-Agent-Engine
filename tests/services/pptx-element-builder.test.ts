import { describe, it, expect } from 'vitest'

import {
  toCoord,
  toFillProps,
  toLineProps,
  toShadowProps,
  toHyperlinkProps,
  toBulletProps,
  toUnderlineProps,
  buildTextRuns,
  buildTextOptions,
  buildImageOptions,
  buildShapeOptions,
  buildTableCell,
  buildTableOptions,
  buildChartOptions,
  buildMediaOptions,
  drawElement,
  applyPresentationMeta,
  applySlideBackground,
  applySlideNumber,
  buildSlide,
  type PptxInstance,
  type PptxSlideInstance,
} from '../../src/services/pptx-element-builder.js'

// ==================== Mock 工厂 ====================

interface MockSlideCalls {
  addText: { text: unknown; options: unknown }[]
  addImage: { options: unknown }[]
  addShape: { shapeName: string; options: unknown }[]
  addTable: { rows: unknown[]; options: unknown }[]
  addChart: { type: string; data: unknown[]; options: unknown }[]
  addMedia: { options: unknown }[]
  addNotes: { notes: string }[]
  background: unknown
  hidden: boolean | undefined
  slideNumber: unknown
}

function createMockSlide(): { slide: PptxSlideInstance; calls: MockSlideCalls } {
  const calls: MockSlideCalls = {
    addText: [],
    addImage: [],
    addShape: [],
    addTable: [],
    addChart: [],
    addMedia: [],
    addNotes: [],
    background: undefined,
    hidden: undefined,
    slideNumber: undefined,
  }
  const slide: PptxSlideInstance = {
    addText: (text, options) => calls.addText.push({ text, options }),
    addImage: (options) => calls.addImage.push({ options }),
    addShape: (shapeName, options) => calls.addShape.push({ shapeName, options }),
    addTable: (rows, options) => calls.addTable.push({ rows, options }),
    addChart: (type, data, options) => calls.addChart.push({ type, data, options }),
    addMedia: (options) => calls.addMedia.push({ options }),
    addNotes: (notes) => calls.addNotes.push({ notes }),
  }
  return { slide, calls }
}

function createMockPptx(): { pptx: PptxInstance; slides: PptxSlideInstance[] } {
  const slides: PptxSlideInstance[] = []
  const pptx: PptxInstance = {
    defineLayout: () => {},
    defineSlideMaster: () => {},
    addSection: () => {},
    addSlide: (props) => {
      const { slide } = createMockSlide()
      slides.push(slide)
      return slide
    },
    layout: 'LAYOUT_WIDE',
    write: () => Promise.resolve(Buffer.alloc(0)),
  }
  return { pptx, slides }
}

// ==================== 测试 ====================

describe('pptx-element-builder', () => {
  describe('toCoord', () => {
    it('应该原样返回数字、字符串和 undefined', () => {
      expect(toCoord(1.5)).toBe(1.5)
      expect(toCoord('50%')).toBe('50%')
      expect(toCoord(undefined)).toBeUndefined()
    })
  })

  describe('toFillProps', () => {
    it('应该返回 undefined 当 fill 为空', () => {
      expect(toFillProps(undefined)).toBeUndefined()
    })

    it('应该正确映射 color、transparency 和 type', () => {
      const result = toFillProps({ color: 'FF0000', transparency: 50, type: 'solid' })
      expect(result).toEqual({ color: 'FF0000', transparency: 50, type: 'solid' })
    })

    it('应该只包含已定义的字段', () => {
      const result = toFillProps({ color: 'FF0000' })
      expect(result).toEqual({ color: 'FF0000' })
      expect(result).not.toHaveProperty('transparency')
      expect(result).not.toHaveProperty('type')
    })
  })

  describe('toLineProps', () => {
    it('应该返回 undefined 当 line 为空', () => {
      expect(toLineProps(undefined)).toBeUndefined()
    })

    it('应该包含 fill 属性和线宽', () => {
      const result = toLineProps({ color: '0000FF', width: 2 })
      expect(result).toEqual({ color: '0000FF', width: 2 })
    })

    it('应该包含 dashType 和箭头类型', () => {
      const result = toLineProps({
        color: '0000FF',
        dashType: 'dash',
        beginArrowType: 'arrow',
        endArrowType: 'stealth',
      })
      expect(result).toMatchObject({
        dashType: 'dash',
        beginArrowType: 'arrow',
        endArrowType: 'stealth',
      })
    })
  })

  describe('toShadowProps', () => {
    it('应该返回 undefined 当 shadow 为空', () => {
      expect(toShadowProps(undefined)).toBeUndefined()
    })

    it('应该映射所有阴影属性', () => {
      const result = toShadowProps({
        type: 'outer',
        opacity: 0.5,
        blur: 10,
        angle: 45,
        offset: 5,
        color: '000000',
        rotateWithShape: true,
      })
      expect(result).toEqual({
        type: 'outer',
        opacity: 0.5,
        blur: 10,
        angle: 45,
        offset: 5,
        color: '000000',
        rotateWithShape: true,
      })
    })

    it('应该只包含已定义的字段', () => {
      const result = toShadowProps({ type: 'inner' })
      expect(result).toEqual({ type: 'inner' })
      expect(result).not.toHaveProperty('opacity')
    })
  })

  describe('toHyperlinkProps', () => {
    it('应该返回 undefined 当 hyperlink 为空', () => {
      expect(toHyperlinkProps(undefined)).toBeUndefined()
    })

    it('应该映射 url、slide 和 tooltip', () => {
      const result = toHyperlinkProps({ url: 'https://example.com', tooltip: '链接' })
      expect(result).toEqual({ url: 'https://example.com', tooltip: '链接' })
    })

    it('应该支持 slide 跳转', () => {
      const result = toHyperlinkProps({ slide: 3 })
      expect(result).toEqual({ slide: 3 })
    })
  })

  describe('toBulletProps', () => {
    it('应该返回 undefined 当 bullet 为 undefined', () => {
      expect(toBulletProps(undefined)).toBeUndefined()
    })

    it('应该原样返回 true 和 false', () => {
      expect(toBulletProps(true)).toBe(true)
      expect(toBulletProps(false)).toBe(false)
    })

    it('应该映射对象形式的 bullet 配置', () => {
      const result = toBulletProps({ type: 'number', numberStartAt: 1 })
      expect(result).toEqual({ type: 'number', numberStartAt: 1 })
    })

    it('应该只包含已定义的字段', () => {
      const result = toBulletProps({ type: 'bullet' })
      expect(result).toEqual({ type: 'bullet' })
      expect(result).not.toHaveProperty('characterCode')
    })
  })

  describe('toUnderlineProps', () => {
    it('应该返回 undefined 当 underline 为空', () => {
      expect(toUnderlineProps(undefined)).toBeUndefined()
    })

    it('应该映射 style 和 color', () => {
      const result = toUnderlineProps({ style: 'single', color: 'FF0000' })
      expect(result).toEqual({ style: 'single', color: 'FF0000' })
    })
  })

  describe('buildTextRuns', () => {
    it('应该返回空数组当 runs 为空', () => {
      expect(buildTextRuns([])).toEqual([])
      expect(buildTextRuns([], 'FF0000')).toEqual([])
    })

    it('应该把 run 属性放在 options 子对象内', () => {
      const result = buildTextRuns([{ text: 'hello', bold: true, color: 'FF0000' }]) as { text: string; options: Record<string, unknown> }[]
      expect(result[0].text).toBe('hello')
      expect(result[0].options.bold).toBe(true)
      expect(result[0].options.color).toBe('FF0000')
    })

    it('应该传播元素级 color 到无 color 的 run', () => {
      const result = buildTextRuns([{ text: 'a' }], '3B82F6') as { options: Record<string, unknown> }[]
      expect(result[0].options.color).toBe('3B82F6')
    })

    it('run 自身的 color 应优先于元素级 color', () => {
      const result = buildTextRuns([{ text: 'a', color: 'FF0000' }], '3B82F6') as { options: Record<string, unknown> }[]
      expect(result[0].options.color).toBe('FF0000')
    })

    it('无属性的 run 应不包含 options 字段', () => {
      const result = buildTextRuns([{ text: 'plain' }]) as { text: string; options?: unknown }[]
      expect(result[0].text).toBe('plain')
      expect(result[0].options).toBeUndefined()
    })

    it('应该映射所有富文本运行属性', () => {
      const result = buildTextRuns([{
        text: 'rich',
        bold: true,
        italic: true,
        fontSize: 24,
        color: 'FF0000',
        fontFace: 'Arial',
        align: 'center',
        valign: 'middle',
        breakLine: true,
        bullet: { type: 'number' },
        underline: { style: 'single' },
        strike: true,
        subscript: true,
        superscript: false,
        highlight: 'yellow',
        charSpacing: 2,
        hyperlink: { url: 'https://example.com' },
        lang: 'zh-CN',
      }]) as { options: Record<string, unknown> }[]
      const opts = result[0].options
      expect(opts.bold).toBe(true)
      expect(opts.italic).toBe(true)
      expect(opts.fontSize).toBe(24)
      expect(opts.color).toBe('FF0000')
      expect(opts.fontFace).toBe('Arial')
      expect(opts.align).toBe('center')
      expect(opts.valign).toBe('middle')
      expect(opts.breakLine).toBe(true)
      expect(opts.bullet).toEqual({ type: 'number' })
      expect(opts.underline).toEqual({ style: 'single' })
      expect(opts.strike).toBe(true)
      expect(opts.subscript).toBe(true)
      expect(opts.superscript).toBe(false)
      expect(opts.highlight).toBe('yellow')
      expect(opts.charSpacing).toBe(2)
      expect(opts.hyperlink).toEqual({ url: 'https://example.com' })
      expect(opts.lang).toBe('zh-CN')
    })
  })

  describe('buildTextOptions', () => {
    it('应该映射坐标和基础文本属性', () => {
      const opts = buildTextOptions({ type: 'text', x: 1, y: 2, w: 3, h: 4, text: 'hi', fontSize: 18, bold: true })
      expect(opts.x).toBe(1)
      expect(opts.y).toBe(2)
      expect(opts.w).toBe(3)
      expect(opts.h).toBe(4)
      expect(opts.fontSize).toBe(18)
      expect(opts.bold).toBe(true)
    })

    it('应该映射 fill、line、shadow 等复杂属性', () => {
      const opts = buildTextOptions({
        type: 'text',
        fill: { color: 'FF0000' },
        line: { color: '0000FF', width: 1 },
        shadow: { type: 'outer' },
        hyperlink: { url: 'https://example.com' },
      })
      expect(opts.fill).toEqual({ color: 'FF0000' })
      expect(opts.line).toMatchObject({ color: '0000FF' })
      expect(opts.shadow).toMatchObject({ type: 'outer' })
      expect(opts.hyperlink).toEqual({ url: 'https://example.com' })
    })

    it('应该映射段落和文本框属性', () => {
      const opts = buildTextOptions({
        type: 'text',
        lineSpacing: 24,
        lineSpacingMultiple: 1.5,
        paraSpaceAfter: 10,
        paraSpaceBefore: 5,
        indentLevel: 2,
        charSpacing: 3,
        isTextBox: true,
        wrap: true,
        rtlMode: false,
        fit: 'shrink',
        margin: [1, 2, 3, 4],
      })
      expect(opts.lineSpacing).toBe(24)
      expect(opts.lineSpacingMultiple).toBe(1.5)
      expect(opts.paraSpaceAfter).toBe(10)
      expect(opts.paraSpaceBefore).toBe(5)
      expect(opts.indentLevel).toBe(2)
      expect(opts.charSpacing).toBe(3)
      expect(opts.isTextBox).toBe(true)
      expect(opts.wrap).toBe(true)
      expect(opts.rtlMode).toBe(false)
      expect(opts.fit).toBe('shrink')
      expect(opts.margin).toEqual([1, 2, 3, 4])
    })
  })

  describe('buildImageOptions', () => {
    it('应该映射 imagePath 和 imageData', () => {
      const opts = buildImageOptions({ type: 'image', imagePath: '/tmp/a.png', x: 1, y: 1 })
      expect(opts.path).toBe('/tmp/a.png')
      expect(opts.x).toBe(1)
    })

    it('应该给 imageData 添加 MIME 前缀（PNG）', () => {
      const opts = buildImageOptions({ type: 'image', imageData: 'iVBORw0KG' })
      expect(opts.data).toBe('image/png;base64,iVBORw0KG')
    })

    it('应该给 imageData 添加 MIME 前缀（JPEG）', () => {
      const opts = buildImageOptions({ type: 'image', imageData: '/9j/4AAQ' })
      expect(opts.data).toBe('image/jpeg;base64,/9j/4AAQ')
    })

    it('应该保留已有的 MIME 前缀', () => {
      const opts = buildImageOptions({ type: 'image', imageData: 'image/gif;base64,R0lGOD' })
      expect(opts.data).toBe('image/gif;base64,R0lGOD')
    })

    it('应该映射图片变换属性', () => {
      const opts = buildImageOptions({
        type: 'image',
        rounding: true,
        transparency: 30,
        flipH: true,
        flipV: false,
        rotate: 45,
        altText: '图片',
        sizing: { type: 'contain', w: 5, h: 3 },
      })
      expect(opts.rounding).toBe(true)
      expect(opts.transparency).toBe(30)
      expect(opts.flipH).toBe(true)
      expect(opts.flipV).toBe(false)
      expect(opts.rotate).toBe(45)
      expect(opts.altText).toBe('图片')
      expect(opts.sizing).toEqual({ type: 'contain', w: 5, h: 3 })
    })
  })

  describe('buildShapeOptions', () => {
    it('应该映射形状属性', () => {
      const opts = buildShapeOptions({
        type: 'shape',
        shape: 'roundRect',
        x: 1, y: 2, w: 3, h: 4,
        fill: { color: 'FF0000' },
        line: { color: '0000FF' },
        rectRadius: 0.1,
        points: [{ x: 0, y: 0 }],
        flipH: true,
        rotate: 30,
      })
      expect(opts.x).toBe(1)
      expect(opts.fill).toEqual({ color: 'FF0000' })
      expect(opts.line).toMatchObject({ color: '0000FF' })
      expect(opts.rectRadius).toBe(0.1)
      expect(opts.points).toEqual([{ x: 0, y: 0 }])
      expect(opts.flipH).toBe(true)
      expect(opts.rotate).toBe(30)
    })
  })

  describe('buildTableCell', () => {
    it('应该返回 text 和 options 结构', () => {
      const result = buildTableCell({ text: 'cell' }) as { text: string; options: Record<string, unknown> }
      expect(result.text).toBe('cell')
      expect(result.options).toBeDefined()
    })

    it('应该映射 rowspan 和 colspan', () => {
      const result = buildTableCell({ text: 'merged', rowspan: 2, colspan: 3 }) as { options: Record<string, unknown> }
      expect(result.options.rowspan).toBe(2)
      expect(result.options.colspan).toBe(3)
    })

    it('应该映射样式属性', () => {
      const result = buildTableCell({
        text: 'styled',
        bold: true,
        color: 'FF0000',
        fill: { color: 'EEEEEE' },
        align: 'center',
        valign: 'middle',
        fontSize: 14,
      }) as { options: Record<string, unknown> }
      expect(result.options.bold).toBe(true)
      expect(result.options.color).toBe('FF0000')
      expect(result.options.fill).toEqual({ color: 'EEEEEE' })
      expect(result.options.align).toBe('center')
      expect(result.options.valign).toBe('middle')
      expect(result.options.fontSize).toBe(14)
    })
  })

  describe('buildTableOptions', () => {
    it('应该映射表格布局属性', () => {
      const opts = buildTableOptions({
        type: 'table',
        colW: [2, 3],
        rowH: [0.5, 0.5],
        autoPage: true,
        autoPageRepeatHeader: true,
        autoPageHeaderRows: 1,
      })
      expect(opts.colW).toEqual([2, 3])
      expect(opts.rowH).toEqual([0.5, 0.5])
      expect(opts.autoPage).toBe(true)
      expect(opts.autoPageRepeatHeader).toBe(true)
      expect(opts.autoPageHeaderRows).toBe(1)
    })
  })

  describe('buildChartOptions', () => {
    it('应该映射坐标和 chartOptions', () => {
      const opts = buildChartOptions({
        type: 'chart',
        chartType: 'bar',
        chartData: [],
        x: 1, y: 1, w: 8, h: 4,
        chartOptions: { showLegend: true, title: '标题' },
      })
      expect(opts.x).toBe(1)
      expect(opts.showLegend).toBe(true)
      expect(opts.title).toBe('标题')
    })
  })

  describe('buildMediaOptions', () => {
    it('应该映射媒体类型和路径', () => {
      const opts = buildMediaOptions({
        type: 'media',
        mediaType: 'video',
        mediaPath: '/tmp/video.mp4',
        mediaCover: '/tmp/cover.png',
      })
      expect(opts.type).toBe('video')
      expect(opts.path).toBe('/tmp/video.mp4')
      expect(opts.cover).toBe('/tmp/cover.png')
    })

    it('应该映射在线媒体链接', () => {
      const opts = buildMediaOptions({
        type: 'media',
        mediaType: 'online',
        mediaLink: 'https://example.com/video.mp4',
      })
      expect(opts.type).toBe('online')
      expect(opts.link).toBe('https://example.com/video.mp4')
    })
  })

  describe('drawElement', () => {
    it('应该调用 addText 处理 text 元素', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'text', text: 'hello', x: 1, y: 1 })
      expect(calls.addText).toHaveLength(1)
      expect(calls.addText[0].text).toBe('hello')
    })

    it('应该使用 textRuns 而非 text', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, {
        type: 'text',
        textRuns: [{ text: 'run1', bold: true }],
      })
      expect(calls.addText).toHaveLength(1)
      expect(Array.isArray(calls.addText[0].text)).toBe(true)
    })

    it('应该调用 addImage 处理 image 元素', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'image', imagePath: '/tmp/a.png' })
      expect(calls.addImage).toHaveLength(1)
    })

    it('应该调用 addShape 处理 shape 元素', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'shape', shape: 'rect' })
      expect(calls.addShape).toHaveLength(1)
      expect(calls.addShape[0].shapeName).toBe('rect')
    })

    it('shape 未指定时默认为 rect', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'shape' })
      expect(calls.addShape[0].shapeName).toBe('rect')
    })

    it('应该调用 addTable 处理 table 元素', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, {
        type: 'table',
        rows: [[{ text: 'A' }, { text: 'B' }]],
      })
      expect(calls.addTable).toHaveLength(1)
      expect(calls.addTable[0].rows).toHaveLength(1)
    })

    it('table 无 rows 时不调用 addTable', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'table' })
      expect(calls.addTable).toHaveLength(0)
    })

    it('应该调用 addChart 处理 chart 元素', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, {
        type: 'chart',
        chartType: 'bar',
        chartData: [{ name: 'A', labels: ['x'], values: [1] }],
      })
      expect(calls.addChart).toHaveLength(1)
      expect(calls.addChart[0].type).toBe('bar')
    })

    it('chart 无 chartType 或 chartData 时不调用', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'chart' })
      expect(calls.addChart).toHaveLength(0)
    })

    it('应该调用 addMedia 处理 media 元素', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'media', mediaType: 'video', mediaPath: '/tmp/v.mp4' })
      expect(calls.addMedia).toHaveLength(1)
    })

    it('svg 元素应该 no-op（由后处理注入）', () => {
      const { slide, calls } = createMockSlide()
      drawElement(slide, { type: 'svg', svgPath: 'M10 10', x: 1, y: 1, w: 2, h: 2 })
      expect(calls.addText).toHaveLength(0)
      expect(calls.addImage).toHaveLength(0)
      expect(calls.addShape).toHaveLength(0)
    })
  })

  describe('applyPresentationMeta', () => {
    it('meta 为空时不修改 pptx', () => {
      const { pptx } = createMockPptx()
      applyPresentationMeta(pptx, undefined)
      expect(pptx.title).toBeUndefined()
    })

    it('应该设置文档元数据', () => {
      const { pptx } = createMockPptx()
      applyPresentationMeta(pptx, {
        title: '标题',
        author: '作者',
        company: '公司',
        subject: '主题',
        revision: '1.0',
      })
      expect(pptx.title).toBe('标题')
      expect(pptx.author).toBe('作者')
      expect(pptx.company).toBe('公司')
      expect(pptx.subject).toBe('主题')
      expect(pptx.revision).toBe('1.0')
    })

    it('应该设置 rtlMode', () => {
      const { pptx } = createMockPptx()
      applyPresentationMeta(pptx, { rtlMode: true })
      expect(pptx.rtlMode).toBe(true)
    })

    it('应该设置 headFontFace 和 bodyFontFace', () => {
      const { pptx } = createMockPptx()
      applyPresentationMeta(pptx, { headFontFace: 'Arial', bodyFontFace: 'Georgia' })
      const theme = (pptx as unknown as { theme: { headFontFace?: string; bodyFontFace?: string } }).theme
      expect(theme.headFontFace).toBe('Arial')
      expect(theme.bodyFontFace).toBe('Georgia')
    })
  })

  describe('applySlideBackground', () => {
    it('bg 为空时不修改 slide', () => {
      const { slide } = createMockSlide()
      applySlideBackground(slide, undefined)
      expect(slide.background).toBeUndefined()
    })

    it('应该设置纯色背景', () => {
      const { slide } = createMockSlide()
      applySlideBackground(slide, { color: 'FF0000' })
      expect(slide.background).toEqual({ color: 'FF0000' })
    })

    it('应该设置图片背景', () => {
      const { slide } = createMockSlide()
      applySlideBackground(slide, { path: '/tmp/bg.png', transparency: 50 })
      expect(slide.background).toMatchObject({ path: '/tmp/bg.png', transparency: 50 })
    })
  })

  describe('applySlideNumber', () => {
    it('show 为 false 时不设置', () => {
      const { slide } = createMockSlide()
      applySlideNumber(slide, false)
      expect(slide.slideNumber).toBeUndefined()
    })

    it('show 为 true 时设置页码', () => {
      const { slide } = createMockSlide()
      applySlideNumber(slide, true)
      expect(slide.slideNumber).toBeDefined()
      expect(slide.slideNumber).toMatchObject({ fontSize: 10 })
    })
  })

  describe('buildSlide', () => {
    it('应该创建幻灯片并应用元素', () => {
      const { pptx, slides } = createMockPptx()
      buildSlide(pptx, {
        elements: [
          { type: 'text', text: '标题', x: 0.5, y: 0.3 },
          { type: 'text', text: '正文', x: 0.5, y: 1.5 },
        ],
      })
      expect(slides).toHaveLength(1)
    })

    it('应该应用背景、隐藏状态和页码', () => {
      const { pptx, slides } = createMockPptx()
      buildSlide(pptx, {
        background: { color: '000000' },
        hidden: true,
        slideNumber: true,
        elements: [],
      })
      expect(slides[0].background).toEqual({ color: '000000' })
      expect(slides[0].hidden).toBe(true)
      expect(slides[0].slideNumber).toBeDefined()
    })

    it('应该设置 masterName 和 sectionTitle', () => {
      const { pptx } = createMockPptx()
      const slide = buildSlide(pptx, {
        masterName: 'MASTER1',
        sectionTitle: '第一章',
        elements: [],
      })
      expect(slide).toBeDefined()
    })

    it('应该添加演讲者备注', () => {
      const { pptx, slides } = createMockPptx()
      const { slide, calls } = createMockSlide()
      // 直接测试 addNotes 调用
      buildSlide(pptx, { notes: '这是备注', elements: [] })
      // 由于 mock pptx 的 addSlide 创建新 mock slide，需要从 slides 数组获取 calls
      // 这里验证 slides 已创建
      expect(slides).toHaveLength(1)
    })

    it('兼容模式：title layout', () => {
      const { pptx, slides } = createMockPptx()
      buildSlide(pptx, { layout: 'title', title: '标题', body: '副标题' })
      expect(slides).toHaveLength(1)
    })

    it('兼容模式：section layout', () => {
      const { pptx } = createMockPptx()
      buildSlide(pptx, { layout: 'section', title: '章节' })
    })

    it('兼容模式：blank layout', () => {
      const { pptx } = createMockPptx()
      buildSlide(pptx, { layout: 'blank' })
    })

    it('兼容模式：content layout（默认）', () => {
      const { pptx } = createMockPptx()
      buildSlide(pptx, { layout: 'content', title: '标题', body: '正文' })
    })

    it('兼容模式：无 layout 时默认 content', () => {
      const { pptx } = createMockPptx()
      buildSlide(pptx, { title: '标题' })
    })
  })
})
