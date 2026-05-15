import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Language, Parser as WasmParser } from 'web-tree-sitter'

interface WasmParserModule {
  Parser: { new (): WasmParser; init(options?: { locateFile?(scriptName: string, scriptDirectory: string): string }): Promise<void> }
  Language: { load(path: string): Promise<Language> }
}

type GrammarPackage = 'tree-sitter-go' | 'tree-sitter-java' | 'tree-sitter-python' | 'tree-sitter-javascript' | 'tree-sitter-typescript'

const GRAMMAR_WASM_MAP: Record<string, { packageName: GrammarPackage; wasmFileName: string }> = {
  go: { packageName: 'tree-sitter-go', wasmFileName: 'tree-sitter-go.wasm' },
  java: { packageName: 'tree-sitter-java', wasmFileName: 'tree-sitter-java.wasm' },
  python: { packageName: 'tree-sitter-python', wasmFileName: 'tree-sitter-python.wasm' },
  javascript: { packageName: 'tree-sitter-javascript', wasmFileName: 'tree-sitter-javascript.wasm' },
  typescript: { packageName: 'tree-sitter-typescript', wasmFileName: 'tree-sitter-typescript.wasm' },
  tsx: { packageName: 'tree-sitter-typescript', wasmFileName: 'tree-sitter-tsx.wasm' },
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
    const cwdCandidates = [
      join(process.cwd(), 'node_modules', 'web-tree-sitter', scriptName),
      join(process.cwd(), 'node_modules', 'web-tree-sitter', 'debug', scriptName),
    ]
    for (const candidate of cwdCandidates) {
      if (existsSync(candidate)) {
        return candidate
      }
    }

    const moduleDir = findModuleDir()
    if (moduleDir) {
      const parserWasmPath = join(moduleDir, 'web-tree-sitter', scriptName)
      if (existsSync(parserWasmPath)) {
        return parserWasmPath
      }

      for (const packageName of new Set(Object.values(GRAMMAR_WASM_MAP).map((item) => item.packageName))) {
        const wasmPath = join(moduleDir, packageName, scriptName)
        if (existsSync(wasmPath)) {
          return wasmPath
        }
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
      join(process.cwd(), 'node_modules'),
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

function resolveGrammarWasmPath(grammarName: string): string {
  const mapping = GRAMMAR_WASM_MAP[grammarName]
  if (!mapping) {
    return grammarName
  }
  const distAssetsDir = findDistAssetsDir()
  if (distAssetsDir) {
    const candidate = join(distAssetsDir, 'wasm', mapping.wasmFileName)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  const moduleDir = findModuleDir()
  if (moduleDir) {
    const candidate = join(moduleDir, mapping.packageName, mapping.wasmFileName)
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return grammarName
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

export interface TreeSitterTreeResult {
  rootNode: TreeSitterNode
  delete(): void
}

export interface TreeSitterNode {
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
  const wasmPath = resolveGrammarWasmPath(wasmFileName)
  if (wasmPath === wasmFileName) {
    throw new Error(`无法定位 tree-sitter 语法 WASM 文件: ${wasmFileName}`)
  }

  const language = await mod.Language.load(wasmPath)
  const parser = new mod.Parser()
  try {
    parser.setLanguage(language)
  } catch (error) {
    parser.delete()
    throw error
  }

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
