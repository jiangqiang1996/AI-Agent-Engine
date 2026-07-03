import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'

let pdfjsModule: any = null
let canvasModule: any = null

async function getPdfjsModule(): Promise<any> {
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
  return pdfjsModule
}

async function getCanvasModule(): Promise<any> {
  if (!canvasModule) {
    try {
      canvasModule = await import('@napi-rs/canvas')
    } catch {
      throw new Error('无法加载 @napi-rs/canvas，请确认已安装 npm 依赖')
    }
  }
  return canvasModule
}

class NodeCanvasFactory {
  private canvasApi: any

  constructor(canvasApi: any) {
    this.canvasApi = canvasApi
  }

  create(width: number, height: number) {
    const canvas = this.canvasApi.createCanvas(width, height)
    const context = canvas.getContext('2d')
    return { canvas, context }
  }

  reset(canvasAndContext: { canvas: any; context: any }, width: number, height: number) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }

  destroy(canvasAndContext: { canvas: any; context: any }) {
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
  pdfjs.GlobalWorkerOptions.workerSrc = ''

  const canvasApi = await getCanvasModule()
  const canvasFactory = new NodeCanvasFactory(canvasApi)

  mkdirSync(outputDir, { recursive: true })

  const data = new Uint8Array(await import('node:fs').then(fs => fs.promises.readFile(resolve(filePath))))
  const doc = await pdfjs.getDocument({ data }).promise
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
