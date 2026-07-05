import { z } from 'zod'

// ==================== 基础类型 ====================

const HexColorSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{6}$/, '颜色必须为 6 位 HEX 值（如 1A2028）')
  .describe('颜色 HEX 值')

const InchesSchema = z.number().min(0).max(13.33).describe('英寸坐标值')

// ==================== 全局风格规格 ====================

export const GlobalStyleSchema = z.object({
  theme: z.enum(['dark', 'light']).describe('全册主题锁定：dark 或 light'),
  colors: z.object({
    primary: HexColorSchema.describe('主色'),
    accent: HexColorSchema.describe('强调色（唯一）'),
    background: HexColorSchema.describe('背景色'),
    text: HexColorSchema.describe('正文文字色'),
    title: HexColorSchema.describe('标题文字色'),
    muted: HexColorSchema.optional().describe('辅助文字色'),
  }).describe('全局配色'),
  fonts: z.object({
    headFontFace: z.string().min(1).describe('标题字体（必须 CJK 兼容）'),
    bodyFontFace: z.string().min(1).describe('正文字体（必须 CJK 兼容）'),
    monoFontFace: z.string().optional().describe('等宽字体（代码/数据）'),
  }).describe('全局字体'),
  titleStyle: z.object({
    fontSize: z.number().min(24).max(60).describe('标题字号（磅）'),
    bold: z.boolean().default(true).describe('标题粗体'),
    color: HexColorSchema.describe('标题颜色'),
  }).describe('标题样式'),
  bodyStyle: z.object({
    fontSize: z.number().min(14).max(24).describe('正文字号（磅）'),
    color: HexColorSchema.describe('正文颜色'),
    align: z.enum(['left', 'center', 'right', 'justify']).default('left').describe('正文对齐'),
  }).describe('正文样式'),
  layout: z.object({
    size: z.enum(['LAYOUT_WIDE', 'LAYOUT_4x3', 'LAYOUT_A4']).default('LAYOUT_WIDE').describe('页面尺寸'),
    margin: z.number().min(0.3).max(1.0).default(0.5).describe('安全区边距（英寸）'),
    titleAreaY: z.number().min(0.2).max(1.5).default(0.3).describe('标题区起始 Y（英寸）'),
    titleAreaH: z.number().min(0.5).max(2.0).default(0.9).describe('标题区高度（英寸）'),
    contentStartY: z.number().min(1.0).max(3.0).default(1.5).describe('内容区起始 Y（英寸）'),
    elementGap: z.number().min(0.1).max(0.5).default(0.2).describe('元素间距（英寸）'),
  }).describe('布局基准'),
  shapeConsistency: z.enum(['rounded', 'sharp', 'pill']).describe('形状一致性策略'),
  accentColorLock: z.boolean().default(true).describe('强调色锁定：全册仅使用一个强调色'),
})

// ==================== Token 定义 ====================

export const TokenValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.array(z.object({}).passthrough()),
  // 二维数组：用于 data.table 模板的 rows token（CellObj[][]）
  z.array(z.array(z.union([z.string(), z.number(), z.object({}).passthrough()]))),
  z.record(z.string(), z.unknown()),
]).describe('Token 值：字符串、数字、数组或对象')

export const TokensSchema = z.record(z.string(), TokenValueSchema).describe('模板 token 键值对')

// ==================== Overrides（坐标/颜色/字号级微调） ====================

export const OverrideSchema = z.object({
  x: InchesSchema.optional(),
  y: InchesSchema.optional(),
  w: InchesSchema.optional().describe('宽度（英寸）'),
  h: InchesSchema.optional().describe('高度（英寸）'),
  color: HexColorSchema.optional(),
  fontSize: z.number().min(8).max(72).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  fill: z.object({
    type: z.enum(['none', 'solid']).optional(),
    color: HexColorSchema.optional(),
    transparency: z.number().min(0).max(100).optional(),
  }).optional(),
  line: z.object({
    type: z.enum(['none', 'dash', 'solid']).optional(),
    color: HexColorSchema.optional(),
    width: z.number().optional(),
  }).optional(),
  fontFace: z.string().optional(),
  valign: z.enum(['top', 'middle', 'bottom']).optional(),
}).describe('元素级 overrides：覆盖模板默认属性')

export const OverridesSchema = z.record(z.string(), OverrideSchema).describe('slot 名 → override 属性')

// ==================== 单页设计 ====================

export const PageDesignSchema = z.object({
  id: z.string().min(1).describe('页标识，如 p1, p2'),
  template: z.string().min(1).describe('模板名，如 cover.centered, content.bullets'),
  tokens: TokensSchema.describe('模板 token 填充值'),
  overrides: OverridesSchema.optional().describe('元素级 overrides（坐标/颜色/字号微调）'),
  locked: z.boolean().default(false).describe('锁定页：AI 不得写入 overrides，用户手动控制'),
  layoutHint: z.string().optional().describe('用户布局描述（自然语言，供 @doc-architect 参考）'),
  notes: z.string().optional().describe('设计备注'),
})

// ==================== 设计文件 ====================

export const PptxDesignFileSchema = z.object({
  version: z.literal(1).describe('设计文件版本'),
  title: z.string().min(1).describe('演示文稿标题'),
  outlinePath: z.string().optional().describe('大纲文件路径'),
  globalStyle: GlobalStyleSchema.describe('全局风格规格'),
  pages: z.array(PageDesignSchema).min(1).describe('逐页设计'),
})

// ==================== 模板定义 Schema ====================

export const SlotElementSchema = z.object({
  type: z.enum(['text', 'image', 'shape', 'table', 'chart']),
  slot: z.string().min(1).describe('slot 名（与 tokens/overrides 的 key 对应）'),
  // 坐标默认值（可被 overrides 覆盖）
  x: InchesSchema.optional(),
  y: InchesSchema.optional(),
  w: InchesSchema.optional().describe('宽度（英寸）'),
  h: InchesSchema.optional().describe('高度（英寸）'),
  // 样式默认值
  fontSize: z.number().min(8).max(72).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: HexColorSchema.optional(),
  fill: z.object({
    type: z.enum(['none', 'solid']).optional(),
    color: HexColorSchema.optional(),
    transparency: z.number().min(0).max(100).optional(),
  }).optional(),
  line: z.object({
    type: z.enum(['none', 'dash', 'solid']).optional(),
    color: HexColorSchema.optional(),
    width: z.number().optional(),
  }).optional(),
  align: z.enum(['left', 'center', 'right', 'justify']).optional(),
  valign: z.enum(['top', 'middle', 'bottom']).optional(),
  fontFace: z.string().optional(),
  shape: z.string().optional().describe('形状名（type=shape 时）'),
  chartType: z.string().optional().describe('图表类型（type=chart 时）'),
}).describe('slot 元素定义')

export const TemplateSchema = z.object({
  name: z.string().min(1).describe('模板名，如 cover.centered'),
  description: z.string().describe('模板用途描述'),
  category: z.enum(['cover', 'section', 'content', 'data', 'timeline', 'comparison', 'closing']).describe('模板分类'),
  slots: z.array(SlotElementSchema).min(1).describe('slot 定义列表'),
  tokens: z.record(z.string(), z.object({
    description: z.string().describe('token 用途说明'),
    required: z.boolean().default(true).describe('是否必填'),
    type: z.enum(['string', 'number', 'string[]', 'table_rows', 'chart_data']).describe('token 值类型'),
  })).describe('token 定义'),
  layoutHint: z.string().optional().describe('布局说明'),
})

// ==================== 类型导出 ====================

export type GlobalStyle = z.infer<typeof GlobalStyleSchema>
export type TokenValue = z.infer<typeof TokenValueSchema>
export type Tokens = z.infer<typeof TokensSchema>
export type Override = z.infer<typeof OverrideSchema>
export type Overrides = z.infer<typeof OverridesSchema>
export type PageDesign = z.infer<typeof PageDesignSchema>
export type PptxDesignFile = z.infer<typeof PptxDesignFileSchema>
export type SlotElement = z.infer<typeof SlotElementSchema>
export type TemplateDef = z.infer<typeof TemplateSchema>

// ==================== 模板目录名常量 ====================

export const TEMPLATE_NAMES = [
  'cover.centered',
  'cover.split',
  'section.divider',
  'content.bullets',
  'content.text',
  'content.two-column',
  'content.quote',
  'content.image-focus',
  'data.chart',
  'data.table',
  'data.kpi-cards',
  'timeline.horizontal',
  'comparison.split',
  'closing.cta',
] as const

export type TemplateName = (typeof TEMPLATE_NAMES)[number]
