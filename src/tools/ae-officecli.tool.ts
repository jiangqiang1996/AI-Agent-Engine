import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { batchCommands, sendCommand, type OfficeCliBatchItem } from '../services/officecli-service.js'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'
import { normalizeUserFilePath } from '../utils/document-path-security.js'

const OFFICECLI_COMMANDS = [
  'set', 'get', 'add', 'remove', 'move', 'swap', 'query', 'view',
  'validate', 'batch', 'dump', 'raw', 'raw-set', 'add-part',
  'create', 'save', 'refresh', 'watch', 'unwatch', 'goto',
  'mark', 'unmark', 'get-marks', 'load_skill', 'plugins',
  'check', 'help', 'import', 'export', 'close', 'open',
] as const

export const aeOfficecliTool = tool({
  description: [
    '通过 OfficeCLI 操作 Office 文档（.docx/.xlsx/.pptx），支持 L1 读取/L2 DOM 编辑/L3 raw XML。',
    '',
    '功能说明：',
    '- 内置公式引擎，可计算 Excel 公式',
    '- 内置 HTML 渲染引擎，支持 view html/watch 实时预览',
    '- 支持 CSS 选择器查询、稳定 ID 寻址、批量操作',
    '- help: 查看命令语法和元素 schema，不确定属性名时优先使用',
    '- load_skill: 加载格式专用规则（如 pitch-deck/academic-paper/financial-model）',
    '- mark/unmark: 添加/移除编辑标记，用于需人工审查的变更',
    '- watch/unwatch: 启动/停止实时 HTML 预览',
    '- dump: 转储为可回放的 batch JSON',
    '- refresh: 刷新 TOC 页码和交叉引用',
    '- 跨平台自动下载二进制，无需手动安装 OfficeCLI',
    '',
    '适用场景：',
    '- 创建、读取、编辑 Word/Excel/PowerPoint 文档',
    '- 需要公式计算、HTML 渲染、raw XML 操作等 JS 库无法实现的功能',
    '- 需要高保真文档预览或实时编辑反馈循环',
    '',
    '不适用场景：',
    '- PDF 文档操作请使用 ae:pdf',
    '- 简单的 .docx/.pptx/.xlsx 操作可先尝试对应专属包装技能 ae:docx/ae:pptx/ae:xlsx',
  ].join('\n'),
  args: {
    file: z.string().min(1).describe('文档路径（.docx/.xlsx/.pptx），支持绝对路径和相对路径'),
    command: z.enum(OFFICECLI_COMMANDS).describe('officecli 命令'),
    path: z.string().optional().describe('元素路径，如 /Sheet1/A1、/slide[1]、/body/p[3]'),
    props: z.record(z.string(), z.string()).optional().describe('属性键值对，如 { text: "Hello", bold: "true" }'),
    items: z.array(z.record(z.string(), z.unknown())).optional().describe('batch 模式的命令列表，每项为 { command, path, props, ... }'),
    selector: z.string().optional().describe('CSS 选择器，用于 query/set/remove'),
    type: z.string().optional().describe('元素类型，用于 add 命令，如 slide/shape/paragraph/run/table'),
    parent: z.string().optional().describe('父元素路径，用于 add 命令'),
    after: z.string().optional().describe('在指定路径之后插入'),
    before: z.string().optional().describe('在指定路径之前插入'),
    to: z.string().optional().describe('移动目标路径，用于 move 命令'),
    index: z.union([z.number(), z.string()]).optional().describe('插入位置索引'),
    depth: z.number().optional().describe('get 命令的子节点展开深度'),
    mode: z.string().optional().describe('view 命令模式：outline/stats/issues/text/annotated/html/screenshot/svg/pdf/forms'),
    output: z.string().optional().describe('输出文件路径，用于 view screenshot -o、view svg -o、view pdf -o 等'),
    screenshotWidth: z.number().optional().describe('screenshot 宽度（像素），用于 view screenshot'),
    screenshotHeight: z.number().optional().describe('screenshot 高度（像素），用于 view screenshot'),
    grid: z.number().optional().describe('pptx screenshot 网格列数，用于 view screenshot --grid N'),
    page: z.number().optional().describe('docx 指定页码（view html/screenshot），pptx 指定起始幻灯片'),
    start: z.number().optional().describe('pptx view 起始幻灯片编号'),
    end: z.number().optional().describe('pptx view 结束幻灯片编号'),
    part: z.string().optional().describe('raw/raw-set 命令的文档部件'),
    xpath: z.string().optional().describe('raw-set 命令的 XPath'),
    action: z.string().optional().describe('raw-set 命令动作：append/prepend/insertbefore/insertafter/replace/remove/setattr'),
    xml: z.string().optional().describe('raw-set 命令的 XML 内容'),
    from: z.string().optional().describe('clone 源路径（add --from）或 import 源文件'),
    find: z.string().optional().describe('查找文本，用于 set --find'),
    replace: z.string().optional().describe('替换文本，用于 set --replace'),
    options: z.record(z.string(), z.unknown()).optional().describe('其他命令参数，透传给 officecli（如 json、stop-on-error、force 等）'),
  },
  execute: async (args, ctx) => {
    const filePath = normalizeUserFilePath(args.file)

    ctx.metadata({ title: `officecli ${args.command}: ${filePath}` })

    try {
      if (args.command === 'batch') {
        if (!args.items || !Array.isArray(args.items) || args.items.length === 0) {
          return formatDocumentToolError('ae-officecli', new Error('batch 命令需要非空 items 数组'))
        }
        const items = args.items as OfficeCliBatchItem[]
        const result = await batchCommands(filePath, items, { create: false })
        return {
          output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          metadata: { tool: TOOL.AE_OFFICECLI, command: 'batch', file: filePath },
        }
      }

      if (args.command === 'create') {
        const item: OfficeCliBatchItem = {
          command: 'get',
          path: '/',
        }
        const result = await sendCommand(filePath, item, { create: true })
        return {
          output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          metadata: { tool: TOOL.AE_OFFICECLI, command: 'create', file: filePath },
        }
      }

      const item: OfficeCliBatchItem = {
        command: args.command,
      }

      if (args.path !== undefined) item.path = args.path
      if (args.props !== undefined) item.props = args.props
      if (args.selector !== undefined) item.selector = args.selector
      if (args.type !== undefined) item.type = args.type
      if (args.parent !== undefined) item.parent = args.parent
      if (args.after !== undefined) item.after = args.after
      if (args.before !== undefined) item.before = args.before
      if (args.to !== undefined) item.to = args.to
      if (args.index !== undefined) item.index = args.index
      if (args.depth !== undefined) item.depth = args.depth
      if (args.mode !== undefined) item.mode = args.mode
      if (args.output !== undefined) item.o = args.output
      if (args.screenshotWidth !== undefined) item.screenshotWidth = args.screenshotWidth
      if (args.screenshotHeight !== undefined) item.screenshotHeight = args.screenshotHeight
      if (args.grid !== undefined) item.grid = args.grid
      if (args.page !== undefined) item.page = args.page
      if (args.start !== undefined) item.start = args.start
      if (args.end !== undefined) item.end = args.end
      if (args.part !== undefined) item.part = args.part
      if (args.xpath !== undefined) item.xpath = args.xpath
      if (args.action !== undefined) item.action = args.action
      if (args.xml !== undefined) item.xml = args.xml
      if (args.from !== undefined) item.from = args.from
      if (args.find !== undefined) item.find = args.find
      if (args.replace !== undefined) item.replace = args.replace
      if (args.options !== undefined) {
        for (const [k, v] of Object.entries(args.options)) {
          if (item[k] === undefined) item[k] = v
        }
      }

      const result = await sendCommand(filePath, item)
      return {
        output: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        metadata: { tool: TOOL.AE_OFFICECLI, command: args.command, file: filePath },
      }
    } catch (error) {
      return formatDocumentToolError('ae-officecli', error)
    }
  },
})
