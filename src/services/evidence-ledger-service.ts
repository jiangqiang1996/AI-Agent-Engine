import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { docsAePath, DOCS_AE_SUBDIRS } from '../schemas/docs-ae-paths.js'
import {
  EVIDENCE_LEDGER_SCHEMA_VERSION,
  EvidenceIndexSchema,
  EvidenceLedgerEventSchema,
  EvidenceRecordSchema,
  type EvidenceIndex,
  type EvidenceKind,
  type EvidenceLedgerEvent,
  type EvidenceRecord,
  type EvidenceState,
} from '../schemas/evidence-ledger-schema.js'
import { isInsideRoot, isRegularFile, pathContainsSymlink, toPosixPath, toRepoRelativePath } from '../utils/path-utils.js'

const HASH_ALGORITHM = 'sha256'
const LEDGER_FILE = 'ledger.jsonl'
const INDEX_FILE = 'index.json'
const ARTIFACTS_DIR = 'artifacts'

/** 证据账本在当前工作区内的核心路径集合。 */
export interface EvidenceLedgerPaths {
  root: string
  ledger: string
  index: string
  artifacts: string
}

/** 写入单条证据后返回的记录、ledger 事件和 artifact 相对路径。 */
export interface EvidenceWriteResult {
  record: EvidenceRecord
  event: EvidenceLedgerEvent
  artifactPath: string
}

/** 读取证据账本后的可复验记录、诊断和四态汇总。 */
export interface EvidenceReadResult {
  records: EvidenceRecord[]
  diagnostics: string[]
  state: EvidenceState
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

type EvidenceRecordInput = Omit<EvidenceRecord, 'schemaVersion' | 'hashes'> & {
  schemaVersion?: EvidenceRecord['schemaVersion']
  hashes?: Partial<EvidenceRecord['hashes']>
}

/** 获取证据账本目录、ledger、index 和 artifacts 目录路径。 */
export function getEvidenceLedgerPaths(repoRoot: string): EvidenceLedgerPaths {
  const root = join(repoRoot, docsAePath(DOCS_AE_SUBDIRS.EVIDENCE))
  return {
    root,
    ledger: join(root, LEDGER_FILE),
    index: join(root, INDEX_FILE),
    artifacts: join(root, ARTIFACTS_DIR),
  }
}

/** 对证据 payload 或 artifact 内容生成稳定 SHA-256 哈希。 */
export function hashEvidencePayload(payload: unknown): string {
  return createHash(HASH_ALGORITHM).update(stableStringify(toJsonValue(payload)), 'utf8').digest('hex')
}

/** 计算证据记录哈希，计算时排除 recordHash 自身字段。 */
export function hashEvidenceRecord(record: EvidenceRecord): string {
  return hashEvidencePayload(removeRecordHash(record))
}

/** 校验证据记录内声明的 recordHash 是否与当前内容一致。 */
export function verifyRecordHash(record: EvidenceRecord): boolean {
  return record.hashes.recordHash === hashEvidenceRecord(record)
}

/** 补全证据记录 schemaVersion 与 recordHash，并执行 schema 校验。 */
export function completeEvidenceRecord(record: EvidenceRecordInput): EvidenceRecord {
  const baseRecord = EvidenceRecordSchema.parse({
    ...record,
    schemaVersion: record.schemaVersion ?? EVIDENCE_LEDGER_SCHEMA_VERSION,
    hashes: {
      ...record.hashes,
      recordHash: 'pending',
    },
  })
  const recordHash = hashEvidenceRecord(baseRecord)
  return EvidenceRecordSchema.parse({
    ...baseRecord,
    hashes: {
      ...baseRecord.hashes,
      recordHash,
    },
  })
}

/**
 * 写入证据 artifact、追加 ledger 事件并重建 index。
 * 证据 ID 必须是安全文件名片段，避免 artifact 路径逃逸账本目录。
 */
export function writeEvidenceRecord(repoRoot: string, input: EvidenceRecordInput): EvidenceWriteResult {
  const paths = getEvidenceLedgerPaths(repoRoot)
  assertNoSymlinkPath(repoRoot, paths.root, 'evidence 根目录')
  assertNoSymlinkPath(repoRoot, paths.artifacts, 'artifact 目录')
  assertNoSymlinkPath(repoRoot, paths.ledger, 'ledger 文件')
  assertNoSymlinkPath(repoRoot, paths.index, 'index 文件')
  mkdirSync(paths.artifacts, { recursive: true })

  const previousRecordHash = readLastLedgerEvent(paths.ledger)?.recordHash
  const record = completeEvidenceRecord({
    ...input,
    hashes: {
      ...input.hashes,
      previousRecordHash,
    },
  })
  const artifactPath = getArtifactPath(repoRoot, record.evidenceKind, record.id)
  const artifactAbsPath = resolve(repoRoot, artifactPath)
  if (pathContainsSymlink(repoRoot, dirname(artifactAbsPath))) {
    throw new Error(`artifact 目录不能包含符号链接：${artifactPath}`)
  }
  mkdirSync(dirname(artifactAbsPath), { recursive: true })
  if (pathContainsSymlink(repoRoot, artifactAbsPath)) {
    throw new Error(`artifact 路径不能包含符号链接：${artifactPath}`)
  }
  writeFileSync(artifactAbsPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  const artifactHash = hashEvidencePayload(readFileSync(artifactAbsPath, 'utf8'))
  const event = EvidenceLedgerEventSchema.parse({
    id: record.id,
    evidenceKind: record.evidenceKind,
    artifactPath,
    artifactHash,
    recordHash: record.hashes.recordHash,
    previousRecordHash: record.hashes.previousRecordHash,
    writtenAt: record.timestamps.writtenAt,
  })
  appendLedgerEvent(paths.ledger, event)
  rebuildEvidenceIndex(repoRoot)

  return { record, event, artifactPath }
}

/** 读取并复验证据账本，返回可用记录与所有可恢复诊断。 */
export function readEvidenceLedger(repoRoot: string): EvidenceReadResult {
  const paths = getEvidenceLedgerPaths(repoRoot)
  if (!isRegularFile(paths.ledger)) {
    return { records: [], diagnostics: ['ledger.jsonl 不存在。'], state: 'missing' }
  }
  if (pathContainsSymlink(repoRoot, paths.ledger)) {
    return {
      records: [],
      diagnostics: [`ledger 文件不能包含符号链接：${toRepoRelativePath(repoRoot, paths.ledger)}`],
      state: 'unverifiable',
    }
  }

  const diagnostics: string[] = []
  const events = readLedgerEvents(paths.ledger, diagnostics)
  const records: EvidenceRecord[] = []
  const seenIds = new Set<string>()
  let previousRecordHash: string | undefined

  for (const event of events) {
    if (seenIds.has(event.id)) {
      diagnostics.push(`重复 evidence id：${event.id}`)
      continue
    }
    seenIds.add(event.id)

    if (event.previousRecordHash !== previousRecordHash) {
      diagnostics.push(`ledger 链断裂：${event.id}`)
      previousRecordHash = event.recordHash
      continue
    }
    previousRecordHash = event.recordHash

    const artifactAbsPath = resolve(repoRoot, event.artifactPath)
    const artifactRelPath = isInsideRoot(repoRoot, artifactAbsPath)
      ? toPosixPath(toRepoRelativePath(repoRoot, artifactAbsPath))
      : toPosixPath(event.artifactPath)
    const artifactDomain = toPosixPath(join(docsAePath(DOCS_AE_SUBDIRS.EVIDENCE), ARTIFACTS_DIR, event.evidenceKind))

    if (!isRegularFile(artifactAbsPath)) {
      diagnostics.push(`artifact 缺失：${event.artifactPath}`)
      continue
    }

    const artifactIsSafe = isInsideRoot(repoRoot, artifactAbsPath)
      && !pathContainsSymlink(repoRoot, artifactAbsPath)
      && isInsideRoot(realpathSync(repoRoot), realpathSync(artifactAbsPath))
      && artifactRelPath.startsWith(`${artifactDomain}/`)
    if (!artifactIsSafe) {
      diagnostics.push(`artifact 路径越界或跨域：${event.id}`)
      continue
    }

    const content = readFileSync(artifactAbsPath, 'utf8')
    if (hashEvidencePayload(content) !== event.artifactHash) {
      diagnostics.push(`artifactHash 不匹配：${event.id}`)
      continue
    }

    const parsedJson = parseJson(content)
    const parsed = parsedJson ? EvidenceRecordSchema.safeParse(parsedJson) : undefined
    if (!parsed?.success) {
      diagnostics.push(`artifact schema 无效：${event.id}`)
      continue
    }

    if (parsed.data.id !== event.id || parsed.data.evidenceKind !== event.evidenceKind) {
      diagnostics.push(`ledger 到 artifact 引用不匹配：${event.id}`)
      continue
    }

    if (parsed.data.hashes.previousRecordHash !== event.previousRecordHash) {
      diagnostics.push(`previousRecordHash 不匹配：${event.id}`)
      continue
    }

    if (parsed.data.hashes.recordHash !== event.recordHash || !verifyRecordHash(parsed.data)) {
      diagnostics.push(`recordHash 不匹配：${event.id}`)
      continue
    }

    records.push(parsed.data)
  }

  diagnostics.push(...findOrphanArtifacts(repoRoot, events))

  return {
    records,
    diagnostics,
    state: diagnostics.length > 0 ? 'unverifiable' : records.length > 0 ? 'passed' : 'missing',
  }
}

/** 从 ledger.jsonl 重建可丢弃的 evidence index 缓存。 */
export function rebuildEvidenceIndex(repoRoot: string): EvidenceIndex {
  const paths = getEvidenceLedgerPaths(repoRoot)
  assertNoSymlinkPath(repoRoot, paths.root, 'evidence 根目录')
  assertNoSymlinkPath(repoRoot, paths.ledger, 'ledger 文件')
  assertNoSymlinkPath(repoRoot, paths.index, 'index 文件')
  const diagnostics: string[] = []
  const events = isRegularFile(paths.ledger) ? readLedgerEvents(paths.ledger, diagnostics) : []
  if (diagnostics.length > 0) {
    throw new Error(`无法重建 evidence index：${diagnostics.join('；')}`)
  }

  const index = EvidenceIndexSchema.parse({
    schemaVersion: EVIDENCE_LEDGER_SCHEMA_VERSION,
    rebuiltAt: new Date().toISOString(),
    records: events,
  })
  mkdirSync(paths.root, { recursive: true })
  writeFileSync(paths.index, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
  return index
}

function getArtifactPath(repoRoot: string, kind: EvidenceKind, id: string): string {
  const target = join(getEvidenceLedgerPaths(repoRoot).artifacts, kind, `${id}.json`)
  return toRepoRelativePath(repoRoot, target)
}

function assertNoSymlinkPath(repoRoot: string, target: string, label: string): void {
  if (pathContainsSymlink(repoRoot, target)) {
    throw new Error(`${label}不能包含符号链接：${toRepoRelativePath(repoRoot, target)}`)
  }
}

function appendLedgerEvent(path: string, event: EvidenceLedgerEvent): void {
  mkdirSync(dirname(path), { recursive: true })
  const existing = isRegularFile(path) ? readFileSync(path, 'utf8') : ''
  writeFileSync(path, `${existing}${JSON.stringify(event)}\n`, 'utf8')
}

function readLastLedgerEvent(path: string): EvidenceLedgerEvent | undefined {
  if (!isRegularFile(path)) {
    return undefined
  }
  const lines = readFileSync(path, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean)
  const last = lines.at(-1)
  const parsedJson = last ? parseJson(last) : undefined
  return parsedJson ? EvidenceLedgerEventSchema.parse(parsedJson) : undefined
}

function readLedgerEvents(path: string, diagnostics: string[]): EvidenceLedgerEvent[] {
  const events: EvidenceLedgerEvent[] = []
  const lines = readFileSync(path, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    const parsedJson = parseJson(trimmed)
    const parsed = parsedJson ? EvidenceLedgerEventSchema.safeParse(parsedJson) : undefined
    if (parsed?.success) {
      events.push(parsed.data)
    } else {
      diagnostics.push(`ledger 第 ${index + 1} 行不是合法事件。`)
    }
  })
  return events
}

function findOrphanArtifacts(repoRoot: string, events: EvidenceLedgerEvent[]): string[] {
  const paths = getEvidenceLedgerPaths(repoRoot)
  if (!existsSync(paths.artifacts)) {
    return []
  }
  if (pathContainsSymlink(repoRoot, paths.artifacts)) {
    return [`artifact 目录不能包含符号链接：${toRepoRelativePath(repoRoot, paths.artifacts)}`]
  }
  const known = new Set(events.map((event) => toPosixPath(event.artifactPath)))
  return listJsonFiles(paths.artifacts)
    .map((path) => toRepoRelativePath(repoRoot, path))
    .filter((path) => !known.has(toPosixPath(path)))
    .map((path) => `孤儿 artifact：${path}`)
}

function listJsonFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return listJsonFiles(path)
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : []
  })
}

function removeRecordHash(record: EvidenceRecord): EvidenceRecord {
  return {
    ...record,
    hashes: {
      ...record.hashes,
      recordHash: '',
    },
  }
}

function parseJson(content: string): unknown | undefined {
  try {
    return JSON.parse(content) as unknown
  } catch {
    return undefined
  }
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue)
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, toJsonValue(item)]),
    )
  }
  return null
}

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key] ?? null)}`)
    .join(',')}}`
}
