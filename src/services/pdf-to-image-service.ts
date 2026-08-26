import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, basename, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

let pdfjsModule: unknown = null
let canvasModule: unknown = null
let workerInitialized = false

async function getPdfjsModule(): Promise<Record<string, unknown>> {
  if (!pdfjsModule) {
    try {
      pdfjsModule = await import('pdfjs-dist/legacy/build/pdf.mjs')
    } catch {
      try {
        pdfjsModule = await import('pdfjs-dist')
      } catch {
        throw new Error('无法加载 pdfjs-dist，请确认已安装 npm 依赖')
      }
    }
  }

  const pdfjs = pdfjsModule as Record<string, unknown>
  if (!workerInitialized && pdfjs.GlobalWorkerOptions) {
    const success = await setupPdfjsWorker(pdfjs)
    if (success) {
      workerInitialized = true
    }
  }

  return pdfjs
}

/**
 * Node.js 环境下配置 pdfjs worker，避免 "No GlobalWorkerOptions.workerSrc specified" 错误。
 * 按优先级尝试两种方案：file:// URL workerSrc、空字符串降级（fake worker）。
 * 返回 true 表示成功配置，false 表示降级（后续调用可重试）。
 *
 * 注意：不使用 node:worker_threads Worker 方案，因为 pdfjs worker.mjs
 * 依赖 fetch/Response 等 Web API，worker_threads 不提供这些。
 */
async function setupPdfjsWorker(pdfjs: Record<string, unknown>): Promise<boolean> {
  const workerOpts = pdfjs.GlobalWorkerOptions as { workerSrc: string } | undefined
  // 方案1：设置 workerSrc 为 file:// URL（最可靠）
  const workerPath = resolveWorkerPath()
  if (workerPath && workerOpts) {
    try {
      workerOpts.workerSrc = pathToFileURL(workerPath).href
      return true
    } catch {
      // file:// URL 设置失败，继续降级
    }
  }

  // 方案2：空字符串，让 pdfjs 使用 fake worker（最后手段）
  if (workerOpts) {
    workerOpts.workerSrc = ''
  }
  return false
}

/**
 * 解析 pdfjs worker 模块路径，兼容 legacy/build、build、.mjs、.js 多种结构。
 */
function resolveWorkerPath(): string | null {
  const candidates = [
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
    'pdfjs-dist/build/pdf.worker.mjs',
    'pdfjs-dist/legacy/build/pdf.worker.js',
    'pdfjs-dist/build/pdf.worker.js',
  ]

  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate)
      if (resolved && existsSync(resolved)) return resolved
    } catch {
      // 继续尝试下一个候选路径
    }
  }

  // 从主模块路径推断 worker 路径
  for (const mainModule of ['pdfjs-dist/legacy/build/pdf.mjs', 'pdfjs-dist/build/pdf.mjs']) {
    try {
      const mainPath = require.resolve(mainModule)
      for (const workerName of ['pdf.worker.mjs', 'pdf.worker.js']) {
        const workerPath = join(dirname(mainPath), workerName)
        if (existsSync(workerPath)) return workerPath
      }
    } catch {
      // 继续
    }
  }

  return null
}

async function getCanvasModule(): Promise<Record<string, unknown>> {
  if (!canvasModule) {
    try {
      canvasModule = require('@napi-rs/canvas')
    } catch {
      throw new Error('无法加载 @napi-rs/canvas，请确认已安装 npm 依赖')
    }
  }
  return canvasModule as Record<string, unknown>
}

class NodeCanvasFactory {
  private canvasApi: Record<string, unknown>

  constructor(canvasApi: Record<string, unknown>) {
    this.canvasApi = canvasApi
  }

  create(width: number, height: number) {
    const createCanvas = this.canvasApi.createCanvas as (w: number, h: number) => { getContext: (t: string) => unknown; toBuffer: (format: string) => Buffer; width: number; height: number }
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    return { canvas, context }
  }

  reset(canvasAndContext: { canvas: { width: number; height: number }; context: unknown }, width: number, height: number) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }

  destroy(canvasAndContext: { canvas: { width: number; height: number }; context: unknown }) {
    canvasAndContext.canvas.width = 0
    canvasAndContext.canvas.height = 0
    canvasAndContext.context = null
  }
}

export interface PdfToImageOptions {
  filePath: string
  outputDir: string
  pageIndices?: number[]
  scale?: number
}

export async function pdfToImages(options: PdfToImageOptions): Promise<string[]> {
  const { filePath, outputDir, pageIndices, scale = 2.0 } = options

  const pdfjs = await getPdfjsModule()

  const canvasApi = await getCanvasModule()
  const canvasFactory = new NodeCanvasFactory(canvasApi)

  mkdirSync(outputDir, { recursive: true })

  const data = new Uint8Array(await import('node:fs').then(fs => fs.promises.readFile(resolve(filePath))))
  type PdfPage = { getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (opts: { canvasContext: unknown; viewport: unknown; canvas: unknown }) => { promise: Promise<unknown> } }
  type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; cleanup: () => void }
  const getDocument = pdfjs.getDocument as (params: { data: Uint8Array }) => { promise: Promise<PdfDoc> }
  const doc = await getDocument({ data }).promise
  const totalPages = doc.numPages

  const pagesToRender = pageIndices ?? Array.from({ length: totalPages }, (_, i) => i + 1)
  const outputFiles: string[] = []

  try {
    for (const pageNum of pagesToRender) {
      if (pageNum < 1 || pageNum > totalPages) {
        continue
      }

      const page = await doc.getPage(pageNum)
      const viewport = page.getViewport({ scale })

      const canvasAndContext = canvasFactory.create(viewport.width, viewport.height)

      try {
        await page.render({
          canvasContext: canvasAndContext.context as unknown as CanvasRenderingContext2D,
          viewport,
          canvas: canvasAndContext.canvas as unknown as HTMLCanvasElement,
        }).promise

        const pngData = canvasAndContext.canvas.toBuffer('image/png')
        const outputFileName = `${basename(filePath, '.pdf')}_page_${pageNum}.png`
        const outputPath = join(outputDir, outputFileName)

        writeFileSync(outputPath, pngData)
        outputFiles.push(outputPath)
      } finally {
        canvasFactory.destroy(canvasAndContext)
      }
    }
  } finally {
    await doc.cleanup()
  }

  return outputFiles
}
