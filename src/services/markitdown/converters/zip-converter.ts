import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { detectFormat } from '../../markitdown-types.js'
import { ZIP_MAX_DEPTH } from '../constants.js'

export class ZipConverter implements DocumentConverter {
  format = 'zip' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'zip'
  }

  /**
   * 递归转换 ZIP 内文件
   * @param converters 外部注入的转换器列表（避免与 index.ts 循环依赖）
   * @param depth 当前递归深度，防止 ZIP 炸弹
   */
  static async convertZip(
    buffer: Buffer,
    zipFilePath: string,
    converters: DocumentConverter[],
    depth = 0,
  ): Promise<ConverterResult> {
    if (depth >= ZIP_MAX_DEPTH) {
      return { markdown: `Content from the zip file \`${zipFilePath}\`:\n\n[最大递归深度已达上限]` }
    }

    const JSZip = (await import('jszip')).default
    const zip = await JSZip.loadAsync(buffer)

    let mdContent = `Content from the zip file \`${zipFilePath}\`:\n\n`

    const fileNames = Object.keys(zip.files).sort()
    for (const name of fileNames) {
      const file = zip.files[name]
      if (file.dir) continue

      try {
        const format = detectFormat(name)
        if (!format) continue

        const fileBuffer = Buffer.from(await file.async('arraybuffer'))

        // 嵌套 ZIP 直接递归处理，传递 depth+1 确保深度限制生效
        if (format === 'zip') {
          const nestedResult = await ZipConverter.convertZip(fileBuffer, name, converters, depth + 1)
          if (nestedResult.markdown) {
            mdContent += `## File: ${name}\n\n`
            mdContent += nestedResult.markdown + '\n\n'
          }
          continue
        }

        const converter = converters.find((c) => c.accept(name, format))
        if (!converter) continue

        const isTextFormat = ['html', 'csv', 'json', 'xml', 'yaml', 'text', 'markdown', 'ipynb', 'rss'].includes(
          format,
        )

        let textContent = ''
        if (isTextFormat) {
          textContent = fileBuffer.toString('utf8').replace(/^\uFEFF/, '')
        }

        const result = await converter.convert({
          filePath: name,
          textContent,
          binaryContent: fileBuffer,
          format,
        })

        if (result.markdown) {
          mdContent += `## File: ${name}\n\n`
          mdContent += result.markdown + '\n\n'
        }
      } catch {
        // 跳过不支持或转换失败的文件（匹配 Python 参考行为）
      }
    }

    return { markdown: mdContent.trim() }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      // 延迟导入转换器注册表，打破与 index.ts 的循环依赖
      const { createTextConverters, createBinaryConverters } = await import('./converter-registry.js')
      const converters = [...createTextConverters(), ...createBinaryConverters()]
      return await ZipConverter.convertZip(input.binaryContent, input.filePath, converters, 0)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'zip_convert_failed',
        `ZIP 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}

