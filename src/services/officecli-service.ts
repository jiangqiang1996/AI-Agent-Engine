import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const oc = require('@officecli/sdk') as {
  open: (filePath: string, options?: { binary?: string; timeoutMs?: number; autoInstall?: boolean }) => Promise<OfficeCliDocument>
  create: (filePath: string, args?: string[], options?: { binary?: string; timeoutMs?: number; autoInstall?: boolean }) => Promise<OfficeCliDocument>
  install: () => void
}

export interface OfficeCliDocument {
  path: string
  send(item: Record<string, unknown>, asJson?: boolean, timeoutMs?: number): Promise<unknown>
  batch(items: Record<string, unknown>[], options?: { force?: boolean; stopOnError?: boolean; timeoutMs?: number }): Promise<unknown>
  alive(timeoutMs?: number): Promise<boolean>
  close(): Promise<unknown>
}

export interface OfficeCliBatchItem {
  command?: string
  op?: string
  path?: string
  parent?: string
  type?: string
  index?: number | string
  after?: string
  before?: string
  to?: string
  selector?: string
  props?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * 在 try/finally 中管理文档句柄。
 * open 在 try 第一行，close 在 finally 中，确保异常时也能释放。
 */
export async function withDocument<T>(
  filePath: string,
  fn: (doc: OfficeCliDocument) => Promise<T>,
  opts?: { create?: boolean; args?: string[] },
): Promise<T> {
  const doc = opts?.create
    ? await oc.create(filePath, opts.args ?? [])
    : await oc.open(filePath, { autoInstall: true })
  try {
    return await fn(doc)
  } finally {
    // close 失败不应掩盖 fn 抛出的原始错误
    await doc.close().catch(() => {})
  }
}

/**
 * 对文档执行单条命令并返回结果。
 * 内部通过 withDocument 管理 open/close 生命周期。
 */
export async function sendCommand(
  filePath: string,
  item: OfficeCliBatchItem,
  opts?: { create?: boolean; asJson?: boolean },
): Promise<unknown> {
  return await withDocument(
    filePath,
    async (doc) => await doc.send(item, opts?.asJson ?? true),
    opts,
  )
}

/**
 * 对文档执行批量命令并返回结果。
 * 内部通过 withDocument 管理 open/close 生命周期。
 */
export async function batchCommands(
  filePath: string,
  items: OfficeCliBatchItem[],
  opts?: { create?: boolean; force?: boolean; stopOnError?: boolean },
): Promise<unknown> {
  return await withDocument(
    filePath,
    async (doc) => await doc.batch(items, { force: opts?.force ?? true, stopOnError: opts?.stopOnError ?? false }),
    opts,
  )
}
