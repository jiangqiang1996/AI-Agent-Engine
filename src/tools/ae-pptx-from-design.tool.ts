import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { loadDesignFile, translateDesignFile, loadAllTemplates, clearTemplateCache } from '../services/pptx-template-translator.js'
import { runAssertions, formatAssertionReport } from '../services/pptx-design-assertions.js'
import { processPptx } from '../services/pptx-service.js'
import { generateDocumentOutputPath } from '../utils/document-output-path.js'
import { join } from 'node:path'
import { formatDocumentToolError } from '../utils/document-tool-errors.js'

const operationSchema = z.enum([
  'translate',
  'assert',
  'generate',
  'list-templates',
  'translate-and-generate',
])

export const aePptxFromDesignTool = tool({
  description: [
    'PPTX 模板驱动生成工具：从结构化设计文件（YAML）翻译为 PPTX 元素并生成演示文稿。',
    '',
    '功能说明：',
    '- translate：读取设计文件，翻译为 ae-pptx 元素数组（不生成 PPTX）',
    '- assert：对设计文件运行 17 条结构化断言（字号/对比度/安全区/主题锁定等）',
    '- generate：从设计文件翻译后直接生成 PPTX 文件',
    '- list-templates：列出所有可用模板及其 slot 和 token 定义',
    '- translate-and-generate：翻译 + 断言 + 生成一步完成',
    '',
    '适用场景：',
    '- ae:pptx-from-outline 技能驱动的设计文件生成 PPTX',
    '- 用户编辑设计文件后重新生成 PPTX',
    '- 验证设计文件是否符合结构化断言',
    '',
    '不适用场景：',
    '- 自由创建 PPTX（使用 ae-pptx 工具）',
    '- 编辑已有 PPTX 的文本（使用 ae-pptx 的 edit 操作）',
  ].join('\n'),
  args: {
    operation: operationSchema.describe('操作类型'),
    designFilePath: z
      .string()
      .optional()
      .describe('设计文件路径（YAML），translate/assert/generate/translate-and-generate 操作必填'),
    outputPath: z
      .string()
      .optional()
      .describe('PPTX 输出路径，generate/translate-and-generate 操作可选，默认写入 ae/documents/pptx/'),
    skipAssertions: z
      .boolean()
      .optional()
      .describe('translate-and-generate 操作时是否跳过断言检查，默认 false'),
  },
  execute: async (args, ctx) => {
    try {
      ctx.metadata({ title: `PPTX 模板驱动: ${args.operation}`, metadata: { operation: args.operation } })

      // ==================== list-templates ====================
      if (args.operation === 'list-templates') {
        clearTemplateCache()
        const templates = loadAllTemplates()
        const lines: string[] = []
        lines.push(`可用模板（${templates.size} 个）：`)
        lines.push('')
        for (const [name, tmpl] of templates) {
          lines.push(`## ${name}`)
          lines.push(`  描述: ${tmpl.description}`)
          lines.push(`  分类: ${tmpl.category}`)
          lines.push(`  Slots (${tmpl.slots.length}):`)
          for (const slot of tmpl.slots) {
            lines.push(`    - ${slot.slot} (${slot.type})`)
          }
          lines.push(`  Tokens:`)
          for (const [tokenName, tokenDef] of Object.entries(tmpl.tokens)) {
            const req = tokenDef.required ? '必填' : '可选'
            lines.push(`    - ${tokenName} (${tokenDef.type}, ${req}): ${tokenDef.description}`)
          }
          lines.push('')
        }
        return {
          output: lines.join('\n'),
          metadata: {
            tool: TOOL.AE_PPTX,
            operation: args.operation,
            templateCount: templates.size,
          },
        }
      }

      // ==================== 其余操作需要 designFilePath ====================
      if (!args.designFilePath) {
        return `${args.operation} 操作需要 designFilePath 参数。请提供设计文件路径（YAML）。`
      }

      const { resolveDocumentPath } = await import('../services/document-file-loader.js')
      let designPath: string
      try {
        designPath = await resolveDocumentPath(args.designFilePath, ctx.worktree)
      } catch {
        designPath = args.designFilePath
      }

      // ==================== translate ====================
      if (args.operation === 'translate') {
        const designFile = loadDesignFile(designPath)
        const translation = translateDesignFile(designFile)
        const lines: string[] = []
        lines.push(`翻译完成：${translation.pages.length} 页`)
        if (translation.errors.length > 0) {
          lines.push('')
          lines.push('错误：')
          for (const err of translation.errors) {
            lines.push(`  - ${err}`)
          }
        }
        lines.push('')
        for (const page of translation.pages) {
          lines.push(`## 页 ${page.pageId} (${page.template})`)
          lines.push(`  元素数: ${page.elements.length}`)
          for (const el of page.elements) {
            lines.push(`  - ${el.type}${el.slot ? ` (slot: ${el.slot})` : ''}`)
          }
          lines.push('')
        }
        return {
          output: lines.join('\n'),
          metadata: {
            tool: TOOL.AE_PPTX,
            operation: args.operation,
            pageCount: translation.pages.length,
            errorCount: translation.errors.length,
          },
        }
      }

      // ==================== assert ====================
      if (args.operation === 'assert') {
        const designFile = loadDesignFile(designPath)
        const translation = translateDesignFile(designFile)
        const report = runAssertions(designFile, translation)
        return {
          output: formatAssertionReport(report),
          metadata: {
            tool: TOOL.AE_PPTX,
            operation: args.operation,
            totalAssertions: report.totalAssertions,
            passed: report.passed,
            failed: report.failed,
            warnings: report.warnings,
            blockingErrorCount: report.blockingErrors.length,
          },
        }
      }

      // ==================== generate / translate-and-generate ====================
      if (args.operation === 'generate' || args.operation === 'translate-and-generate') {
        const designFile = loadDesignFile(designPath)
        const translation = translateDesignFile(designFile)

        if (translation.errors.length > 0) {
          return `翻译失败，存在 ${translation.errors.length} 个错误：\n${translation.errors.join('\n')}`
        }

        // 断言检查（除非跳过）
        if (args.operation === 'translate-and-generate' && !args.skipAssertions) {
          const report = runAssertions(designFile, translation)
          if (report.blockingErrors.length > 0) {
            return `断言检查未通过，存在 ${report.blockingErrors.length} 个阻断错误：\n${formatAssertionReport(report)}`
          }
        }

        if (translation.pages.length === 0) {
          return '设计文件中无有效页面，无法生成 PPTX。'
        }

        // 生成 PPTX
        const outputPath = args.outputPath ?? generateDocumentOutputPath(ctx.worktree, 'pptx', designFile.title, 'create')

        // 构建第一页
        const firstPage = translation.pages[0]
        if (!firstPage) {
          return '无第一页'
        }
        const firstSlide = {
          background: firstPage.background,
          elements: firstPage.elements,
        }

        const firstResult = await processPptx({
          operation: 'create',
          worktree: ctx.worktree,
          title: designFile.title,
          slides: [firstSlide],
          outputPath,
          layout: designFile.globalStyle.layout.size,
        })

        // 追加剩余页
        for (let i = 1; i < translation.pages.length; i++) {
          const page = translation.pages[i]
          if (!page) continue
          await processPptx({
            operation: 'append-slides',
            worktree: ctx.worktree,
            file: outputPath,
            slides: [{
              background: page.background,
              elements: page.elements,
            }],
          })
        }

        const lines: string[] = []
        lines.push(`PPTX 生成完成：${translation.pages.length} 页`)
        lines.push(`输出路径: ${outputPath}`)
        lines.push(`模板: ${translation.pages.map((p) => p.template).join(', ')}`)
        if (args.operation === 'translate-and-generate' && !args.skipAssertions) {
          const report = runAssertions(designFile, translation)
          lines.push('')
          lines.push(formatAssertionReport(report))
        }

        return {
          output: lines.join('\n'),
          metadata: {
            tool: TOOL.AE_PPTX,
            operation: args.operation,
            outputPath,
            pageCount: translation.pages.length,
            title: designFile.title,
          },
        }
      }

      return `不支持的 operation: ${args.operation}`
    } catch (error) {
      return formatDocumentToolError('PPTX-from-design', error)
    }
  },
})
