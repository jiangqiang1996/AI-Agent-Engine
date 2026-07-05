import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import AdmZip from 'adm-zip'
import {
  validateAsvgPath,
  validateHexColor,
  buildSvgDocument,
  injectSvgElements,
  extractSvgSpecs,
  type SvgElementSpec,
} from '../../src/services/pptx-svg-injector.js'

const require = createRequire(import.meta.url)
const PptxGenJS = require('pptxgenjs') as new () => {
  layout: string
  addSlide(): {
    addText(text: string, opts?: Record<string, unknown>): void
    addImage(opts: Record<string, unknown>): void
  }
  write(opts: { outputType: string }): Promise<Buffer>
}

describe('pptx-svg-injector', () => {
  describe('validateAsvgPath', () => {
    it('应该通过合法的 SVG path 命令', () => {
      expect(validateAsvgPath('M10 10 L90 10 L90 90 L10 90 Z')).toBeNull()
      expect(validateAsvgPath('M0,0 C50,0 50,100 100,100')).toBeNull()
      expect(validateAsvgPath('m10,10 l80,0 l0,80 l-80,0 z')).toBeNull()
    })

    it('应该拒绝空路径', () => {
      expect(validateAsvgPath('')).toBe('SVG 路径数据为空')
      expect(validateAsvgPath('   ')).toBe('SVG 路径数据为空')
    })

    it('应该拒绝缺少 M 起始命令的路径', () => {
      expect(validateAsvgPath('L10 10 L90 10')).toContain('必须以 M 或 m 命令开始')
    })

    it('应该拒绝包含非法字符的路径', () => {
      const result = validateAsvgPath('M10 10 <script>alert(1)</script>')
      expect(result).toContain('非法字符')
    })

    it('应该拒绝包含双引号的路径（防止 XML 注入）', () => {
      const result = validateAsvgPath('M10 10" onload="alert(1)')
      expect(result).toContain('非法字符')
    })

    it('应该拒绝包含 < > = / 等 XML 特殊字符', () => {
      expect(validateAsvgPath('M0 0 L10 10<><>')).toContain('非法字符')
      expect(validateAsvgPath('M0 0 =')).toContain('非法字符')
      expect(validateAsvgPath('M0 0 / test')).toContain('非法字符')
    })

    it('应该拒绝超长路径（DoS 防护）', () => {
      const longPath = 'M10 10 ' + 'L20 20 '.repeat(2000)
      expect(validateAsvgPath(longPath)).toContain('过长')
    })
  })

  describe('validateHexColor', () => {
    it('应该通过合法 HEX 颜色', () => {
      expect(validateHexColor('FF0000', 'fill')).toBeNull()
      expect(validateHexColor('3B82F6', 'fill')).toBeNull()
      expect(validateHexColor('FFF', 'fill')).toBeNull()
      expect(validateHexColor('FFAABBCC', 'fill')).toBeNull()
    })

    it('应该通过 undefined 和空字符串', () => {
      expect(validateHexColor(undefined, 'fill')).toBeNull()
      expect(validateHexColor('', 'fill')).toBeNull()
    })

    it('应该拒绝非 HEX 字符串', () => {
      expect(validateHexColor('red', 'fill')).toContain('不是合法 HEX')
      expect(validateHexColor('GGG', 'fill')).toContain('不是合法 HEX')
      expect(validateHexColor('ff0000"><script>', 'fill')).toContain('不是合法 HEX')
    })
  })

  describe('buildSvgDocument', () => {
    it('应该构建包含 path 和 fill 的 SVG 文档', () => {
      const spec: SvgElementSpec = {
        slideIndex: 0,
        x: 1, y: 1, w: 2, h: 2,
        svgPath: 'M10 10 L90 10 L90 90 L10 90 Z',
        fill: 'FF0000',
      }
      const svg = buildSvgDocument(spec)
      expect(svg).toContain('<svg')
      expect(svg).toContain('viewBox="0 0 100 100"')
      expect(svg).toContain('d="M10 10 L90 10 L90 90 L10 90 Z"')
      expect(svg).toContain('fill="#FF0000"')
    })

    it('应该支持自定义 viewBox', () => {
      const spec: SvgElementSpec = {
        slideIndex: 0,
        x: 1, y: 1, w: 2, h: 2,
        svgPath: 'M0 0 L24 0 L24 24 L0 24 Z',
        viewBoxW: 24,
        viewBoxH: 24,
      }
      const svg = buildSvgDocument(spec)
      expect(svg).toContain('viewBox="0 0 24 24"')
    })

    it('应该支持 stroke 和 strokeWidth', () => {
      const spec: SvgElementSpec = {
        slideIndex: 0,
        x: 1, y: 1, w: 2, h: 2,
        svgPath: 'M10 10 L90 10',
        stroke: '0000FF',
        strokeWidth: 2,
      }
      const svg = buildSvgDocument(spec)
      expect(svg).toContain('stroke="#0000FF"')
      expect(svg).toContain('stroke-width="2"')
      expect(svg).toContain('fill="none"')
    })

    it('应该拒绝非法 HEX 颜色并回退到 fill=none', () => {
      const spec: SvgElementSpec = {
        slideIndex: 0,
        x: 1, y: 1, w: 2, h: 2,
        svgPath: 'M10 10 L90 10',
        fill: 'red"><script>',
      }
      const svg = buildSvgDocument(spec)
      expect(svg).toContain('fill="none"')
      expect(svg).not.toContain('<script>')
    })

    it('应该拒绝负数 strokeWidth', () => {
      const spec: SvgElementSpec = {
        slideIndex: 0,
        x: 1, y: 1, w: 2, h: 2,
        svgPath: 'M10 10 L90 10',
        stroke: '0000FF',
        strokeWidth: -1,
      }
      const svg = buildSvgDocument(spec)
      expect(svg).not.toContain('stroke-width')
    })
  })

  describe('injectSvgElements', () => {
    it('应该跳过空 SVG 元素列表', () => {
      const buffer = Buffer.alloc(0)
      const result = injectSvgElements(buffer, [])
      expect(result.result.injectedCount).toBe(0)
    })

    it('应该跳过无效的 SVG 路径', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        { slideIndex: 0, x: 1, y: 1, w: 2, h: 2, svgPath: '' },
      ]
      const result = injectSvgElements(buffer, specs)
      expect(result.result.injectedCount).toBe(0)
      expect(result.result.skipped.length).toBe(1)
      expect(result.result.skipped[0].reason).toContain('为空')
    })

    it('应该跳过非法 HEX 颜色', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 0, x: 1, y: 1, w: 2, h: 2,
          svgPath: 'M10 10 L90 10',
          fill: 'red"><script>alert(1)</script>',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      expect(result.result.injectedCount).toBe(0)
      expect(result.result.skipped.length).toBe(1)
      expect(result.result.skipped[0].reason).toContain('不是合法 HEX')
    })

    it('应该跳过不存在的幻灯片索引', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 99, x: 1, y: 1, w: 2, h: 2,
          svgPath: 'M10 10 L90 10 L90 90 L10 90 Z',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      expect(result.result.injectedCount).toBe(0)
      expect(result.result.skipped.length).toBe(1)
      expect(result.result.skipped[0].reason).toContain('不存在')
    })

    it('应该成功注入合法 SVG 元素到真实 PptxGenJS 生成的 PPTX', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 0, x: 1, y: 1, w: 3, h: 3,
          svgPath: 'M10 10 L90 10 L90 90 L10 90 Z',
          fill: '3B82F6',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      expect(result.result.injectedCount).toBe(1)
      expect(result.result.skipped.length).toBe(0)
      // 验证 ZIP 结构而非 buffer 长度（AdmZip 重新压缩可能更小）
      const zip = new AdmZip(result.buffer)
      expect(zip.getEntries().some(e => e.entryName.match(/^ppt\/media\/image\d+\.svg$/))).toBe(true)
      expect(zip.getEntries().some(e => e.entryName.match(/^ppt\/media\/image\d+\.png$/))).toBe(true)
    })

    it('注入后应该包含 ASVG 扩展 XML 和正确的 rels Target 路径', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 0, x: 1, y: 1, w: 3, h: 3,
          svgPath: 'M10 10 L90 10 L90 90 L10 90 Z',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      const zip = new AdmZip(result.buffer)

      const contentTypes = zip.readAsText('[Content_Types].xml')
      expect(contentTypes).toContain('Extension="svg"')
      expect(contentTypes).toContain('image/svg+xml')

      const slide1 = zip.readAsText('ppt/slides/slide1.xml')
      expect(slide1).toContain('asvg:svgBlip')
      expect(slide1).toContain('96DAC541-7B7A-43D3-8B79-37D633B846F1')
      expect(slide1).toContain('useLocalDpi')
      expect(slide1).toContain('noChangeAspect')

      // 验证 rels Target 使用相对路径 ../media/ 而非 ZIP 内部路径
      const rels = zip.readAsText('ppt/slides/_rels/slide1.xml.rels')
      expect(rels).toContain('Target="../media/image')
      expect(rels).not.toContain('Target="ppt/media/')

      const entries = zip.getEntries().map(e => e.entryName)
      expect(entries.some(e => e.match(/^ppt\/media\/image\d+\.svg$/))).toBe(true)
      expect(entries.some(e => e.match(/^ppt\/media\/image\d+\.png$/))).toBe(true)
    })

    it('应该验证 EMU 单位转换正确性', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        { slideIndex: 0, x: 1, y: 2, w: 3, h: 4, svgPath: 'M10 10 L90 10' },
      ]
      const result = injectSvgElements(buffer, specs)
      const zip = new AdmZip(result.buffer)
      const slide1 = zip.readAsText('ppt/slides/slide1.xml')
      expect(slide1).toContain('x="914400"')
      expect(slide1).toContain('y="1828800"')
      expect(slide1).toContain('cx="2743200"')
      expect(slide1).toContain('cy="3657600"')
    })

    it('应该支持多页 SVG 注入', async () => {
      const buffer = await createRealMultiSlidePptxBuffer()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 0, x: 1, y: 1, w: 2, h: 2,
          svgPath: 'M10 10 L90 10 L90 90 L10 90 Z',
          fill: 'FF0000',
        },
        {
          slideIndex: 1, x: 2, y: 2, w: 3, h: 3,
          svgPath: 'M0 0 L100 0 L50 100 Z',
          fill: '00FF00',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      expect(result.result.injectedCount).toBe(2)
      expect(result.result.skipped.length).toBe(0)
    })

    it('同一 slide 上多个 SVG 元素应该分配唯一 cNvPr id 和递增 rId', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 0, x: 1, y: 1, w: 2, h: 2,
          svgPath: 'M10 10 L90 10 L90 90 L10 90 Z',
          fill: 'FF0000',
        },
        {
          slideIndex: 0, x: 4, y: 1, w: 2, h: 2,
          svgPath: 'M0 0 L100 0 L50 100 Z',
          fill: '00FF00',
        },
        {
          slideIndex: 0, x: 7, y: 1, w: 2, h: 2,
          svgPath: 'M0 0 L50 100 L100 0 Z',
          fill: '0000FF',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      expect(result.result.injectedCount).toBe(3)

      const zip = new AdmZip(result.buffer)
      const slide1 = zip.readAsText('ppt/slides/slide1.xml')

      // 提取所有 cNvPr id >= 1000（SVG 元素专用区间）
      const idMatches = [...slide1.matchAll(/id="(\d+)"/g)]
      const svgIds = idMatches.map(m => parseInt(m[1], 10)).filter(id => id >= 1000)
      expect(svgIds.length).toBe(3)
      expect(new Set(svgIds).size).toBe(3)

      // 验证 rels 中 rId 唯一性
      const rels = zip.readAsText('ppt/slides/_rels/slide1.xml.rels')
      const rIdMatches = [...rels.matchAll(/Id="rId(\d+)"/g)]
      const rIds = rIdMatches.map(m => parseInt(m[1], 10))
      expect(rIds.length).toBeGreaterThanOrEqual(6)
      expect(new Set(rIds).size).toBe(rIds.length)
    })

    it('media 编号应该从已有最大值+1 开始避免冲突', async () => {
      const buffer = await createRealPptxBufferWithMedia()
      const specs: SvgElementSpec[] = [
        {
          slideIndex: 0, x: 1, y: 1, w: 2, h: 2,
          svgPath: 'M10 10 L90 10',
        },
      ]
      const result = injectSvgElements(buffer, specs)
      const zip = new AdmZip(result.buffer)
      const entries = zip.getEntries().map(e => e.entryName)

      // PptxGenJS 已分配 image1.png，手动添加了 image3.png，新文件应从 image4 开始
      expect(entries.some(e => e === 'ppt/media/image4.png')).toBe(true)
      expect(entries.some(e => e === 'ppt/media/image5.svg')).toBe(true)
    })

    it('ensureSvgContentType 幂等：二次注入不重复注册 svg 扩展', async () => {
      const buffer = await createRealPptxBuffer()
      const specs: SvgElementSpec[] = [
        { slideIndex: 0, x: 1, y: 1, w: 2, h: 2, svgPath: 'M10 10 L90 10' },
      ]
      // 第一次注入
      const result1 = injectSvgElements(buffer, specs)
      // 第二次注入到已含 svg 的 PPTX
      const result2 = injectSvgElements(result1.buffer, specs)

      const zip = new AdmZip(result2.buffer)
      const contentTypes = zip.readAsText('[Content_Types].xml')
      // 应该只有一个 svg Default
      const svgCount = (contentTypes.match(/Extension="svg"/g) || []).length
      expect(svgCount).toBe(1)
    })
  })

  describe('extractSvgSpecs', () => {
    it('应该从幻灯片元素中提取 SVG 规格', () => {
      const slides = [
        {
          elements: [
            { type: 'text', text: '标题' },
            { type: 'svg', x: 1, y: 1, w: 2, h: 2, svgPath: 'M10 10 L90 10 Z', svgFill: 'FF0000' },
          ],
        },
        {
          elements: [
            { type: 'svg', x: 3, y: 3, w: 4, h: 4, svgPath: 'M0 0 L100 100', stroke: '0000FF' },
          ],
        },
      ]
      const { specs, skipped } = extractSvgSpecs(slides)
      expect(specs.length).toBe(2)
      expect(skipped.length).toBe(0)
      expect(specs[0].slideIndex).toBe(0)
      expect(specs[0].svgPath).toBe('M10 10 L90 10 Z')
      expect(specs[0].fill).toBe('FF0000')
      expect(specs[1].slideIndex).toBe(1)
      expect(specs[1].stroke).toBe('0000FF')
    })

    it('应该报告缺少必需字段的 SVG 元素而非静默跳过', () => {
      const slides = [
        {
          elements: [
            { type: 'svg', x: 1, y: 1, w: 2, h: 2 },
            { type: 'svg', x: 1, y: undefined, w: 2, h: 2, svgPath: 'M10 10' },
          ],
        },
      ]
      const { specs, skipped } = extractSvgSpecs(slides)
      expect(specs.length).toBe(0)
      expect(skipped.length).toBe(2)
      expect(skipped[0].reason).toContain('svgPath')
      expect(skipped[1].reason).toContain('y')
    })

    it('应该正确处理字符串类型的坐标值', () => {
      const slides = [
        {
          elements: [
            { type: 'svg', x: '1.5', y: '2.5', w: '3', h: '4', svgPath: 'M10 10 L90 90' },
          ],
        },
      ]
      const { specs, skipped } = extractSvgSpecs(slides)
      expect(specs.length).toBe(1)
      expect(skipped.length).toBe(0)
      expect(specs[0].x).toBe(1.5)
      expect(specs[0].y).toBe(2.5)
      expect(specs[0].w).toBe(3)
      expect(specs[0].h).toBe(4)
    })

    it('应该报告 NaN 字符串坐标', () => {
      const slides = [
        {
          elements: [
            { type: 'svg', x: 'abc', y: 1, w: 2, h: 2, svgPath: 'M10 10' },
          ],
        },
      ]
      const { specs, skipped } = extractSvgSpecs(slides)
      expect(specs.length).toBe(0)
      expect(skipped.length).toBe(1)
      expect(skipped[0].reason).toContain('x')
    })

    it('应该忽略非 SVG 元素', () => {
      const slides = [
        {
          elements: [
            { type: 'text', text: '标题' },
            { type: 'image', imagePath: 'test.png', x: 1, y: 1, w: 2, h: 2 },
            { type: 'svg', x: 1, y: 1, w: 2, h: 2, svgPath: 'M10 10 L90 90' },
          ],
        },
      ]
      const { specs, skipped } = extractSvgSpecs(slides)
      expect(specs.length).toBe(1)
      expect(skipped.length).toBe(0)
      expect(specs[0].svgPath).toBe('M10 10 L90 90')
    })

    it('应该处理无 elements 的幻灯片', () => {
      const slides = [{}, { elements: [] }]
      const { specs, skipped } = extractSvgSpecs(slides)
      expect(specs.length).toBe(0)
      expect(skipped.length).toBe(0)
    })
  })
})

// ==================== 测试辅助函数 ====================

/** 使用真实 PptxGenJS 生成 PPTX Buffer */
async function createRealPptxBuffer(): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const slide = pptx.addSlide()
  slide.addText('Test Slide', { x: 1, y: 1, w: 8, h: 1 })
  return await pptx.write({ outputType: 'nodebuffer' }) as Buffer
}

/** 使用真实 PptxGenJS 生成含 2 张幻灯片的 PPTX Buffer */
async function createRealMultiSlidePptxBuffer(): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.addSlide().addText('Slide 1', { x: 1, y: 1, w: 8, h: 1 })
  pptx.addSlide().addText('Slide 2', { x: 1, y: 1, w: 8, h: 1 })
  return await pptx.write({ outputType: 'nodebuffer' }) as Buffer
}

/** 创建含已有 media 文件的 PPTX Buffer（测试 media 编号冲突避免） */
async function createRealPptxBufferWithMedia(): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  const slide = pptx.addSlide()
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  slide.addImage({ data: 'image/png;base64,' + pngBase64, x: 1, y: 1, w: 2, h: 2 })
  const buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer

  // 手动添加 image3.png 模拟已有更多 media
  const zip = new AdmZip(buffer)
  zip.addFile('ppt/media/image3.png', Buffer.from(pngBase64, 'base64'))
  return zip.toBuffer()
}
