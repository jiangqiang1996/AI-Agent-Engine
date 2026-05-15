/**
 * AE 工作流产物目录路径常量。
 * 所有 `docs/ae/` 下的路径段集中定义，避免跨模块硬编码。
 */
export const DOCS_AE_ROOT = 'docs/ae'

/** `docs/ae/` 下的子目录名常量，供路径拼接和排除规则引用。 */
export const DOCS_AE_SUBDIRS = {
  BRAINSTORMS: 'brainstorms',
  PLANS: 'plans',
  WORK: 'work',
  REVIEW: 'review',
  GATES: 'gates',
  REVIEWS: 'reviews',
  HANDOFFS: 'handoffs',
  GRAPHS: 'graphs',
} as const

/**
 * 拼接 `docs/ae/<subdir>` 路径。
 * 用于代码逻辑中的路径构建，不适用于工具描述等人类可读字符串。
 */
export function docsAePath(subdir: string): string {
  return `${DOCS_AE_ROOT}/${subdir}`
}
