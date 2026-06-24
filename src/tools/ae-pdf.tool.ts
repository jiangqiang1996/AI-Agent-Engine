import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { processPdf } from '../services/pdf-service.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

const colorSchema = z
  .object({
    r: z.number().min(0).max(1).describe('红色分量，0-1 范围'),
    g: z.number().min(0).max(1).describe('绿色分量，0-1 范围'),
    b: z.number().min(0).max(1).describe('蓝色分量，0-1 范围'),
  })
  .describe('RGB 颜色，分量范围 0-1')

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
  ])
  .describe('标准字体名称（WinAnsi 编码，不支持 CJK）')

const pageElementSchema = z
  .object({
    type: z
      .enum(['text', 'rect', 'ellipse', 'line', 'image'])
      .describe('元素类型'),
    text: z.string().optional().describe('文本内容，支持换行（text 类型使用）'),
    x: z.number().optional().describe('起始 x 坐标（pt）'),
    y: z.number().optional().describe('起始 y 坐标（pt）'),
    fontSize: z.number().optional().describe('字号，默认 12（text 类型使用）'),
    font: fontNameSchema.optional().describe('字体，默认 Helvetica'),
    color: colorSchema.optional().describe('文本/线条颜色'),
    lineHeight: z.number().optional().describe('行高（pt），默认字号 +6'),
    width: z.number().optional().describe('宽度（pt），rect/ellipse 使用'),
    height: z.number().optional().describe('高度（pt），rect/ellipse 使用'),
    borderColor: colorSchema.optional().describe('边框颜色'),
    borderWidth: z.number().optional().describe('边框宽度（pt）'),
    fillColor: colorSchema.optional().describe('填充颜色'),
    opacity: z.number().min(0).max(1).optional().describe('不透明度，0-1'),
    x2: z.number().optional().describe('终点 x 坐标（line 类型使用）'),
    y2: z.number().optional().describe('终点 y 坐标（line 类型使用）'),
    thickness: z.number().optional().describe('线条粗细（pt），默认 1'),
    imagePath: z.string().optional().describe('本地图片路径（JPG/PNG）'),
    imageData: z.string().optional().describe('base64 图片数据，支持 data URI 前缀'),
    imageWidth: z.number().optional().describe('图片绘制宽度（pt）'),
    imageHeight: z.number().optional().describe('图片绘制高度（pt）'),
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
    '- 用户确认后再调用本工具',
    '',
    '适用场景：',
    '- 用户明确要求创建、合并、拆分、提取文本、填写表单、旋转、删除页面或添加水印',
    '',
    '不适用场景：',
    '- 只需读取 PDF 内容转为 Markdown 时，使用 ae:markitdown',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
    '- 不支持加密 PDF',
    '- 标准字体为 WinAnsi 编码，不支持中文、日文、韩文等 CJK 字符',
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
      ])
      .describe('操作类型'),
    file: z
      .string()
      .optional()
      .describe('现有 PDF 文件路径（split/extract-text/fill-form/rotate-pages/delete-pages/add-watermark 操作必填）'),
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
      .optional()
      .describe('页面数组（create 操作必填），每页可含 elements 元素列表或 text 整页文本'),
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
      .describe('自定义输出路径；省略时自动生成到 ae/documents/pdf/'),
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
        fields: args.fields,
        metadata: args.metadata,
        rotation: args.rotation,
        pageIndices: args.pageIndices,
        watermark: args.watermark,
        outputPath: args.outputPath,
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
