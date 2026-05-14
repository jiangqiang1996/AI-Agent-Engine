import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Language, Parser as WasmParser } from 'web-tree-sitter'

interface WasmParserModule {
  Parser: { new (): WasmParser; init(options?: { locateFile?(scriptName: string, scriptDirectory: string): string }): Promise<void> }
  Language: { load(path: string): Promise<Language> }
}

function isWasmParserModule(value: unknown): value is WasmParserModule {
  return !!value
    && typeof value === 'object'
    && 'Parser' in value
    && 'Language' in value
}

let parserModule: WasmParserModule | null = null
let initPromise: Promise<void> | null = null

function locateWasmFile(scriptName: string): string {
  const candidates = [
    tryFromDist(scriptName),
    tryFromNodeModules(scriptName),
  ]
  return candidates.find((p) => p !== null) ?? scriptName
}

function tryFromDist(scriptName: string): string | null {
  try {
    const distAssetsDir = findDistAssetsDir()
    if (distAssetsDir) {
      const wasmPath = join(distAssetsDir, 'wasm', scriptName)
      if (existsSync(wasmPath)) {
        return wasmPath
      }
    }
  } catch {
    // 降级
  }
  return null
}

function tryFromNodeModules(scriptName: string): string | null {
  try {
    const moduleDir = findModuleDir()
    if (moduleDir) {
      const wasmPath = join(moduleDir, 'web-tree-sitter', scriptName)
      if (existsSync(wasmPath)) {
        return wasmPath
      }
    }
  } catch {
    // 降级
  }
  return null
}

function findDistAssetsDir(): string | null {
  try {
    const callerDir = findCallerDir()
    const candidates = [
      join(callerDir, 'assets'),
      join(callerDir, '..', 'assets'),
      join(callerDir, '..', '..', 'assets'),
    ]
    for (const dir of candidates) {
      const resolved = resolve(dir)
      if (existsSync(resolved) && existsSync(join(resolved, 'wasm'))) {
        return resolved
      }
    }
  } catch {
    // 降级
  }
  return null
}

function findModuleDir(): string | null {
  try {
    const callerDir = findCallerDir()
    const candidates = [
      join(callerDir, '..', '..', 'node_modules'),
      join(callerDir, '..', '..', '..', 'node_modules'),
    ]
    for (const dir of candidates) {
      const resolved = resolve(dir)
      if (existsSync(join(resolved, 'web-tree-sitter'))) {
        return resolved
      }
    }
  } catch {
    // 降级
  }
  return null
}

function findCallerDir(): string {
  try {
    const url = import.meta.url
    if (url) {
      return dirname(fileURLToPath(url))
    }
  } catch {
    // 降级
  }
  return process.cwd()
}

async function ensureParser(): Promise<WasmParserModule> {
  if (parserModule) {
    return parserModule
  }
  if (!initPromise) {
    initPromise = (async () => {
      const imported = await import('web-tree-sitter')
      const mod = isWasmParserModule(imported.default) ? imported.default : imported
      await mod.Parser.init({ locateFile: locateWasmFile })
      parserModule = mod
    })().catch((error: unknown) => {
      initPromise = null
      parserModule = null
      throw error
    })
  }
  await initPromise
  return parserModule!
}

export interface TreeSitterLanguageHandle {
  parse(content: string): TreeSitterTreeResult
  dispose(): void
}

interface TreeSitterTreeResult {
  rootNode: {
    type: string
    childCount: number
    children: TreeSitterNode[]
    text: string
    startIndex: number
    endIndex: number
    childForFieldName(name: string): TreeSitterNode | null
    childrenByFieldName(name: string): TreeSitterNode[]
  }
}

interface TreeSitterNode {
  type: string
  text: string
  startIndex: number
  endIndex: number
  childCount: number
  children: TreeSitterNode[]
  childForFieldName(name: string): TreeSitterNode | null
  childrenByFieldName(name: string): TreeSitterNode[]
  parent: TreeSitterNode | null
  startPosition: { row: number; column: number }
  endPosition: { row: number; column: number }
}

export async function loadTreeSitterLanguage(wasmFileName: string): Promise<TreeSitterLanguageHandle> {
  const mod = await ensureParser()
  let wasmPath: string | null = null

  const distAssetsDir = findDistAssetsDir()
  if (distAssetsDir) {
    const candidate = join(distAssetsDir, 'wasm', wasmFileName)
    if (existsSync(candidate)) {
      wasmPath = candidate
    }
  }

  if (!wasmPath) {
    const moduleDir = findModuleDir()
    if (moduleDir) {
      const langPkg = wasmFileName.replace('.wasm', '')
      const candidate = join(moduleDir, langPkg, wasmFileName)
      if (existsSync(candidate)) {
        wasmPath = candidate
      }
    }
  }

  if (!wasmPath) {
    throw new Error(`无法定位 tree-sitter 语法 WASM 文件: ${wasmFileName}`)
  }

  const language = await mod.Language.load(wasmPath)
  const parser = new mod.Parser()
  parser.setLanguage(language)

  return {
    parse(content: string) {
      return parser.parse(content) as unknown as TreeSitterTreeResult
    },
    dispose() {
      parser.delete()
    },
  }
}

export async function isTreeSitterAvailable(): Promise<boolean> {
  try {
    await ensureParser()
    return true
  } catch {
    return false
  }
}
