import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'

/**
 * MSG 流属性标识符
 *
 * Outlook .msg 文件使用固定的流命名约定存储属性：
 * __substg1.0_<propertyTag><propertyType>
 * - propertyTag: 4 字节十六进制属性标识
 * - propertyType: 4 字节十六进制类型标识（001F = 字符串 UTF-16LE，0102 = 二进制）
 *
 * 参考: [MS-OXMSG] Outlook Item File Format
 */
const PROP_SUBJECT = '__substg1.0_0037001F'
const PROP_FROM = '__substg1.0_0C1F001F'
const PROP_TO = '__substg1.0_0E04001F'
const PROP_BODY = '__substg1.0_1000001F'

/**
 * Outlook .msg 转换器
 *
 * 大文件处理策略：
 * - 使用 cfb 库按需读取流，不一次性解码整个文件
 * - 只读取 4 个必要流（Subject/From/To/Body），跳过附件和元数据
 * - 流式解码 UTF-16LE，避免重复转码
 */
export class OutlookMsgConverter implements DocumentConverter {
  format = 'msg' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'msg'
  }

  /**
   * 将 Outlook .msg Buffer 转换为 Markdown
   *
   * 输出格式匹配 markitdown 参考：
   * # Email Message
   *
   * **From:** sender@example.com
   * **To:** recipient@example.com
   * **Subject:** Email Subject
   *
   * ## Content
   *
   * Email body text...
   */
  static async convertMsg(buffer: Buffer): Promise<ConverterResult> {
    const cfb = await import('cfb')
    let cfbFile
    try {
      cfbFile = cfb.read(buffer)
    } catch (error) {
      throw new MarkitdownError(
        'outlook_msg_convert_failed',
        `MSG 文件解析失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }

    const subject = OutlookMsgConverter.readStream(cfbFile, PROP_SUBJECT)
    const from = OutlookMsgConverter.readStream(cfbFile, PROP_FROM)
    const to = OutlookMsgConverter.readStream(cfbFile, PROP_TO)
    const body = OutlookMsgConverter.readStream(cfbFile, PROP_BODY)

    let mdContent = '# Email Message\n\n'
    const headers: Array<[string, string | undefined]> = [
      ['From', from],
      ['To', to],
      ['Subject', subject],
    ]

    for (const [key, value] of headers) {
      if (value) {
        mdContent += `**${key}:** ${value}\n`
      }
    }

    mdContent += '\n## Content\n\n'
    if (body) {
      mdContent += body
    }

    return {
      markdown: mdContent.trim(),
      ...(subject ? { title: subject } : {}),
    }
  }

  /**
   * 从 CFB 文件中读取字符串流
   *
   * MSG 字符串流通常以 UTF-16LE 编码存储，部分旧版本使用 UTF-8。
   * 按以下顺序尝试解码：
   * 1. UTF-16LE（最常见）
   * 2. UTF-8（回退）
   * 3. UTF-8 ignore（最后兜底，避免抛异常）
   */
  private static readStream(cfbFile: unknown, streamPath: string): string | undefined {
    const fileIndex = (cfbFile as { FileIndex: Array<{ name: string; content: Uint8Array }> }).FileIndex
    const stream = fileIndex.find((e) => e.name === streamPath)
    if (!stream || !stream.content) return undefined

    const data = Buffer.from(stream.content)
    if (data.length === 0) return undefined

    // 尝试 UTF-16LE（MSG 标准编码）
    if (OutlookMsgConverter.looksLikeUtf16Le(data)) {
      const text = data.toString('utf16le').trim()
      if (text) return text
    }

    // 回退到 UTF-8
    try {
      return data.toString('utf8').trim()
    } catch {
      return data.toString('utf8', undefined, undefined).trim()
    }
  }

  /**
   * 启发式检测 Buffer 是否为 UTF-16LE 编码
   *
   * 检查奇数索引位置（UTF-16LE 高字节）是否大量为 0x00，
   * 这是 ASCII/Latin 范围字符在 UTF-16LE 中的典型特征。
   */
  private static looksLikeUtf16Le(data: Buffer): boolean {
    if (data.length < 2) return false
    // 采样前 256 字节（或全部），统计奇数位置为 0 的比例
    const sampleLen = Math.min(data.length, 256)
    let zeroHighBytes = 0
    let counted = 0
    for (let i = 1; i < sampleLen; i += 2) {
      counted++
      if (data[i] === 0) zeroHighBytes++
    }
    // 超过 50% 高字节为 0，判定为 UTF-16LE
    return counted > 0 && zeroHighBytes / counted >= 0.5
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return await OutlookMsgConverter.convertMsg(input.binaryContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'outlook_msg_convert_failed',
        `MSG 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
