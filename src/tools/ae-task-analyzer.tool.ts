import { readdir, readFile, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, normalize, posix, relative, resolve, win32 } from 'node:path'

import { tool, type ToolDefinition } from '@opencode-ai/plugin'
import { Effect } from 'effect'

import { toPosixPath } from '../utils/path-utils.js'

// 排除的目录和文件模式（与 ae-review 排除规则保持一致）
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.opencode',
  '__pycache__', '.next', '.nuxt', 'coverage', '.cache',
])

const EXCLUDED_EXTENSIONS = new Set([
  '.png', '.jpg', '.gif', '.svg', '.ico', '.webp', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.webm',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.csv', '.xlsx', '.xls', '.pdf', '.doc', '.docx',
])

const EXCLUDED_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.env', '.env.local', '.env.production',
])

const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'and', 'or', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'this', 'that', 'these', 'those', 'it', 'its', 'from', 'by', 'as', 'not', 'no',
  'but', 'if', 'then', 'else', 'when', 'where', 'how', 'what', 'which', 'who', 'whom', 'why', 'all',
  'each', 'every', 'both', 'few', 'some', 'any', 'most', 'other', 'such', 'than', 'too', 'very', 'just',
  'about', 'above', 'after', 'again', 'also', 'am', 'aren', 'because', 'before', 'below', 'between',
  'cannot', 'couldn', 'didn', 'doesn', 'doing', 'don', 'down', 'during', 'further', 'get', 'got', 'hadn',
  'hasn', 'haven', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'i', 'into',
  'isn', 'itself', 'let', 'll', 'me', 'more', 'must', 'mustn', 'my', 'myself', 'nor', 'now', 'off', 'once',
  'only', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 're', 'same', 'shan', 'she', 'shouldn', 'so',
  'their', 'theirs', 'them', 'themselves', 'there', 'they', 'through', 'under', 'until', 'up', 'us', 've',
  'wasn', 'we', 'weren', 'while', 'won', 'wouldn', 'you', 'your', 'yours', 'yourself', 'yourselves',
])

const SHARED_RESOURCE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: '<shared-resource:package-or-lockfile>', pattern: /(^|\/)(package\.json|.*lock.*|pnpm-workspace\.yaml)$/ },
  { key: '<shared-resource:typescript-config>', pattern: /(^|\/)(tsconfig[^/]*\.json|.*\.config\.[cm]?[jt]s)$/ },
  { key: '<shared-resource:environment-config>', pattern: /(^|\/)(\.env[^/]*|config\/|configs\/)/ },
  { key: '<shared-resource:migration>', pattern: /(^|\/)(migrations?|schema)\// },
  { key: '<shared-resource:test-fixture>', pattern: /(^|\/)(fixtures?|__fixtures__|setupTests?|test-setup)\b/ },
  { key: '<shared-resource:generated-output>', pattern: /(^|\/)(dist|build|coverage|generated|__generated__)\// },
]

// 可源码文件扩展名
const SOURCE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.rb', '.php',
  '.swift', '.kt', '.scala', '.vue', '.svelte',
  '.json', '.yaml', '.yml', '.toml', '.xml',
  '.md', '.rst', '.adoc', '.txt',
  '.css', '.scss', '.less', '.html',
  '.sql', '.prisma', '.graphql', '.proto',
  '.sh', '.bash', '.ps1', '.bat', '.cmd',
  'Dockerfile', 'Makefile', 'Jenkinsfile',
])

interface FileEntry {
  path: string
  relativePath: string
}

interface TaskUnit {
  id: string
  description: string
  files: Array<{ path: string; source: 'tool_scan' | 'llm_suggestion' }>
  suggested_validation: string[]
  priority: number
}

function isInsideDirectory(root: string, target: string): boolean {
  const relativePath = relative(root, target)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function resolveDesignPath(designPath: string, worktree: string): { absolutePath?: string; warning?: string } {
  if (isUnsafeRelativePath(designPath)) {
    return { warning: '设计文件路径必须是仓库相对路径' }
  }

  const normalizedWorktree = resolve(worktree)
  const absolutePath = resolve(normalizedWorktree, designPath)

  if (!isInsideDirectory(normalizedWorktree, absolutePath)) {
    return { warning: `设计文件路径越出工作区边界：${designPath}` }
  }

  return { absolutePath }
}

function normalizePlanFilePath(filePath: string): string | undefined {
  const cleaned = filePath.trim().replace(/^\.\//, '')
  if (!cleaned || cleaned.startsWith('（') || cleaned.startsWith('(') || isUnsafeRelativePath(cleaned)) {
    return undefined
  }

  const normalized = toPosixPath(posix.normalize(cleaned.replace(/\\/g, '/')))
  if (normalized === '.' || hasParentPathSegment(normalized)) {
    return undefined
  }

  return normalized
}

function isUnsafeRelativePath(inputPath: string): boolean {
  const trimmedPath = inputPath.trim()
  const slashPath = trimmedPath.replace(/\\/g, '/')
  const normalizedSlashPath = posix.normalize(slashPath)

  return (
    trimmedPath === '' ||
    isAbsolute(trimmedPath) ||
    posix.isAbsolute(slashPath) ||
    win32.isAbsolute(trimmedPath) ||
    /^[a-zA-Z]:/.test(trimmedPath) ||
    slashPath.startsWith('//') ||
    hasParentPathSegment(normalizedSlashPath)
  )
}

function hasParentPathSegment(inputPath: string): boolean {
  return inputPath.split('/').includes('..')
}

function getSharedResourceKeys(path: string): string[] {
  return SHARED_RESOURCE_PATTERNS.filter(({ pattern }) => pattern.test(path)).map(({ key }) => key)
}

function extractPlanSectionLines(unitContent: string, sectionName: string): string[] {
  const lines = unitContent.split('\n')
  const sectionLines: string[] = []
  let inSection = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith(`**${sectionName}**`)) {
      inSection = true
      continue
    }

    if (!inSection) {
      continue
    }

    if (
      trimmed.startsWith('**') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('###') ||
      /^- \[[ xX]\] \*\*单元\s*\d+/.test(trimmed)
    ) {
      break
    }

    sectionLines.push(line)
  }

  return sectionLines
}

interface ConflictEntry {
  unit_a: string
  unit_b: string
  shared_files: string[]
}

interface ParallelGroup {
  id: string
  unit_ids: string[]
  is_parallel_safe: boolean
  blocker_reason?: string
}

interface TaskAnalyzerOutput {
  units: TaskUnit[]
  conflict_matrix: ConflictEntry[]
  parallel_groups: ParallelGroup[]
  execution_order: string[]
  warnings: string[]
}

// 递归扫描目录，收集源码文件
async function collectSourceFiles(root: string, dir = root): Promise<FileEntry[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const files: FileEntry[] = []

  for (const entry of entries) {
    const entryPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue
      }
      files.push(...await collectSourceFiles(root, entryPath))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    const ext = extname(entry.name)
    const baseName = entry.name

    if (EXCLUDED_EXTENSIONS.has(ext)) {
      continue
    }
    if (EXCLUDED_FILENAMES.has(baseName)) {
      continue
    }
    if (baseName.startsWith('.env')) {
      continue
    }

    if (SOURCE_EXTENSIONS.has(ext) || SOURCE_EXTENSIONS.has(baseName)) {
      files.push({
        path: entryPath,
        relativePath: toPosixPath(relative(root, entryPath)),
      })
    }
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

// 从任务描述中提取关键词
function extractKeywords(description: string): string[] {
  const keywords: string[] = []

  // 提取文件名模式
  const fileNamePattern = /[\w\-]+\.(?:ts|tsx|js|jsx|py|java|go|rs|md|json|yaml|yml)/g
  const fileMatches = description.match(fileNamePattern)
  if (fileMatches) keywords.push(...fileMatches)

  // 提取路径片段
  const pathPattern = /(?:src|lib|test|tests|docs|config|scripts|assets|components|services|utils|tools|hooks|models|views|pages)\/[\w\-\/]*/g
  const pathMatches = description.match(pathPattern)
  if (pathMatches) keywords.push(...pathMatches)

  // 提取驼峰或 kebab-case 标识符
  const identifierPattern = /\b[a-z][a-zA-Z0-9]*(?:[-/][a-z][a-zA-Z0-9]*)*\b/g
  const identifiers = description.match(identifierPattern) || []
  for (const id of identifiers) {
    if (!ENGLISH_STOP_WORDS.has(id) && id.length >= 3) {
      keywords.push(id)
    }
  }

  return [...new Set(keywords)]
}

// 按目录边界将文件分组为任务单元
function groupFilesByDirectory(files: FileEntry[], maxGroupSize = 5): TaskUnit[] {
  if (files.length === 0) return []

  // 按第一级目录分组
  const groups = new Map<string, FileEntry[]>()
  for (const file of files) {
    const parts = file.relativePath.split('/')
    // 使用前两级目录作为分组键（如 src/tools、src/services）
    const groupKey = parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]
    const existing = groups.get(groupKey) || []
    existing.push(file)
    groups.set(groupKey, existing)
  }

  const units: TaskUnit[] = []
  let unitIndex = 1

  for (const [groupKey, groupFiles] of groups) {
    if (groupFiles.length <= maxGroupSize) {
      units.push({
        id: `U${unitIndex}`,
        description: `修改 ${groupKey} 下的 ${groupFiles.length} 个文件`,
        files: groupFiles.map((f) => ({ path: f.relativePath, source: 'tool_scan' as const })),
        suggested_validation: suggestValidation(groupFiles),
        priority: unitIndex,
      })
      unitIndex++
    } else {
      // 大组进一步按子目录拆分
      const subGroups = new Map<string, FileEntry[]>()
      for (const file of groupFiles) {
        const parts = file.relativePath.split('/')
        const subKey = parts.length > 3 ? `${parts[0]}/${parts[1]}/${parts[2]}` : `${parts[0]}/${parts[1]}`
        const existing = subGroups.get(subKey) || []
        existing.push(file)
        subGroups.set(subKey, existing)
      }

      for (const [subKey, subFiles] of subGroups) {
        units.push({
          id: `U${unitIndex}`,
          description: `修改 ${subKey} 下的 ${subFiles.length} 个文件`,
          files: subFiles.map((f) => ({ path: f.relativePath, source: 'tool_scan' as const })),
          suggested_validation: suggestValidation(subFiles),
          priority: unitIndex,
        })
        unitIndex++
      }
    }
  }

  return units
}

// 根据文件类型推断验证命令
function suggestValidation(files: FileEntry[]): string[] {
  const hasTest = files.some((f) => f.relativePath.includes('.test.') || f.relativePath.includes('.spec.'))
  const hasSource = files.some((f) => !f.relativePath.includes('.test.') && !f.relativePath.includes('.spec.'))
  const hasTypeScript = files.some((f) => f.relativePath.endsWith('.ts') || f.relativePath.endsWith('.tsx'))
  const hasMarkdown = files.some((f) => f.relativePath.endsWith('.md'))

  const commands: string[] = []

  if (hasTypeScript && hasSource) {
    commands.push('npm run typecheck')
  }
  if (hasTest) {
    const testFiles = files.filter((f) => f.relativePath.includes('.test.') || f.relativePath.includes('.spec.'))
    for (const f of testFiles) {
      commands.push(`npx vitest run ${f.relativePath}`)
    }
  }
  if (hasMarkdown && !hasSource) {
    // 纯 markdown 变更不需要代码验证
  }

  return commands
}

// 计算文件冲突矩阵
function computeConflictMatrix(units: TaskUnit[]): ConflictEntry[] {
  const conflicts: ConflictEntry[] = []

  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const filesA = new Set(units[i].files.map((f) => f.path))
      const filesB = new Set(units[j].files.map((f) => f.path))
      const shared = [...filesA].filter((f) => filesB.has(f))
      const sharedResourceKeysA = new Set([...filesA].flatMap(getSharedResourceKeys))
      const sharedResourceKeysB = new Set([...filesB].flatMap(getSharedResourceKeys))
      const sharedResources = [...sharedResourceKeysA].filter((key) => sharedResourceKeysB.has(key))

      if (shared.length > 0 || sharedResources.length > 0) {
        conflicts.push({
          unit_a: units[i].id,
          unit_b: units[j].id,
          shared_files: [...shared, ...sharedResources],
        })
      }
    }
  }

  return conflicts
}

// 贪心图着色算法计算并行组
function computeParallelGroups(units: TaskUnit[], conflicts: ConflictEntry[]): ParallelGroup[] {
  if (units.length === 0) return []

  // 构建冲突邻接表
  const conflictMap = new Map<string, Set<string>>()
  for (const unit of units) {
    conflictMap.set(unit.id, new Set())
  }
  for (const conflict of conflicts) {
    conflictMap.get(conflict.unit_a)?.add(conflict.unit_b)
    conflictMap.get(conflict.unit_b)?.add(conflict.unit_a)
  }

  // 贪心着色：每个单元分配到第一个可用的颜色（组）
  const colorMap = new Map<string, number>()
  let maxColor = 0

  for (const unit of units) {
    const usedColors = new Set<number>()
    const neighbors = conflictMap.get(unit.id) || new Set()
    for (const neighbor of neighbors) {
      const neighborColor = colorMap.get(neighbor)
      if (neighborColor !== undefined) {
        usedColors.add(neighborColor)
      }
    }

    // 找到最小可用颜色
    let color = 0
    while (usedColors.has(color)) {
      color++
    }
    colorMap.set(unit.id, color)
    if (color > maxColor) maxColor = color
  }

  // 按颜色分组
  const groups = new Map<number, string[]>()
  for (const [unitId, color] of colorMap) {
    const existing = groups.get(color) || []
    existing.push(unitId)
    groups.set(color, existing)
  }

  const parallelGroups: ParallelGroup[] = []
  let groupIndex = 1

  for (const [color, unitIds] of groups) {
    parallelGroups.push({
      id: `G${groupIndex}`,
      unit_ids: unitIds,
      is_parallel_safe: !hasInternalConflicts(unitIds, conflicts),
    })
    groupIndex++
  }

  return parallelGroups
}

// 检查组内是否有冲突
function hasInternalConflicts(unitIds: string[], conflicts: ConflictEntry[]): boolean {
  const idSet = new Set(unitIds)
  return conflicts.some((c) => idSet.has(c.unit_a) && idSet.has(c.unit_b))
}

// 计算执行顺序
function computeExecutionOrder(groups: ParallelGroup[], units: TaskUnit[]): string[] {
  // 简单策略：按组 ID 顺序执行（G1, G2, G3...）
  // 更复杂的依赖排序需要上游设计提供结构化依赖信息
  return groups.map((g) => g.id)
}

// 从设计文档中提取实现单元
async function extractUnitsFromDesign(designPath: string, worktree: string): Promise<{ units: TaskUnit[]; warnings: string[] }> {
  const resolvedDesign = resolveDesignPath(designPath, worktree)
  if (!resolvedDesign.absolutePath) {
    return { units: [], warnings: [resolvedDesign.warning || `设计文件路径无效：${designPath}`] }
  }

  const absolutePath = resolvedDesign.absolutePath
  const fileStat = await stat(absolutePath).catch(() => undefined)

  if (!fileStat?.isFile()) {
    return { units: [], warnings: [`设计文件不存在：${designPath}`] }
  }

  const content = await readFile(absolutePath, 'utf8').catch(() => '')
  if (!content.trim()) {
    return { units: [], warnings: [`设计文件为空：${designPath}`] }
  }

  const units: TaskUnit[] = []
  const warnings: string[] = []

  // 解析实现单元（匹配 - [ ] **单元 N：** 或 - [x] **单元 N：** 格式）
  const unitPattern = /^- \[[ xX]\] \*\*单元\s*(\d+)[：:]\*\*(?:[^\S\r\n]*(.*))?$/gm
  let match

  while ((match = unitPattern.exec(content)) !== null) {
    const unitNum = match[1]
    const unitTitle = match[2]?.trim() || `单元 ${unitNum}`
    const unitId = `U${unitNum}`

    // 查找该单元的文件列表（在后续行中查找 **文件**：部分）
    const unitStartIndex = match.index + match[0].length
    const nextUnitMatch = content.substring(unitStartIndex).match(/^- \[[ xX]\] \*\*单元\s*\d+/m)
    const unitEndIndex = nextUnitMatch?.index === undefined ? content.length : unitStartIndex + nextUnitMatch.index
    const unitContent = content.substring(unitStartIndex, unitEndIndex)

    // 提取文件路径
    const files: Array<{ path: string; source: 'tool_scan' | 'llm_suggestion' }> = []
    const fileLines = extractPlanSectionLines(unitContent, '文件')
    for (const line of fileLines) {
      const fileMatch = line.match(/[-*]\s*`?([^`\n]+)`?/)
      if (fileMatch) {
        const filePath = fileMatch[1].trim()
        const normalizedFilePath = normalizePlanFilePath(filePath)
        if (normalizedFilePath) {
          files.push({ path: normalizedFilePath, source: 'llm_suggestion' })
        } else if (filePath) {
          warnings.push(`已忽略无效或越界文件路径：${filePath}`)
        }
      }
    }

    // 提取验证命令
    const suggestedValidation: string[] = []
    const verifyLines = extractPlanSectionLines(unitContent, '验证')
    for (const line of verifyLines) {
      const cmdMatch = line.match(/[-*]\s*`?([^`\n]+)`?/)
      if (cmdMatch) {
        suggestedValidation.push(cmdMatch[1].trim())
      }
    }

    units.push({
      id: unitId,
      description: unitTitle,
      files,
      suggested_validation: suggestedValidation,
      priority: parseInt(unitNum, 10),
    })
  }

  if (units.length === 0) {
    warnings.push('未能从设计文档中提取实现单元，使用 `- [ ] **单元 N：**` 格式')
  }

  return { units, warnings }
}

// 主逻辑：scan 模式
async function analyzeScanMode(taskDescription: string, worktree: string): Promise<TaskAnalyzerOutput> {
  const warnings: string[] = []

  if (!taskDescription.trim()) {
    return {
      units: [],
      conflict_matrix: [],
      parallel_groups: [],
      execution_order: [],
      warnings: ['任务描述为空，无法分析'],
    }
  }

  const keywords = extractKeywords(taskDescription)
  const allFiles = await collectSourceFiles(worktree)

  // 按关键词匹配候选文件
  let candidateFiles = allFiles
  if (keywords.length > 0) {
    candidateFiles = allFiles.filter((file) =>
      keywords.some((kw) =>
        file.relativePath.toLowerCase().includes(kw.toLowerCase()) ||
        file.relativePath.toLowerCase().includes(kw.replace(/-/g, '/').toLowerCase()),
      ),
    )
  }

  if (candidateFiles.length === 0) {
    warnings.push('无法自动识别变更文件，建议使用 mode=design 或手动指定。输出基于全部源码文件的目录分组。')
    candidateFiles = allFiles
  }

  const units = groupFilesByDirectory(candidateFiles)
  const conflict_matrix = computeConflictMatrix(units)
  const parallel_groups = computeParallelGroups(units, conflict_matrix)
  const execution_order = computeExecutionOrder(parallel_groups, units)

  return {
    units,
    conflict_matrix,
    parallel_groups,
    execution_order,
    warnings,
  }
}

// 主逻辑：design 模式
async function analyzeDesignMode(designPath: string, worktree: string): Promise<TaskAnalyzerOutput> {
  const { units, warnings } = await extractUnitsFromDesign(designPath, worktree)
  const conflict_matrix = computeConflictMatrix(units)
  const parallel_groups = computeParallelGroups(units, conflict_matrix)
  const execution_order = computeExecutionOrder(parallel_groups, units)

  return {
    units,
    conflict_matrix,
    parallel_groups,
    execution_order,
    warnings,
  }
}

export const aeTaskAnalyzerTool: ToolDefinition = tool({
  description: [
    '分析任务结构并计算并行执行方案。',
    '',
    '功能说明：',
    '- 扫描代码库文件，按目录/模块边界拆分任务单元',
    '- 计算文件冲突矩阵，检测任务间共享文件',
    '- 通过图着色算法计算并行组',
    '- 从设计文档中提取实现单元、文件范围和验证命令',
    '',
    '适用场景：',
    '- ae:work 需要自动分解任务并行执行时',
    '- 裸提示词进入 ae:work 时自动识别可并行的任务',
    '- 设计文档进入 ae:work 时提取并行组',
    '',
    '不适用场景：',
    '- 不负责实际执行子代理',
    '- 不负责修改项目文件',
  ].join('\n'),
  args: {
    mode: tool.schema.enum(['scan', 'design']).describe('分析模式：scan=扫描代码库拆分任务，design=从设计文档提取任务'),
    task_description: tool.schema.string().optional().describe('任务描述文本；mode=scan 时使用'),
    design_path: tool.schema.string().optional().describe('设计文档的仓库相对路径；mode=design 时使用'),
    worktree: tool.schema.string().optional().describe('工作区根目录，默认为当前目录'),
  },
  async execute(args, context) {
    const worktree = args.worktree || context.worktree

    return Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          let result: TaskAnalyzerOutput

          if (args.mode === 'scan') {
            result = await analyzeScanMode(args.task_description || '', worktree)
          } else {
            if (!args.design_path) {
              return JSON.stringify({
                units: [],
                conflict_matrix: [],
                parallel_groups: [],
                execution_order: [],
                warnings: ['mode=design 需要提供 design_path 参数'],
              }, null, 2)
            }
            result = await analyzeDesignMode(args.design_path, worktree)
          }

          return JSON.stringify(result, null, 2)
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error)),
      }).pipe(
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          return Effect.succeed(JSON.stringify({
            units: [],
            conflict_matrix: [],
            parallel_groups: [],
            execution_order: [],
            warnings: [`任务分析失败：${message}`],
          }, null, 2))
        }),
      ),
    )
  },
})
