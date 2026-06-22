import { parse as parseYaml } from 'yaml'

import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'

export class XmlConverter implements DocumentConverter {
  format = 'xml' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'xml'
  }

  static convertXml(text: string): ConverterResult {
    return { markdown: '```xml\n' + text.trim() + '\n```' }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    return XmlConverter.convertXml(input.textContent)
  }
}

export class YamlConverter implements DocumentConverter {
  format = 'yaml' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'yaml'
  }

  static convertYaml(text: string): ConverterResult {
    parseYaml(text)
    return { markdown: '```yaml\n' + text.trim() + '\n```' }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return YamlConverter.convertYaml(input.textContent)
    } catch (error) {
      throw new MarkitdownError(
        'yaml_parse_failed',
        `YAML 解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
