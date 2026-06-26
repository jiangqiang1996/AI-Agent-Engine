import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { processPptx } from '../services/pptx-service.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

// ==================== 通用样式 Schema ====================

const bulletSchema = z.object({
  type: z.enum(['bullet', 'number']).optional().describe('项目符号类型'),
  characterCode: z.string().optional().describe('自定义符号字符码'),
  indent: z.number().optional().describe('缩进级别'),
  numberType: z.string().optional().describe('编号类型，如 alphaUpper、romanLower'),
  numberStartAt: z.number().optional().describe('编号起始值'),
}).describe('项目符号配置')

const hyperlinkSchema = z.object({
  url: z.string().optional().describe('超链接 URL'),
  slide: z.number().optional().describe('跳转到的幻灯片页码'),
  tooltip: z.string().optional().describe('超链接提示文本'),
}).describe('超链接配置')

const shapeFillSchema = z.object({
  color: z.string().optional().describe('填充颜色 HEX 值，如 FF0000'),
  transparency: z.number().optional().describe('透明度 0-100'),
  type: z.enum(['none', 'solid']).optional().describe('填充类型'),
}).describe('形状填充')

const borderSchema = z.object({
  type: z.enum(['none', 'dash', 'solid']).optional().describe('边框类型'),
  color: z.string().optional().describe('边框颜色 HEX 值'),
  pt: z.number().optional().describe('边框粗细（磅）'),
}).describe('单边边框')

const shapeLineSchema = shapeFillSchema.extend({
  width: z.number().optional().describe('线条宽度'),
  dashType: z.enum(['solid', 'dash', 'dashDot', 'lgDash', 'lgDashDot', 'lgDashDotDot', 'sysDash', 'sysDot']).optional().describe('虚线类型'),
  beginArrowType: z.enum(['none', 'arrow', 'diamond', 'oval', 'stealth', 'triangle']).optional().describe('起点箭头类型'),
  endArrowType: z.enum(['none', 'arrow', 'diamond', 'oval', 'stealth', 'triangle']).optional().describe('终点箭头类型'),
}).describe('形状线条')

const shadowSchema = z.object({
  type: z.enum(['outer', 'inner', 'none']).optional().describe('阴影类型'),
  opacity: z.number().optional().describe('不透明度 0-1'),
  blur: z.number().optional().describe('模糊半径（磅）'),
  angle: z.number().optional().describe('阴影角度（度）'),
  offset: z.number().optional().describe('阴影偏移（磅）'),
  color: z.string().optional().describe('阴影颜色 HEX 值'),
  rotateWithShape: z.boolean().optional().describe('是否随形状旋转'),
}).describe('阴影配置')

const backgroundSchema = z.object({
  color: z.string().optional().describe('背景颜色 HEX 值'),
  transparency: z.number().optional().describe('透明度 0-100'),
  path: z.string().optional().describe('背景图片路径'),
  data: z.string().optional().describe('背景图片 Base64 数据'),
}).describe('幻灯片背景')

// ==================== 文本运行 Schema ====================

const textRunSchema = z.object({
  text: z.string().describe('文本内容'),
  bold: z.boolean().optional().describe('粗体'),
  italic: z.boolean().optional().describe('斜体'),
  fontSize: z.number().optional().describe('字号'),
  color: z.string().optional().describe('颜色 HEX 值'),
  fontFace: z.string().optional().describe('字体名称'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('对齐方式'),
  valign: z.enum(['top', 'middle', 'bottom']).optional().describe('垂直对齐'),
  breakLine: z.boolean().optional().describe('是否在此运行后换行'),
  bullet: z.union([z.boolean(), bulletSchema]).optional().describe('项目符号'),
  underline: z.object({
    style: z.string().optional().describe('下划线样式'),
    color: z.string().optional().describe('下划线颜色'),
  }).optional().describe('下划线'),
  strike: z.union([z.boolean(), z.string()]).optional().describe('删除线'),
  subscript: z.boolean().optional().describe('下标'),
  superscript: z.boolean().optional().describe('上标'),
  highlight: z.string().optional().describe('高亮颜色 HEX 值'),
  charSpacing: z.number().optional().describe('字符间距'),
  hyperlink: hyperlinkSchema.optional().describe('超链接'),
  lang: z.string().optional().describe('语言代码'),
}).describe('富文本运行')

// ==================== 表格 Schema ====================

const tableCellSchema = z.object({
  text: z.string().optional().describe('单元格文本'),
  rowspan: z.number().optional().describe('跨行数'),
  colspan: z.number().optional().describe('跨列数'),
  fill: shapeFillSchema.optional().describe('单元格填充'),
  border: z.union([borderSchema, z.tuple([borderSchema, borderSchema, borderSchema, borderSchema])]).optional().describe('单元格边框'),
  bold: z.boolean().optional().describe('粗体'),
  italic: z.boolean().optional().describe('斜体'),
  fontSize: z.number().optional().describe('字号'),
  color: z.string().optional().describe('颜色 HEX 值'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('对齐方式'),
  valign: z.enum(['top', 'middle', 'bottom']).optional().describe('垂直对齐'),
  hyperlink: hyperlinkSchema.optional().describe('超链接'),
  margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional().describe('内边距'),
}).describe('表格单元格')

// ==================== 图片尺寸 Schema ====================

const imageSizingSchema = z.object({
  type: z.enum(['contain', 'cover', 'crop']).describe('尺寸调整类型'),
  w: z.union([z.number(), z.string()]).describe('宽度'),
  h: z.union([z.number(), z.string()]).describe('高度'),
  x: z.union([z.number(), z.string()]).optional().describe('X 坐标'),
  y: z.union([z.number(), z.string()]).optional().describe('Y 坐标'),
}).describe('图片尺寸调整')

// ==================== 元素 Schema ====================

const elementBaseFields = {
  x: z.union([z.number(), z.string()]).optional().describe('X 坐标（英寸或百分比字符串）'),
  y: z.union([z.number(), z.string()]).optional().describe('Y 坐标'),
  w: z.union([z.number(), z.string()]).optional().describe('宽度'),
  h: z.union([z.number(), z.string()]).optional().describe('高度'),
}

const textElementSchema = z.object({
  type: z.literal('text').describe('元素类型：文本'),
  ...elementBaseFields,
  text: z.string().optional().describe('纯文本内容（与 textRuns 二选一）'),
  textRuns: z.array(textRunSchema).optional().describe('富文本运行数组（与 text 二选一）'),
  fontSize: z.number().optional().describe('字号'),
  bold: z.boolean().optional().describe('粗体'),
  italic: z.boolean().optional().describe('斜体'),
  color: z.string().optional().describe('颜色 HEX 值'),
  fontFace: z.string().optional().describe('字体名称'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('对齐方式'),
  valign: z.enum(['top', 'middle', 'bottom']).optional().describe('垂直对齐'),
  bullet: z.union([z.boolean(), bulletSchema]).optional().describe('项目符号'),
  lineSpacing: z.number().optional().describe('行间距（磅）'),
  lineSpacingMultiple: z.number().optional().describe('行间距倍数'),
  fill: shapeFillSchema.optional().describe('文本框填充'),
  line: shapeLineSchema.optional().describe('文本框边框'),
  shadow: shadowSchema.optional().describe('阴影'),
  rotate: z.number().optional().describe('旋转角度（度）'),
  hyperlink: hyperlinkSchema.optional().describe('超链接'),
  margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional().describe('内边距'),
  fit: z.enum(['none', 'shrink', 'resize']).optional().describe('文本适应方式'),
  isTextBox: z.boolean().optional().describe('是否为文本框'),
  indentLevel: z.number().optional().describe('缩进级别'),
  charSpacing: z.number().optional().describe('字符间距'),
  paraSpaceAfter: z.number().optional().describe('段后间距'),
  paraSpaceBefore: z.number().optional().describe('段前间距'),
  wrap: z.boolean().optional().describe('是否自动换行'),
  rtlMode: z.boolean().optional().describe('是否从右到左'),
}).describe('文本元素')

const imageElementSchema = z.object({
  type: z.literal('image').describe('元素类型：图片'),
  ...elementBaseFields,
  imagePath: z.string().optional().describe('图片文件路径'),
  imageData: z.string().optional().describe('图片 Base64 数据'),
  altText: z.string().optional().describe('替代文本'),
  rounding: z.boolean().optional().describe('是否圆角裁剪'),
  transparency: z.number().optional().describe('透明度 0-100'),
  flipH: z.boolean().optional().describe('水平翻转'),
  flipV: z.boolean().optional().describe('垂直翻转'),
  rotate: z.number().optional().describe('旋转角度'),
  hyperlink: hyperlinkSchema.optional().describe('超链接'),
  shadow: shadowSchema.optional().describe('阴影'),
  sizing: imageSizingSchema.optional().describe('尺寸调整配置'),
}).describe('图片元素')

const shapeElementSchema = z.object({
  type: z.literal('shape').describe('元素类型：形状'),
  ...elementBaseFields,
  shape: z.string().describe('形状名称，如 rect、roundRect、ellipse、triangle、line、chevron、arrowRight、star5、heart'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('对齐方式'),
  fill: shapeFillSchema.optional().describe('填充'),
  line: shapeLineSchema.optional().describe('线条/边框'),
  shadow: shadowSchema.optional().describe('阴影'),
  rotate: z.number().optional().describe('旋转角度'),
  flipH: z.boolean().optional().describe('水平翻转'),
  flipV: z.boolean().optional().describe('垂直翻转'),
  rectRadius: z.number().optional().describe('圆角半径（英寸）'),
  points: z.array(z.any()).optional().describe('自定义形状顶点数组'),
  hyperlink: hyperlinkSchema.optional().describe('超链接'),
}).describe('形状元素')

const tableElementSchema = z.object({
  type: z.literal('table').describe('元素类型：表格'),
  ...elementBaseFields,
  rows: z.array(z.array(tableCellSchema)).describe('表格行数据（二维数组）'),
  colW: z.union([z.number(), z.array(z.number())]).optional().describe('列宽'),
  rowH: z.union([z.number(), z.array(z.number())]).optional().describe('行高'),
  autoPage: z.boolean().optional().describe('是否自动分页'),
  autoPageRepeatHeader: z.boolean().optional().describe('是否重复表头'),
  autoPageHeaderRows: z.number().optional().describe('表头行数'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('表格对齐'),
  fontSize: z.number().optional().describe('字号'),
  color: z.string().optional().describe('文字颜色 HEX 值'),
  fontFace: z.string().optional().describe('字体名称'),
  fill: shapeFillSchema.optional().describe('表格填充'),
  margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional().describe('单元格内边距'),
}).describe('表格元素')

const chartElementSchema = z.object({
  type: z.literal('chart').describe('元素类型：图表'),
  ...elementBaseFields,
  chartType: z.string().describe('图表类型，如 bar、line、pie、doughnut、area、scatter、radar、bubble'),
  chartData: z.array(z.any()).describe('图表数据数组'),
  chartOptions: z.any().optional().describe('图表选项（标题、图例、轴等）'),
}).describe('图表元素')

const mediaElementSchema = z.object({
  type: z.literal('media').describe('元素类型：媒体'),
  ...elementBaseFields,
  mediaType: z.enum(['audio', 'video', 'online']).describe('媒体类型'),
  mediaPath: z.string().optional().describe('媒体文件路径'),
  mediaLink: z.string().optional().describe('在线媒体链接'),
  mediaCover: z.string().optional().describe('封面图片路径'),
}).describe('媒体元素')

const elementSchema = z.union([
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
  tableElementSchema,
  chartElementSchema,
  mediaElementSchema,
]).describe('幻灯片元素（text/image/shape/table/chart/media）')

// ==================== 幻灯片 Schema ====================

const slideSchema = z.object({
  elements: z
    .array(elementSchema)
    .optional()
    .describe('元素数组（推荐模式，支持 text/image/shape/table/chart/media 元素自由组合）'),
  title: z.string().optional().describe('标题文本（兼容模式，与 elements 二选一）'),
  body: z.string().optional().describe('正文内容（兼容模式）'),
  layout: z.enum(['title', 'section', 'content', 'blank']).optional().describe('布局类型（兼容模式，默认 content）'),
  notes: z.string().optional().describe('演讲者备注'),
  background: backgroundSchema.optional().describe('幻灯片背景'),
  hidden: z.boolean().optional().describe('是否隐藏此幻灯片'),
  slideNumber: z.boolean().optional().describe('是否显示页码'),
  masterName: z.string().optional().describe('使用的母版名称'),
  sectionTitle: z.string().optional().describe('所属章节标题'),
}).describe('幻灯片内容')

// ==================== 母版 Schema ====================

const masterObjectSchema = z.object({
  text: z.object({
    text: z.string(),
    options: z.any().optional(),
  }).optional().describe('母版文本对象'),
  image: z.any().optional().describe('母版图片对象'),
  rect: z.any().optional().describe('母版矩形对象'),
  line: z.any().optional().describe('母版线条对象'),
  chart: z.any().optional().describe('母版图表对象'),
  placeholder: z.object({
    options: z.object({
      name: z.string(),
      type: z.string(),
      x: z.union([z.number(), z.string()]).optional(),
      y: z.union([z.number(), z.string()]).optional(),
      w: z.union([z.number(), z.string()]).optional(),
      h: z.union([z.number(), z.string()]).optional(),
    }),
    text: z.string().optional(),
  }).optional().describe('母版占位符'),
}).describe('母版对象')

const masterSchema = z.object({
  title: z.string().describe('母版名称'),
  background: backgroundSchema.optional().describe('母版背景'),
  margin: z.union([z.number(), z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional().describe('母版边距'),
  slideNumber: z.boolean().optional().describe('是否显示页码'),
  objects: z.array(masterObjectSchema).optional().describe('母版对象数组'),
}).describe('幻灯片母版定义')

// ==================== 章节 Schema ====================

const sectionSchema = z.object({
  title: z.string().describe('章节标题'),
  order: z.number().optional().describe('章节顺序'),
}).describe('章节定义')

// ==================== 自定义布局 Schema ====================

const layoutSchema = z.object({
  name: z.string().describe('布局名称'),
  width: z.number().describe('布局宽度（英寸）'),
  height: z.number().describe('布局高度（英寸）'),
}).describe('自定义演示文稿布局')

// ==================== 演示文稿元数据 Schema ====================

const presentationMetaSchema = z.object({
  author: z.string().optional().describe('作者'),
  company: z.string().optional().describe('公司'),
  subject: z.string().optional().describe('主题'),
  revision: z.string().optional().describe('修订号'),
  title: z.string().optional().describe('演示文稿标题'),
  rtlMode: z.boolean().optional().describe('是否从右到左模式'),
  headFontFace: z.string().optional().describe('标题字体'),
  bodyFontFace: z.string().optional().describe('正文字体'),
}).describe('演示文稿元数据')

export const aePptxTool = tool({
  description: [
    '创建、编辑或分析 PPTX 演示文稿，全面覆盖 pptxgenjs 能力。',
    '',
    '功能说明：',
    '- create：根据幻灯片数组创建 PPTX 文件，支持元素化绘制、母版、章节、自定义布局、元数据',
    '- edit：在现有 PPTX 中执行文本替换（直接修改幻灯片 XML）',
    '- analyze：提取所有幻灯片的文本内容',
    '- append-slides：向已有 PPTX 追加新幻灯片，保留原有幻灯片不变',
    '- update-slide：替换指定幻灯片的全部元素（0-based 索引）',
    '',
    '元素化绘制（推荐模式）：',
    '- text：富文本（多运行、粗斜体、字号、颜色、字体、对齐、项目符号、行距、超链接、上下标、高亮、阴影、旋转）',
    '- image：图片（本地路径/Base64、圆角、透明度、翻转、sizing 适配、替代文本）',
    '- shape：形状（rect、roundRect、ellipse、triangle、line、chevron、arrow、star、heart 等，含填充、线条、阴影）',
    '- table：表格（单元格合并、边框、填充、对齐、自动分页）',
    '- chart：图表（bar、line、pie、doughnut、area、scatter、radar、bubble）',
    '- media：媒体（音频、视频、在线媒体，含封面）',
    '',
    '增量操作策略：',
    '- 大型演示文稿（>10张幻灯片）：先 create 创建初始部分，再 append-slides 分批追加',
    '- 需要修改单张幻灯片：使用 update-slide 而非重新 create',
    '- append-slides 可多次调用，每次追加一批幻灯片',
    '',
    '幻灯片级能力：',
    '- background：纯色/图片背景',
    '- notes：演讲者备注',
    '- hidden：隐藏幻灯片',
    '- slideNumber：显示页码',
    '- masterName：指定母版',
    '- sectionTitle：归属章节',
    '',
    '演示文稿级能力：',
    '- masters：定义幻灯片母版（背景、边距、页码、占位符）',
    '- sections：定义章节',
    '- layouts：自定义页面尺寸布局',
    '- presentationMeta：作者、公司、主题、标题、字体、RTL 模式',
    '',
    '输出：',
    '- 生成文件自动写入 ae/documents/pptx/ 子目录',
    '- 文件名规则：<名称>-<操作>-<时间戳>-<随机串>.pptx',
    '',
    '预览确认工作流：',
    '- create 操作前，必须先向用户展示幻灯片大纲（每页元素清单、布局、标题）',
    '- edit 操作前，必须先向用户展示替换对照表（原文 → 新文）',
    '- append-slides 操作前，必须先向用户展示追加的幻灯片大纲',
    '- update-slide 操作前，必须先向用户展示目标幻灯片的新元素清单',
    '- 用户确认后再调用本工具',
    '',
    '适用场景：',
    '- 用户明确要求创建、编辑或分析 PPTX 文件',
    '- 需要富文本、图片、形状、表格、图表、媒体、母版、章节等高级功能',
    '- 需要向已有 PPTX 追加幻灯片或更新单张幻灯片',
    '',
    '不适用场景：',
    '- 只需读取 PPTX 内容转为 Markdown 时，使用 ae:markitdown',
    '- 不支持远程 URL，仅处理当前工作区内本地文件',
  ].join('\n'),
  args: {
    operation: z
      .enum(['create', 'edit', 'analyze', 'append-slides', 'update-slide'])
      .describe('操作类型'),
    file: z
      .string()
      .optional()
      .describe('现有 PPTX 文件路径（edit/analyze/append-slides/update-slide 操作必填）'),
    title: z
      .string()
      .optional()
      .describe('演示文稿标题（create 操作可选）'),
    slides: z
      .array(slideSchema)
      .optional()
      .describe('幻灯片数组（create/append-slides 操作必填）'),
    masters: z
      .array(masterSchema)
      .optional()
      .describe('幻灯片母版定义数组（create 操作可选）'),
    sections: z
      .array(sectionSchema)
      .optional()
      .describe('章节定义数组（create 操作可选）'),
    layouts: z
      .array(layoutSchema)
      .optional()
      .describe('自定义页面尺寸布局数组（create 操作可选）'),
    layout: z
      .string()
      .optional()
      .describe('使用的内置布局名称，如 LAYOUT_WIDE（16:9）、LAYOUT_4x3、LAYOUT_A4'),
    presentationMeta: presentationMetaSchema.optional().describe('演示文稿元数据（create 操作可选）'),
    replacements: z
      .array(z.object({
        find: z.string().describe('查找文本'),
        replace: z.string().describe('替换文本'),
      }))
      .optional()
      .describe('文本替换列表（edit 操作必填）'),
    slideIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('目标幻灯片索引（0-based，update-slide 操作必填）'),
    elements: z
      .array(elementSchema)
      .optional()
      .describe('幻灯片元素数组（update-slide 操作必填，替换目标幻灯片的全部元素）'),
    outputPath: z
      .string()
      .optional()
      .describe('自定义输出路径；省略时自动生成到 ae/documents/pptx/'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `PPTX ${args.operation}`, metadata: { operation: args.operation } })

    try {
      const result = await processPptx({
        operation: args.operation,
        worktree: ctx.worktree,
        file: args.file,
        title: args.title,
        slides: args.slides,
        masters: args.masters,
        sections: args.sections,
        layouts: args.layouts,
        layout: args.layout,
        presentationMeta: args.presentationMeta,
        replacements: args.replacements,
        slideIndex: args.slideIndex,
        elements: args.elements,
        outputPath: args.outputPath,
      })

      return {
        output: result.summary + (result.content ? `\n\n${result.content}` : ''),
        metadata: {
          tool: TOOL.AE_PPTX,
          operation: args.operation,
          outputPath: result.outputPath,
          summary: result.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('PPTX', error)
    }
  },
})
