import TurndownService from 'turndown'

export interface TurndownOptions {
  keepDataUris?: boolean
}

export function createTurndownService(options: TurndownOptions = {}): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  })

  service.addRule('strikethrough', {
    filter: ['del', 's', 'strike'] as unknown as TurndownService.Filter,
    replacement: (content) => `~~${content}~~`,
  })

  service.addRule('truncateDataUriImages', {
    filter: 'img' as unknown as TurndownService.Filter,
    replacement: (_content: string, node: TurndownService.Node) => {
      const el = node as HTMLElement
      const alt = el.getAttribute('alt') || ''
      let src = el.getAttribute('src') || el.getAttribute('data-src') || ''
      const title = el.getAttribute('title') || ''
      const cleanAlt = alt.replace(/\n/g, ' ')
      if (!options.keepDataUris && src.startsWith('data:')) {
        src = src.split(',')[0] + '...'
      }
      const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : ''
      return src ? `![${cleanAlt}](${src}${titlePart})` : cleanAlt
    },
  })

  return service
}

export const turndownService = createTurndownService()
