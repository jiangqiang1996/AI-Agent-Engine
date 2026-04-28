export function resolveLocalJsonPointer(document: unknown, pointer: string): unknown {
  if (!pointer.startsWith('#/')) return { $ref: pointer, description: '外部引用首版暂不展开。' }

  const parts = pointer.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
  let current = document
  for (const part of parts) {
    if (typeof current !== 'object' || current === null || !(part in current)) {
      return { $ref: pointer, description: '引用不存在，无法展开。' }
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
