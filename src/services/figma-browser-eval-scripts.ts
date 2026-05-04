export const FIGMA_EXPORT_URLS_SCRIPT_ID = 'figma-export-urls'

export const EVAL_SCRIPTS = {
  [FIGMA_EXPORT_URLS_SCRIPT_ID]: `(() => {
  const allowed = /^https:\/\/s3-alpha-sig\.figma\.com\/img\//
  return {
    pageUrl: location.href,
    resourceUrls: performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => allowed.test(url)),
  }
})()`,
} as const

export type FigmaBrowserEvalScriptId = keyof typeof EVAL_SCRIPTS

export function isValidScriptId(id: string): id is FigmaBrowserEvalScriptId {
  return Object.hasOwn(EVAL_SCRIPTS, id)
}
