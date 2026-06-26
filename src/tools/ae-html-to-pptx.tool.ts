import { existsSync, readFileSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { isInsideRoot } from '../utils/path-utils.js'
import {
  buildBrowserExtractionScript,
  buildBrowserViewportProbeScript,
  cleanupMergedHtml,
  convertDirectorySlidesToPptxRegex,
  convertHtmlToPptx,
  createMergedSlidesHtml,
  formatHtmlToPptxError,
  isSlidesForgeDirectory,
} from '../services/html-to-pptx-service.js'

function formatResult(result: { outputPath: string; slideCount: number; warnings: string[] }, renderMode: string): string {
  return [
    `# HTML 转 PPTX 结果：success`,
    '',
    `- 渲染模式：${renderMode}`,
    `- 输出路径：${result.outputPath}`,
    `- 幻灯片数量：${result.slideCount}`,
    result.warnings.length > 0 ? `- 警告：${result.warnings.join('；')}` : '- 警告：无',
  ].join('\n')
}

function formatFailedResult(message: string): string {
  return [
    '# HTML 转 PPTX 结果：failed',
    '',
    `- 错误：${message}`,
  ].join('\n')
}

function formatBrowserStepInstruction(file: string, slideSeparator: string): string {
  const script = buildBrowserExtractionScript(slideSeparator as 'section' | 'hr' | 'h1' | 'auto')
  const probeScript = buildBrowserViewportProbeScript()
  return [
    '# 浏览器渲染路径：请按以下步骤操作',
    '',
    '## 步骤 1：确认浏览器 MCP 连接',
    '通过 ae:chrome-devtools 技能完成 chrome-devtools MCP 注册确认。',
    '',
    '## 步骤 2：在浏览器中打开 HTML 文件',
    '调用 chrome-devtools_navigate_page，url 设为当前 HTML 文件的本地路径或已部署地址。',
    '文件路径：' + file,
    '',
    '## 步骤 3：探测 HTML 尺寸并调整视口',
    '调用 chrome-devtools_evaluate_script 执行以下视口探测脚本，获取 HTML body 的实际宽高：',
    '',
    '```javascript',
    probeScript,
    '```',
    '',
    '根据返回结果，调用 chrome-devtools_resize_page 将视口调整为 body 的宽高（取 scrollWidth 和 scrollHeight，确保无溢出）。',
    '例如：如果返回 scrollWidth=1280, scrollHeight=720，则调用 chrome-devtools_resize_page 设 width=1280, height=720。',
    '',
    '## 步骤 4：执行提取脚本',
    '调用 chrome-devtools_evaluate_script，将以下 JavaScript 注入浏览器执行：',
    '',
    '```javascript',
    script,
    '```',
    '',
    '## 步骤 5：收集浏览器返回的 JSON 结果',
    'evaluate_script 自动将提取脚本的返回值序列化为 JSON。直接将返回结果作为 browser_data 参数传入本工具，无需手动 JSON.stringify 或 JSON.parse。',
    `- file=${file}`,
    `- browser_render=true`,
    `- browser_data=<步骤4返回的JSON字符串>`,
    '',
    '本工具将用浏览器提取的数据生成高保真 PPTX。',
  ].join('\n')
}

export const aeHtmlToPptxTool = tool({
  description: [
    '将 HTML 文件或幻灯片目录转换为 PPTX 演示文稿。',
    '',
    '功能说明：',
    '- 读取当前工作区内的 HTML 文件或多文件幻灯片目录',
    '- 自动探测输入格式：',
    '  1. 单文件 HTML：按 section/hr/h1 自动分页',
    '  2. 多文件目录（如 ae:slides-forge 产物 slide-01.html..slide-NN.html + common.css）：每个文件作为一张幻灯片',
    '- 支持两种渲染模式：',
    '  1. regex（默认）：正则提取结构化内容，不保留 CSS 样式',
    '  2. browser：通过浏览器渲染提取精确布局和样式（需要 chrome-devtools MCP）',
    '- 浏览器模式对多文件目录会自动创建合并 HTML，保证 CSS/图片相对路径有效',
    '- 调用 pptxgenjs 生成 .pptx 文件，自动写入 ae/documents/pptx/ 目录',
    '',
    '浏览器渲染模式流程（browser_render=true 且无 browser_data）：',
    '- 工具返回分步操作指令，由调用方编排 chrome-devtools MCP 工具完成浏览器交互',
    '- 步骤：注册 MCP → 导航 HTML → 执行提取脚本 → 收集 JSON → 再次调用本工具',
    '',
    '适用场景：',
    '- 将 ae:slides-forge 生成的 HTML 幻灯片转换为 PPTX',
    '- 将已有 HTML 内容快速转为演示文稿',
    '- 需要高保真还原 HTML 视觉布局时使用 browser_render 模式',
    '',
    '不适用场景：',
    '- 不支持远程 URL，仅处理当前工作区内本地 HTML 文件或目录',
    '- regex 模式不保留 CSS 样式、布局和动画',
    '- browser 模式需要 chrome-devtools MCP 已连接就绪',
  ].join('\n'),
  args: {
    file: z.string().min(1).describe('HTML 文件路径或幻灯片目录路径，支持绝对路径或相对于工作区的相对路径。传入目录时自动识别 slide-01.html..slide-NN.html 多文件格式'),
    title: z.string().optional().describe('演示文稿标题，省略时从 HTML 的 h1 或 title 标签提取，目录模式 fallback 到目录名'),
    output: z.string().optional().describe('输出 PPTX 文件路径，省略时自动生成到 ae/documents/pptx/'),
    slide_separator: z.enum(['section', 'hr', 'h1', 'auto']).optional().describe('幻灯片分页策略：section 按 <section> 分页，hr 按 <hr> 分页，h1 按 <h1> 分页，auto 自动选择（默认）。仅对单文件 HTML 有效，多文件目录自动忽略此参数'),
    browser_render: z.boolean().optional().describe('是否使用浏览器渲染模式提取精确布局和样式（需要 chrome-devtools MCP）'),
    browser_data: z.string().optional().describe('浏览器提取脚本返回的 JSON 字符串（由 chrome-devtools_evaluate_script 获取），也支持传入工作区内 JSON 文件路径'),
  },
  execute: async (args, ctx) => {
    const worktree = resolve(ctx.worktree)
    const renderMode = args.browser_render ? 'browser' : 'regex'

    const resolvedPath = isAbsolute(args.file) ? args.file : resolve(worktree, args.file)
    if (!existsSync(resolvedPath)) {
      return {
        output: formatFailedResult(`路径不存在：${args.file}。请检查路径是否正确。`),
        metadata: { tool: TOOL.AE_HTML_TO_PPTX, status: 'failed' },
      }
    }

    const isDirectory = statSync(resolvedPath).isDirectory()
    const isSlidesForge = isDirectory && isSlidesForgeDirectory(resolvedPath)

    ctx.metadata({
      title: `HTML 转 PPTX: ${args.file} (${renderMode}${isSlidesForge ? ', 目录模式' : ''})`,
      metadata: { isDirectory, isSlidesForge },
    })

    try {
      // 目录模式 + 浏览器渲染 + 无 browser_data → 创建合并 HTML 并返回浏览器步骤指令
      if (isSlidesForge && args.browser_render && !args.browser_data) {
        const mergedPath = createMergedSlidesHtml(resolvedPath)
        const separator = 'section'
        const instruction = formatBrowserStepInstruction(mergedPath, separator)
        return {
          output: instruction,
          metadata: {
            tool: TOOL.AE_HTML_TO_PPTX,
            status: 'browser_step_instruction',
            renderMode: 'browser',
            inputMode: 'directory',
            mergedPath,
          },
        }
      }

      // 目录模式 + 浏览器渲染 + 有 browser_data → 用合并 HTML 处理 browser 数据
      if (isSlidesForge && args.browser_render && args.browser_data) {
        let browserData = args.browser_data
        const maybePath = isAbsolute(browserData) ? browserData : resolve(worktree, browserData)
        if (existsSync(maybePath) && maybePath.endsWith('.json')) {
          browserData = readFileSync(maybePath, 'utf-8')
        }

        // 如果合并文件不存在（可能被手动删除），重新创建
        const mergedPath = join(resolvedPath, '_ae_merged_tmp.html')
        const actualMergedPath = existsSync(mergedPath) ? mergedPath : createMergedSlidesHtml(resolvedPath)
        try {
          const mcpExecutor = async (_script: string) => browserData
          const result = await convertHtmlToPptx({
            file: actualMergedPath,
            worktree,
            title: args.title ?? basename(resolvedPath),
            outputPath: args.output,
            slideSeparator: 'section',
            mcpExecutor,
          })
          return {
            output: formatResult(result, 'browser (directory)'),
            metadata: {
              tool: TOOL.AE_HTML_TO_PPTX,
              status: 'success',
              renderMode: 'browser',
              inputMode: 'directory',
              outputPath: result.outputPath,
              slideCount: result.slideCount,
            },
          }
        } finally {
          cleanupMergedHtml(resolvedPath)
        }
      }

      // 目录模式 + regex → 直接转换每个 slide 文件
      if (isSlidesForge) {
        const result = await convertDirectorySlidesToPptxRegex(
          resolvedPath,
          worktree,
          args.title,
          args.output,
        )
        return {
          output: formatResult(result, 'regex (directory)'),
          metadata: {
            tool: TOOL.AE_HTML_TO_PPTX,
            status: 'success',
            renderMode: 'regex',
            inputMode: 'directory',
            outputPath: result.outputPath,
            slideCount: result.slideCount,
          },
        }
      }

      // 单文件模式（原逻辑）
      if (args.browser_render && !args.browser_data) {
        const separator = args.slide_separator ?? 'auto'
        return {
          output: formatBrowserStepInstruction(args.file, separator),
          metadata: {
            tool: TOOL.AE_HTML_TO_PPTX,
            status: 'browser_step_instruction',
            renderMode: 'browser',
            inputMode: 'file',
          },
        }
      }

      let browserData = args.browser_data ?? ''
      const maybePath = isAbsolute(browserData) ? browserData : resolve(worktree, browserData)
      if (maybePath && !isInsideRoot(worktree, maybePath)) {
        return `浏览器提取数据路径超出工作区边界：${args.browser_data}。请使用工作区内的文件路径。`
      }
      if (existsSync(maybePath) && maybePath.endsWith('.json')) {
        browserData = readFileSync(maybePath, 'utf-8')
      }

      const mcpExecutor = browserData
        ? async (_script: string) => browserData
        : undefined

      const result = await convertHtmlToPptx({
        file: args.file,
        worktree,
        title: args.title,
        outputPath: args.output,
        slideSeparator: args.slide_separator,
        mcpExecutor,
      })

      return {
        output: formatResult(result, renderMode),
        metadata: {
          tool: TOOL.AE_HTML_TO_PPTX,
          status: 'success',
          renderMode,
          inputMode: 'file',
          outputPath: result.outputPath,
          slideCount: result.slideCount,
        },
      }
    } catch (error) {
      if (isSlidesForge) {
        cleanupMergedHtml(resolvedPath)
      }
      return {
        output: formatFailedResult(formatHtmlToPptxError(error)),
        metadata: { tool: TOOL.AE_HTML_TO_PPTX, status: 'failed' },
      }
    }
  },
})
