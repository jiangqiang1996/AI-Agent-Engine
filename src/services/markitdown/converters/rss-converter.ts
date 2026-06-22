import { MarkitdownError } from '../../markitdown-errors.js'
import type { ConverterInput, ConverterResult, DocumentConverter, SupportedFormat } from '../../markitdown-types.js'
import { turndownService } from '../turndown-config.js'
import { getElementsByTagName, getNodeData, parseXml, type SimpleXmlNode } from '../xml-parser.js'

function parseContent(content: string): string {
  try {
    return turndownService.turndown(content).trim() + '\n'
  } catch {
    return content + '\n'
  }
}

export class RssConverter implements DocumentConverter {
  format = 'rss' as const satisfies SupportedFormat
  priority = 100

  accept(_filePath: string, format: SupportedFormat): boolean {
    return format === 'rss'
  }

  static convertRss(text: string): ConverterResult {
    const doc = parseXml(text)

    const rssRoot = getElementsByTagName(doc, 'rss')
    const feedRoot = getElementsByTagName(doc, 'feed')

    if (rssRoot.length > 0) {
      return RssConverter.parseRssType(rssRoot[0])
    }
    if (feedRoot.length > 0) {
      const entries = getElementsByTagName(feedRoot[0], 'entry')
      if (entries.length > 0) {
        return RssConverter.parseAtomType(feedRoot[0])
      }
    }
    return { markdown: '' }
  }

  private static parseRssType(root: SimpleXmlNode): ConverterResult {
    const channels = getElementsByTagName(root, 'channel')
    if (channels.length === 0) return { markdown: '' }
    const channel = channels[0]

    const channelTitle = getNodeData(channel, 'title')
    const channelDescription = getNodeData(channel, 'description')
    const items = getElementsByTagName(channel, 'item')

    let mdText = ''
    if (channelTitle) mdText += `# ${channelTitle}\n`
    if (channelDescription) mdText += `${channelDescription}\n`

    for (const item of items) {
      const title = getNodeData(item, 'title')
      const description = getNodeData(item, 'description')
      const pubDate = getNodeData(item, 'pubDate')
      const content = getNodeData(item, 'content:encoded') || getNodeData(item, 'encoded')

      if (title) mdText += `\n## ${title}\n`
      if (pubDate) mdText += `Published on: ${pubDate}\n`
      if (description) mdText += parseContent(description)
      if (content) mdText += parseContent(content)
    }

    return { markdown: mdText, title: channelTitle || undefined }
  }

  private static parseAtomType(root: SimpleXmlNode): ConverterResult {
    const title = getNodeData(root, 'title')
    const subtitle = getNodeData(root, 'subtitle')
    const entries = getElementsByTagName(root, 'entry')

    let mdText = ''
    if (title) mdText += `# ${title}\n`
    if (subtitle) mdText += `${subtitle}\n`

    for (const entry of entries) {
      const entryTitle = getNodeData(entry, 'title')
      const entrySummary = getNodeData(entry, 'summary')
      const entryUpdated = getNodeData(entry, 'updated')
      const entryContent = getNodeData(entry, 'content')

      if (entryTitle) mdText += `\n## ${entryTitle}\n`
      if (entryUpdated) mdText += `Updated on: ${entryUpdated}\n`
      if (entrySummary) mdText += parseContent(entrySummary)
      if (entryContent) mdText += parseContent(entryContent)
    }

    return { markdown: mdText, title: title || undefined }
  }

  async convert(input: ConverterInput): Promise<ConverterResult> {
    try {
      return RssConverter.convertRss(input.textContent)
    } catch (error) {
      if (error instanceof MarkitdownError) throw error
      throw new MarkitdownError(
        'rss_convert_failed',
        `RSS 转换失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
}
