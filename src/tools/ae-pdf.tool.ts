import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { processPdf } from '../services/pdf-service.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

const colorSchema = z
  .object({
    r: z.number().min(0).max(1).describe('红色分量，0-1 范围（非 0-255！红色为 {r:1,g:0,b:0}）'),
    g: z.number().min(0).max(1).describe('绿色分量，0-1 范围（非 0-255！绿色为 {r:0,g:1,b:0}）'),
    b: z.number().min(0).max(1).describe('蓝色分量，0-1 范围（非 0-255！蓝色为 {r:0,g:0,b:1}）'),
  })
  .describe('RGB 颜色，分量范围 0-1（不是 0-255！红色={r:1,g:0,b:0}，黑色={r:0,g:0,b:0}，白色={r:1,g:1,b:1}）')

const fontNameSchema = z
  .enum([
    'Helvetica',
    'HelveticaBold',
    'HelveticaOblique',
    'HelveticaBoldOblique',
    'TimesRoman',
    'TimesRomanBold',
    'TimesRomanItalic',
    'TimesRomanBoldItalic',
    'Courier',
    'CourierBold',
    'CourierOblique',
    'CourierBoldOblique',
    'NotoSansSC',
    'NotoSansSCBold',
    'SimHei',
    'MSYH',
    'MSYHBD',
  ])
  .describe('字体名称：Helvetica(默认)/HelveticaBold/HelveticaOblique/HelveticaBoldOblique/TimesRoman(含Bold/Italic/BoldItalic)/Courier(含Bold/Oblique/BoldOblique) 或 CJK 字体 NotoSansSC/NotoSansSCBold/SimHei/MSYH/MSYHBD（需系统安装对应字体文件）')

const pageElementSchema = z
  .object({
    type: z
      .enum(['text', 'rect', 'ellipse', 'line', 'image'])
      .describe('元素类型'),
    text: z.string().optional().describe('文本内容，支持换行（text 类型使用）'),
    x: z.number().optional().describe('起始 x 坐标（pt），PDF 坐标系 y=0 在页面底部！未指定时文本默认 50，rect/ellipse/line 默认 0'),
    y: z.number().optional().describe('起始 y 坐标（pt），PDF 坐标系 y=0 在页面底部！A4 页面高度 841.89pt，文字从顶部开始 y≈792。未指定时文本默认 pageHeight-50'),
    fontSize: z.number().min(1).max(200).optional().describe('字号（pt），默认 12（text 类型使用），建议范围 8-72'),
    font: fontNameSchema.optional().describe('字体，默认 Helvetica（含 CJK 字符时自动切换 NotoSansSC）'),
    color: colorSchema.optional().describe('文本/线条颜色，默认黑色 {r:0,g:0,b:0}'),
    lineHeight: z.number().min(1).optional().describe('行高（pt），默认 fontSize+6（text 类型使用）'),
    width: z.number().min(1).optional().describe('宽度（pt），rect/ellipse 使用'),
    height: z.number().min(1).optional().describe('高度（pt），rect/ellipse 使用'),
    borderColor: colorSchema.optional().describe('边框颜色'),
    borderWidth: z.number().min(0).optional().describe('边框宽度（pt）'),
    fillColor: colorSchema.optional().describe('填充颜色'),
    opacity: z.number().min(0).max(1).optional().describe('不透明度，0-1'),
    x2: z.number().optional().describe('终点 x 坐标（pt，line 类型使用）'),
    y2: z.number().optional().describe('终点 y 坐标（pt，line 类型使用）'),
    thickness: z.number().min(0).optional().describe('线条粗细（pt），默认 1'),
    imagePath: z.string().optional().describe('本地图片路径（JPG/PNG），仅当前工作区内的文件'),
    imageData: z.string().optional().describe('base64 图片数据，支持 data URI 前缀'),
    imageWidth: z.number().min(1).optional().describe('图片绘制宽度（pt），默认使用图片原始宽度'),
    imageHeight: z.number().min(1).optional().describe('图片绘制高度（pt），默认使用图片原始高度'),
  })
  .describe('页面元素')

const pageSizeSchema = z
  .union([z.enum(['A4', 'Letter', 'Legal']), z.tuple([z.number(), z.number()])])
  .describe('页面尺寸：预设或自定义 [宽, 高]（pt）')

const pageSpecSchema = z
  .object({
    elements: z.array(pageElementSchema).optional().describe('元素化绘制列表'),
    text: z.string().optional().describe('整页文本，支持换行（兼容旧模式）'),
    fontSize: z.number().optional().describe('字号，默认 12（兼容旧模式）'),
    size: pageSizeSchema.optional().describe('页面尺寸，默认 A4'),
  })
  .describe('页面规格')

const metadataSchema = z
  .object({
    title: z.string().optional().describe('文档标题'),
    author: z.string().optional().describe('作者'),
    subject: z.string().optional().describe('主题'),
    keywords: z.array(z.string()).optional().describe('关键词列表'),
    creator: z.string().optional().describe('创建者'),
    producer: z.string().optional().describe('生产者'),
    creationDate: z.string().optional().describe('创建日期（ISO 8601 格式，如 2024-01-15T10:30:00Z）'),
    modificationDate: z.string().optional().describe('修改日期（ISO 8601 格式）'),
  })
  .optional()
  .describe('PDF 文档元数据')

const watermarkSchema = z
  .object({
    text: z.string().describe('水印文本'),
    fontSize: z.number().optional().describe('字号，默认 50'),
    color: colorSchema.optional().describe('水印颜色，默认灰色'),
    opacity: z.number().min(0).max(1).optional().describe('不透明度，默认 0.3'),
    rotation: z.number().optional().describe('旋转角度，默认 45'),
  })
  .describe('水印配置')

export const aePdfTool = tool({
  description: [
    '创建、合并、拆分、提取文本、填写表单、旋转、删除页面或添加水印的 PDF 工具。',
    '',
    '功能说明：',
    '- create：创建 PDF，支持元素化页面（文本/矩形/椭圆/直线/图片）、多字体、颜色、页面尺寸和元数据',
    '- merge：合并多个 PDF 文件为一个',
    '- split：将 PDF 拆分为单页文件',
    '- extract-text：提取 PDF 的文本内容',
    '- fill-form：填写 PDF 表单字段（支持文本框和复选框）',
    '- rotate-pages：旋转页面（90/180/270 度），可指定页码',
    '- delete-pages：删除指定页面',
    '- add-watermark：为所有页面添加文本水印（可配置字号、颜色、不透明度、旋转）',
    '- add-pages：向已有 PDF 追加新页面，页面结构与 create 的 pages 相同',
    '- update-page：在已有 PDF 的指定页面上叠加绘制新元素（文本/矩形/椭圆/直线/图片）',
    '- to-markdown：将 PDF 内容完整转换为 Markdown，自动识别表格和表单结构',
    '',
    'CJK 字体支持：',
    '- 支持 NotoSansSC、NotoSansSCBold、SimHei、MSYH、MSYHBD 五种 CJK 字体',
    '- CJK 字体从系统字体目录自动发现，也可通过 cjkFontPath 指定自定义字体文件路径',
    '- 未指定 font 的文本元素会自动检测是否含 CJK 字符并切换到对应 CJK 字体',
    '',
    '增量操作策略：',
    '- 大型 PDF（>5 页）：先用 create 创建初始页面，再用 add-pages 分批追加后续页面',
    '- 需在已有页面上添加元素：使用 update-page 而非重新 create',
    '- add-pages 可多次调用，每次追加一批页面',
    '',
    '输出：',
    '- 生成文件自动写入 `ae/documents/pdf/` 子目录',
    '- 文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.pdf`',
    '- split 操作输出多个文件，路径通过 metadata.outputPaths 返回',
    '',
    '预览确认工作流：',
    '- create 操作前，必须先向用户展示页面大纲（每页元素或文本摘要）',
    '- merge 操作前，必须先向用户展示文件列表和合并顺序',
    '- fill-form 操作前，必须先向用户展示字段填写对照表（字段名 → 值）',
    '- add-pages 操作前，必须先向用户展示追加页面大纲',
    '- update-page 操作前，必须先向用户展示新增元素列表和目标页码',
    '- 用户确认后再调用本工具',
    '',
    '适用场景：',
    '- 用户明确要求创建、合并、拆分、提取文本、填写表单、旋转、删除页面、添加水印、追加页面或局部更新',
    '',
    '不适用场景：',
    '- 只需读取 PDF 内容转为 Markdown 时，使用 to-markdown 操作',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持加密 PDF',
  ].join('\n'),
  args: {
    operation: z
      .enum([
        'create',
        'merge',
        'split',
        'extract-text',
        'fill-form',
        'rotate-pages',
        'delete-pages',
        'add-watermark',
        'add-pages',
        'update-page',
        'to-markdown',
      ])
      .describe('操作类型'),
    file: z
      .string()
      .optional()
      .describe('现有 PDF 文件路径（add-pages/update-page/split/extract-text/fill-form/rotate-pages/delete-pages/add-watermark 操作必填）'),
    files: z
      .array(z.string())
      .optional()
      .describe('要合并的 PDF 文件路径列表（merge 操作必填）'),
    title: z
      .string()
      .optional()
      .describe('PDF 标题（create 操作可选，等价于 metadata.title）'),
    pages: z
      .array(pageSpecSchema)
      .max(30, '单次页面数量上限 30，超过时请分批追加：先用 create 创建初始页面，再用 add-pages 分批追加')
      .optional()
      .describe('页面数组（create/add-pages 操作必填）。单次上限 30 页，超过时请分批追加'),
    elements: z
      .array(pageElementSchema)
      .optional()
      .describe('元素数组（update-page 操作必填），在目标页面上叠加绘制的新元素'),
    pageIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('目标页面索引（0-based，update-page 操作必填）'),
    fields: z
      .array(
        z.object({
          name: z.string().describe('表单字段名，需与 PDF 表单字段名一致'),
          value: z.string().describe('字段值'),
        }),
      )
      .optional()
      .describe('表单字段填写列表（fill-form 操作必填）'),
    metadata: metadataSchema,
    rotation: z
      .union([z.literal(90), z.literal(180), z.literal(270)])
      .optional()
      .describe('旋转角度（rotate-pages 操作使用），可选 90/180/270，默认 90'),
    pageIndices: z
      .array(z.number().int().min(0))
      .optional()
      .describe('要操作的页码索引（0-based），rotate-pages/delete-pages 使用；省略时操作全部页面'),
    watermark: watermarkSchema
      .optional()
      .describe('水印配置（add-watermark 操作必填）'),
    outputPath: z
      .string()
      .optional()
      .describe('自定义输出路径；to-markdown 的 outputMode=file 时写入此路径或 ae/markdown/，其余操作写入 ae/documents/pdf/'),
    cjkFontPath: z
      .string()
      .optional()
      .describe('自定义 CJK 字体文件路径（.ttf 或 .otf），用于覆盖默认系统字体搜索；仅对 CJK 字体和含 CJK 字符的文本生效'),
    outputMode: z
      .enum(['file', 'inline'])
      .optional()
      .describe('to-markdown 输出模式：file 写入文件（默认），inline 直接返回内容不写文件'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `PDF ${args.operation}`, metadata: { operation: args.operation } })

    try {
      const result = await processPdf({
        operation: args.operation,
        worktree: ctx.worktree,
        file: args.file,
        files: args.files,
        title: args.title,
        pages: args.pages,
        elements: args.elements,
        pageIndex: args.pageIndex,
        fields: args.fields,
        metadata: args.metadata,
        rotation: args.rotation,
        pageIndices: args.pageIndices,
        watermark: args.watermark,
        outputPath: args.outputPath,
        cjkFontPath: args.cjkFontPath,
        outputMode: args.outputMode,
      })

      return {
        output: result.summary + (result.content ? `\n\n${result.content}` : ''),
        metadata: {
          tool: TOOL.AE_PDF,
          operation: args.operation,
          outputPath: result.outputPath,
          outputPaths: result.outputPaths,
          summary: result.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('PDF', error)
    }
  },
})
