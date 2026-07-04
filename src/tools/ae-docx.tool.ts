import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { processDocx } from '../services/docx-service.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'
import {
  assessWriteDanger,
  isInPlaceEditOutsideWorktree,
  hasOutsideWorktreePaths,
  buildOutsideWriteConfirmMessage,
} from '../utils/document-path-security.js'

// ==================== 文本运行样式 ====================

const runStyleSchema = z.object({
  text: z.string().describe('文本内容'),
  bold: z.boolean().optional().describe('粗体'),
  italics: z.boolean().optional().describe('斜体'),
  underline: z.enum(['single', 'double', 'dash', 'dot', 'wave', 'none']).optional().describe('下划线类型'),
  strike: z.boolean().optional().describe('删除线'),
  doubleStrike: z.boolean().optional().describe('双删除线'),
  subscript: z.boolean().optional().describe('下标'),
  superscript: z.boolean().optional().describe('上标'),
  color: z.string().optional().describe('字体颜色（十六进制，如 FF0000）'),
  fontSize: z.number().min(1).max(200).optional().describe('字号（磅）'),
  fontFace: z.string().optional().describe('字体名称'),
  highlight: z.string().optional().describe('高亮颜色（如 yellow, green, red, cyan）'),
  breakAfter: z.boolean().optional().describe('运行后换行'),
})

// ==================== 超链接运行 ====================

const hyperlinkRunSchema = z.object({
  text: z.string().describe('链接显示文本'),
  url: z.string().describe('链接 URL'),
  bold: z.boolean().optional().describe('粗体'),
  italics: z.boolean().optional().describe('斜体'),
  color: z.string().optional().describe('字体颜色（十六进制）'),
  underline: z.enum(['single', 'double', 'none']).optional().describe('下划线类型'),
})

// ==================== 表格单元格样式 ====================

const tableCellStyleSchema = z.object({
  width: z.object({
    size: z.number().min(0).describe('宽度值'),
    type: z.enum(['pct', 'dxa']).optional().describe('宽度类型：pct=百分比, dxa=缇'),
  }).optional().describe('单元格宽度'),
  shading: z.object({
    fill: z.string().describe('背景色（十六进制）'),
    type: z.enum(['clear', 'solid']).optional().describe('底纹类型'),
  }).optional().describe('单元格底纹'),
  verticalAlign: z.enum(['top', 'center', 'bottom']).optional().describe('垂直对齐'),
  borders: z.object({
    top: z.object({
      style: z.string().optional().describe('边框样式（如 single, double, dashed, dotted, none）'),
      size: z.number().min(0).optional().describe('边框粗细（1/8 磅）'),
      color: z.string().optional().describe('边框颜色（十六进制）'),
    }).optional(),
    bottom: z.object({
      style: z.string().optional().describe('边框样式'),
      size: z.number().min(0).optional().describe('边框粗细'),
      color: z.string().optional().describe('边框颜色'),
    }).optional(),
    left: z.object({
      style: z.string().optional().describe('边框样式'),
      size: z.number().min(0).optional().describe('边框粗细'),
      color: z.string().optional().describe('边框颜色'),
    }).optional(),
    right: z.object({
      style: z.string().optional().describe('边框样式'),
      size: z.number().min(0).optional().describe('边框粗细'),
      color: z.string().optional().describe('边框颜色'),
    }).optional(),
  }).optional().describe('单元格边框'),
  margin: z.object({
    top: z.number().min(0).optional().describe('上边距（缇）'),
    bottom: z.number().min(0).optional().describe('下边距（缇）'),
    left: z.number().min(0).optional().describe('左边距（缇）'),
    right: z.number().min(0).optional().describe('右边距（缇）'),
  }).optional().describe('单元格边距'),
  colspan: z.number().min(1).optional().describe('列合并数'),
  rowspan: z.number().min(1).optional().describe('行合并数'),
  bold: z.boolean().optional().describe('粗体'),
  italics: z.boolean().optional().describe('斜体'),
  fontSize: z.number().min(1).max(200).optional().describe('字号（磅）'),
  color: z.string().optional().describe('字体颜色（十六进制）'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('水平对齐'),
})

const tableCellSchema = z.object({
  text: z.string().optional().describe('单元格文本'),
  style: tableCellStyleSchema.optional().describe('单元格样式'),
})

// ==================== 内容块 ====================

const contentBlockSchema = z.object({
  type: z.enum([
    'heading', 'paragraph', 'bullet', 'numbered',
    'table', 'image', 'page-break', 'code', 'quote', 'hr', 'hyperlink',
  ]).describe('内容块类型'),
  // heading
  level: z.number().min(1).max(6).optional().describe('标题级别（1-6），仅 heading 类型'),
  // text-based
  text: z.string().optional().describe('文本内容'),
  bold: z.boolean().optional().describe('粗体'),
  italics: z.boolean().optional().describe('斜体'),
  underline: z.enum(['single', 'double', 'dash', 'dot', 'wave', 'none']).optional().describe('下划线类型'),
  strike: z.boolean().optional().describe('删除线'),
  color: z.string().optional().describe('字体颜色（十六进制）'),
  fontSize: z.number().min(1).max(200).optional().describe('字号（磅）'),
  fontFace: z.string().optional().describe('字体名称'),
  highlight: z.string().optional().describe('高亮颜色'),
  align: z.enum(['left', 'center', 'right', 'justify']).optional().describe('段落对齐'),
  spacing: z.object({
    before: z.number().min(0).optional().describe('段前间距（缇）'),
    after: z.number().min(0).optional().describe('段后间距（缇）'),
    line: z.number().min(0).optional().describe('行距（缇，如 240=单倍行距）'),
  }).optional().describe('段落间距'),
  indent: z.object({
    left: z.number().optional().describe('左缩进（缇）'),
    right: z.number().optional().describe('右缩进（缇）'),
    firstLine: z.number().optional().describe('首行缩进（缇）'),
  }).optional().describe('段落缩进'),
  // runs
  runs: z.array(runStyleSchema).optional().describe('富文本运行数组（支持同段落多样式）'),
  // hyperlink
  hyperlink: hyperlinkRunSchema.optional().describe('超链接（仅 hyperlink 类型）'),
  // table
  rows: z.array(z.array(tableCellSchema)).optional().describe('表格行数据（仅 table 类型）'),
  tableWidth: z.number().min(0).max(100).optional().describe('表格宽度百分比（0-100）'),
  tableLayout: z.enum(['fixed', 'autofit']).optional().describe('表格布局模式'),
  // image
  imagePath: z.string().optional().describe('图片文件路径（仅 image 类型，与 imageData 二选一）'),
  imageData: z.string().optional().describe('图片 base64 数据（仅 image 类型，与 imagePath 二选一）'),
  imageWidth: z.number().min(1).optional().describe('图片宽度（像素，默认 200）'),
  imageHeight: z.number().min(1).optional().describe('图片高度（像素，默认 200）'),
  imageAlt: z.string().optional().describe('图片替代文本'),
  // quote
  quoteStyle: z.enum(['indent', 'block']).optional().describe('引用样式：indent=缩进引用, block=块引用带左边框（仅 quote 类型）'),
  // code
  codeLanguage: z.string().optional().describe('代码语言标识（仅 code 类型，用于语法高亮提示）'),
})

// ==================== 节属性 ====================

const sectionPropsSchema = z.object({
  pageSize: z.object({
    width: z.number().min(1).optional().describe('页面宽度（英寸）'),
    height: z.number().min(1).optional().describe('页面高度（英寸）'),
    orientation: z.enum(['portrait', 'landscape']).optional().describe('页面方向'),
  }).optional().describe('页面尺寸'),
  margins: z.object({
    top: z.number().min(0).optional().describe('上边距（英寸）'),
    bottom: z.number().min(0).optional().describe('下边距（英寸）'),
    left: z.number().min(0).optional().describe('左边距（英寸）'),
    right: z.number().min(0).optional().describe('右边距（英寸）'),
    header: z.number().min(0).optional().describe('页眉距顶（英寸）'),
    footer: z.number().min(0).optional().describe('页脚距底（英寸）'),
  }).optional().describe('页边距'),
  headers: z.object({
    default: z.string().optional().describe('默认页眉文本'),
    first: z.string().optional().describe('首页页眉文本'),
    even: z.string().optional().describe('偶数页页眉文本'),
  }).optional().describe('页眉'),
  footers: z.object({
    default: z.string().optional().describe('默认页脚文本'),
    first: z.string().optional().describe('首页页脚文本'),
    even: z.string().optional().describe('偶数页页脚文本'),
  }).optional().describe('页脚'),
  columnCount: z.number().min(1).max(16).optional().describe('分栏数'),
  columnSpacing: z.number().min(0).optional().describe('栏间距（英寸）'),
})

// ==================== 文档元数据 ====================

const documentMetaSchema = z.object({
  title: z.string().optional().describe('文档标题'),
  creator: z.string().optional().describe('作者'),
  subject: z.string().optional().describe('主题'),
  description: z.string().optional().describe('描述'),
  keywords: z.string().optional().describe('关键词'),
  category: z.string().optional().describe('分类'),
  lastModifiedBy: z.string().optional().describe('最后修改者'),
  revision: z.number().min(0).optional().describe('修订版本号'),
})

export const aeDocxTool = tool({
  description: [
    '创建、编辑或分析 DOCX 文档。',
    '',
    '功能说明：',
    '- create：根据内容块数组创建 DOCX 文件（支持标题、段落、项目符号、编号列表、表格、图片、分页符、代码块、引用、水平线、超链接）',
    '- edit：在现有 DOCX 中执行文本替换（直接修改 XML，保留原有格式）',
    '- analyze：提取 DOCX 的文本内容、段落数和表格数',
    '- track-changes：添加 Word 修订标记（w:del/w:ins），便于审阅变更',
    '- append-blocks：向已有 DOCX 追加内容块（增量追加，保留原有内容）',
    '- update-block：更新已有 DOCX 中指定索引的内容块（局部替换，不影响其他块）',
    '- merge：合并多个 DOCX 文件为一个',
    '- split：将 DOCX 按分节符或分页符拆分为多个文件',
    '- to-markdown：将 DOCX 内容完整转换为 Markdown，支持 OMML 数学公式转 LaTeX',
    '',
    'create 操作支持的高级特性：',
    '- 富文本运行（runs）：同一段落内混合多种样式（粗体、斜体、颜色、字号等）',
    '- 表格单元格样式：宽度、底纹、边框、边距、合并（colspan/rowspan）、对齐',
    '- 节属性（sections）：页面尺寸、边距、页眉页脚、分栏',
    '- 文档元数据（documentMeta）：标题、作者、主题、关键词等',
    '- 图片：支持文件路径或 base64 数据，可设置宽高和替代文本',
    '',
    '增量操作策略：',
    '- 大型文档（>15个内容块）：先 create 创建初始部分，再 append-blocks 分批追加，避免单次生成过多内容',
    '- 需要修改单个块：使用 update-block 而非重新 create',
    '- append-blocks 可多次调用，每次追加一批内容块',
    '',
    '输出：',
    '- 生成文件自动写入 `ae/documents/docx/` 子目录',
    '- 文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.docx`（非 ASCII 字符自动替换为连字符）',
    '- 写入路径通过 metadata.outputPath 返回',
    '',
    '预览确认工作流：',
    '- create 操作前，必须先向用户展示内容块大纲（标题层级、段落摘要、表格结构）',
    '- track-changes 操作前，必须先向用户展示变更对照表（原文 → 新文）',
    '- append-blocks 操作前，必须先向用户展示追加的内容块大纲',
    '- update-block 操作前，必须先向用户展示原块摘要和新块内容',
    '- 用户确认后再调用本工具',
    '',
    '适用场景：',
    '- 用户明确要求创建、编辑或分析 DOCX 文件',
    '- 需要以修订标记方式记录文档变更',
    '- 需要生成包含表格、图片、富文本的复杂文档',
    '- 需要向已有文档追加内容或修改单个内容块',
    '- 创建或修改 DOCX 后需要视觉验证时，使用 to-image 操作（需要 LibreOffice）',
    '- 需要理解 DOCX 视觉内容但模型不支持 vision 时，使用 to-image 转 PNG + ae:image 识别',
    '',
    '不适用场景：',
    '- 只需读取 DOCX 内容转为 Markdown 时，使用 to-markdown 操作',
    '- 不支持远程 URL，仅处理本地文件（支持任意本地绝对路径）',
  ].join('\n'),
  args: {
    operation: z
      .enum(['create', 'edit', 'analyze', 'track-changes', 'append-blocks', 'update-block', 'merge', 'split', 'to-markdown', 'to-image'])
      .describe('操作类型'),
    file: z
      .string()
      .optional()
      .describe('现有 DOCX 文件路径（edit/analyze/track-changes/append-blocks/update-block/split/to-image 操作必填）'),
    files: z
      .array(z.string())
      .optional()
      .describe('要合并的 DOCX 文件路径列表（merge 操作必填，至少 2 个文件）'),
    title: z
      .string()
      .optional()
      .describe('文档标题（create 操作可选，也可通过 documentMeta.title 设置）'),
    blocks: z
      .array(contentBlockSchema)
      .max(80, '单次内容块数量上限 80，超过时请分批追加：先用 create 创建初始部分，再用 append-blocks 分批追加')
      .optional()
      .describe('内容块数组（create/append-blocks 操作必填，支持 11 种块类型）。单次上限 80 个块，超过时请分批追加'),
    sections: z
      .array(sectionPropsSchema)
      .optional()
      .describe('节属性数组（create 操作可选，用于多节文档的不同页面设置）'),
    documentMeta: documentMetaSchema
      .optional()
      .describe('文档元数据（create 操作可选，设置标题、作者、主题等核心属性）'),
    replacements: z
      .array(z.object({
        find: z.string().describe('查找文本'),
        replace: z.string().describe('替换文本'),
      }))
      .optional()
      .describe('文本替换列表（edit 操作必填）'),
    changes: z
      .array(z.object({
        find: z.string().describe('查找文本'),
        replace: z.string().describe('替换文本'),
      }))
      .optional()
      .describe('修订变更列表（track-changes 操作必填）'),
    blockIndex: z
      .number()
      .min(0)
      .optional()
      .describe('0-based 内容块索引（update-block 操作必填，用于指定要更新的块）'),
    block: contentBlockSchema
      .optional()
      .describe('新内容块对象（update-block 操作必填，与 create 的 block 结构相同）'),
    outputPath: z
      .string()
      .optional()
      .describe('自定义输出路径。create/merge 操作写入 ae/documents/docx/；split 不指定时自动生成 sectionN 文件路径；edit/track-changes/append-blocks/update-block 不指定时原地修改原文件（修改前自动备份为同目录 .bak 文件，修改成功后删除备份）；to-markdown 的 outputMode=file 时写入此路径或 ae/markdown/'),
    outputMode: z
      .enum(['file', 'inline'])
      .optional()
      .describe('to-markdown 输出模式：file 写入文件（默认），inline 直接返回内容不写文件'),
    pages: z
      .array(z.number().int().min(1))
      .optional()
      .describe('to-image 操作：指定页码列表（1-based），如 [1,3] 只转换第1、3页；省略则转换所有页'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: `DOCX ${args.operation}`, metadata: { operation: args.operation } })

    const writeOps = ['create', 'edit', 'track-changes', 'append-blocks', 'update-block', 'merge', 'split'] as const
    const fileOutputOps = ['to-markdown'] as const
    if (writeOps.includes(args.operation as typeof writeOps[number]) ||
        (fileOutputOps.includes(args.operation as typeof fileOutputOps[number]) && args.outputMode !== 'inline')) {
      const dangerPaths: string[] = []
      if (args.outputPath) {
        if (assessWriteDanger(ctx.worktree, args.outputPath) === 'outside') {
          dangerPaths.push(args.outputPath)
        }
      }
      if (!args.outputPath && isInPlaceEditOutsideWorktree(ctx.worktree, args.file)) {
        dangerPaths.push(args.file ?? '')
      }
      if (args.operation === 'merge' && hasOutsideWorktreePaths(ctx.worktree, args.files)) {
        const outsideFiles = (args.files ?? []).filter(
          (f) => hasOutsideWorktreePaths(ctx.worktree, [f]),
        )
        dangerPaths.push(...outsideFiles)
      }
      if (dangerPaths.length > 0) {
        try {
          await ctx.ask({
            permission: 'file',
            patterns: dangerPaths,
            always: [],
            metadata: {
              action: buildOutsideWriteConfirmMessage(args.operation, 'DOCX', dangerPaths),
            },
          })
        } catch {
          return '用户拒绝了工作区外写入操作。'
        }
      }
    }

    try {
      const result = await processDocx({
        operation: args.operation,
        worktree: ctx.worktree,
        file: args.file,
        files: args.files,
        title: args.title,
        blocks: args.blocks,
        sections: args.sections,
        documentMeta: args.documentMeta,
        replacements: args.replacements,
        changes: args.changes,
        blockIndex: args.blockIndex,
        block: args.block,
        outputPath: args.outputPath,
        outputMode: args.outputMode,
        pages: args.pages,
      })

      return {
        output: result.summary + (result.content ? `\n\n${result.content}` : ''),
        metadata: {
          tool: TOOL.AE_DOCX,
          operation: args.operation,
          outputPath: result.outputPath,
          outputPaths: result.outputPaths,
          summary: result.summary,
        },
      }
    } catch (error) {
      return formatDocumentToolError('DOCX', error)
    }
  },
})
