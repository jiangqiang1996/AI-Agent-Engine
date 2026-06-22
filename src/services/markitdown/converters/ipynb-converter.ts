import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'

interface IpynbNotebook {
  cells: Array<{
    cell_type: string
    source: string | string[]
    outputs?: unknown[]
  }>
  metadata?: {
    kernelspec?: { name?: string; display_name?: string }
    title?: string
  }
}

export class IpynbConverter implements DocumentConverter {
  format = 'ipynb' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'ipynb'
  }

  static convertIpynb(text: string): ConverterResult {
    const notebook: IpynbNotebook = JSON.parse(text)
    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      throw new MarkitdownError('ipynb_convert_failed', 'IPYNB 文件格式无效：缺少 cells 字段。')
    }

    const mdOutput: string[] = []
    let title: string | undefined

    for (const cell of notebook.cells) {
      const sourceLines = Array.isArray(cell.source) ? cell.source : [cell.source ?? '']
      const source = sourceLines.join('')

      if (cell.cell_type === 'markdown') {
        mdOutput.push(source)
        if (title === undefined) {
          for (const line of sourceLines) {
            if (typeof line === 'string' && line.startsWith('# ')) {
              title = line.replace(/^[# ]+/, '').trim()
              break
            }
          }
        }
      } else if (cell.cell_type === 'code') {
        mdOutput.push('```python\n' + source + '\n```')
      } else if (cell.cell_type === 'raw') {
        mdOutput.push('```\n' + source + '\n```')
      }
    }

    const markdown = mdOutput.join('\n\n')
    const metadataTitle = notebook.metadata?.title
    if (metadataTitle) title = metadataTitle

    return { markdown, title }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return IpynbConverter.convertIpynb(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'ipynb_convert_failed',
        `IPYNB 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
