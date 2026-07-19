import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { tool } from '@opencode-ai/plugin'
import { z } from 'zod'

import { AGENT } from '../schemas/ae-asset-schema.js'
import { getGlobalClient } from '../services/client-holder.js'
import { SPECIALIST_PROMPT_TEMPLATES } from '../services/specialist-prompt-templates.js'

/**
 * OCR (OpenCodeReview) 支持审查的文件扩展名白名单。
 * 来源：open-code-review/internal/config/allowlist/supported_file_types.json（68 个后缀）。
 * 任何被审查文件只要后缀在此集合中，都应激活 ocr-reviewer 代理。
 */
const OCR_SUPPORTED_EXTENSIONS = new Set([
  'java', 'kt', 'kts', 'scala', 'groovy',
  'py', 'pyi',
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hxx',
  'cs', 'vb', 'fs',
  'go', 'rs',
  'rb', 'rake', 'gemspec',
  'php',
  'swift', 'm', 'mm',
  'sh', 'bash', 'zsh', 'fish', 'ps1',
  'sql',
  'css', 'scss', 'sass', 'less',
  'html', 'htm', 'astro', 'vue', 'svelte',
  'xml', 'yaml', 'yml', 'json', 'json5', 'toml', 'ini',
  'gradle', 'cmake',
  'r', 'lua', 'pl', 'pm',
  'ex', 'exs', 'erl', 'hrl',
  'ets', 'dart', 'tf',
])

/**
 * OCR 支持的无扩展名特殊文件名（大小写不敏感）。
 * 来源：open-code-review/internal/tool/file_find.go shouldSkipFile 白名单。
 */
const OCR_SPECIAL_FILENAMES = new Set([
  'dockerfile', 'makefile', 'vagrantfile', 'containerfile',
])

const CODE_TEST_PATTERNS = [/\.test\./, /_test\./, /\.spec\./, /\.bench\./]

const DOC_EXTENSIONS = new Set([
  'md', 'txt', 'rst', 'adoc', 'org',
  'json', 'yaml', 'yml', 'toml', 'ini', 'xml', 'cfg',
])

const EXCLUDED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z',
  'csv', 'xlsx', 'xls', 'pdf', 'doc', 'docx',
  'lock',
])

const VALID_DIMENSIONS = new Set([
  'architecture', 'api', 'database', 'ui-ux', 'test-cases',
  'security', 'observability', 'non-functional',
])

const DIMENSION_TO_AGENT: Record<string, string> = {
  'architecture': AGENT.ARCHITECTURE_DESIGN_REVIEWER,
  'api': AGENT.API_DESIGN_REVIEWER,
  'database': AGENT.DATABASE_DESIGN_REVIEWER,
  'ui-ux': AGENT.UI_UX_DESIGN_REVIEWER,
  'test-cases': AGENT.TEST_CASES_DESIGN_REVIEWER,
  'security': AGENT.SECURITY_DESIGN_REVIEWER,
  'observability': AGENT.OBSERVABILITY_DESIGN_REVIEWER,
  'non-functional': AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER,
}

function getExt(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filePath.slice(lastDot + 1).toLowerCase()
}

function isExcluded(filePath: string): boolean {
  const normalized = normalizePath(filePath)
  const ext = getExt(normalized)
  const basename = normalized.split('/').pop() ?? normalized
  if (ext === 'env') return true
  if (basename.startsWith('.env') && basename !== '.env.example' && basename !== '.env.template') return true
  if (normalized.startsWith('.opencode/')) return true
  if (normalized.startsWith('ae/reviews/')) return true
  if (normalized.startsWith('ae/solutions/')) return true
  if (EXCLUDED_EXTENSIONS.has(ext)) return true
  if (normalized === 'package-lock.json' || normalized === 'yarn.lock' || normalized === 'pnpm-lock.yaml') return true
  return false
}

function isCodeFile(filePath: string): boolean {
  const ext = getExt(filePath)
  if (OCR_SUPPORTED_EXTENSIONS.has(ext)) return true
  if (CODE_TEST_PATTERNS.some((p) => p.test(filePath))) return true
  const basename = filePath.split(/[\\/]/).pop() ?? filePath
  if (OCR_SPECIAL_FILENAMES.has(basename.toLowerCase())) return true
  return false
}

function isDocFile(filePath: string): boolean {
  const ext = getExt(filePath)
  return DOC_EXTENSIONS.has(ext)
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

function isDesignDoc(filePath: string): boolean {
  return normalizePath(filePath).startsWith('ae/designs/')
}

function isPrdDoc(filePath: string): boolean {
  return normalizePath(filePath).startsWith('ae/prds/')
}

function isTestDoc(filePath: string): boolean {
  return /[\\/]tests?[\\/]/i.test(filePath) || /\.(test|spec|bench)\./i.test(filePath)
}

function classifyFiles(filePaths: string[]) {
  const codeFiles: string[] = []
  const docFiles: string[] = []
  const excludedFiles: string[] = []

  for (const fp of filePaths) {
    if (isExcluded(fp)) {
      excludedFiles.push(fp)
      continue
    }
    const isCode = isCodeFile(fp)
    const isDoc = isDocFile(fp)
    if (isCode) {
      codeFiles.push(fp)
    }
    if (isDoc) {
      docFiles.push(fp)
    }
    if (!isCode && !isDoc) {
      codeFiles.push(fp)
      docFiles.push(fp)
    }
  }

  return { codeFiles, docFiles, excludedFiles }
}

function detectDesignDimensions(docFiles: string[]): string[] {
  const dimensions: string[] = []
  const designDocs = docFiles.filter(isDesignDoc)

  if (designDocs.length === 0) return dimensions

  const designPaths = designDocs.join(' ').toLowerCase()

  if (/架构|模块|分层|边界|依赖方向|architecture/.test(designPaths)) {
    dimensions.push('architecture')
  }
  if (/接口|端点|api|契约|endpoint/.test(designPaths)) {
    dimensions.push('api')
  }
  if (/数据模型|表结构|迁移|database|schema|er\s*模型/.test(designPaths)) {
    dimensions.push('database')
  }
  if (/页面|组件|交互|ui|ux|界面|原型|prototype/.test(designPaths)) {
    dimensions.push('ui-ux')
  }
  if (/测试用例|覆盖矩阵|test.case|覆盖率|p0|p1|p2|p3/.test(designPaths)) {
    dimensions.push('test-cases')
  }
  if (/认证|权限|密钥|威胁|安全|security|授权|信任边界/.test(designPaths)) {
    dimensions.push('security')
  }
  if (/日志|监控|告警|slo|sli|observability|指标/.test(designPaths)) {
    dimensions.push('observability')
  }
  if (/性能|并发|容量|缓存|non-functional|latency|throughput/.test(designPaths)) {
    dimensions.push('non-functional')
  }

  return dimensions
}

function detectDocCategories(docFiles: string[]): number {
  let categories = 0
  if (docFiles.some(isPrdDoc)) categories++
  if (docFiles.some(isDesignDoc)) categories++
  if (docFiles.some(isTestDoc)) categories++
  return categories
}

function hasMultipleDesignDimensions(docFiles: string[]): boolean {
  const designDocs = docFiles.filter(isDesignDoc)
  if (designDocs.length < 2) return false
  const dimensions = detectDesignDimensions(designDocs)
  return dimensions.length >= 2
}

function buildExtraPrompt(reviewMode: string, goals?: string): string {
  const parts: string[] = []

  if (reviewMode === 'changes') {
    parts.push('审查这些文件的变更内容（Git diff 或会话变更），重点关注变更引入的问题。')
  } else if (reviewMode === 'full') {
    parts.push('审查这些文件的完整内容。')
  }

  if (goals && goals.trim().length > 0) {
    parts.push(`审查目标：${goals.trim()}`)
  }

  return parts.join('\n')
}

/**
 * 从上下文提示和变更文件列表自动推断审查目标。
 * 当用户未显式传入 goals 时，工具自动生成足够详细的目标供 goal-alignment-reviewer 使用。
 *
 * 生成维度：
 * 1. 审查模式目标（changes/full 的基础目标）
 * 2. 上下文背景（contextHint 纳入）
 * 3. 文件覆盖摘要（代码/文档数量和类型分布）
 * 4. 模块/目录影响分析（从路径推断受影响的功能模块）
 * 5. 设计维度覆盖（从设计文档路径推断涉及的维度）
 * 6. 代码与文档一致性验证（混合变更时）
 * 7. 测试覆盖验证（含测试文件变更时）
 */
function generateGoalsFromContext(
  contextHint: string,
  reviewMode: string,
  codeFiles: string[],
  docFiles: string[],
): string {
  const goals: string[] = []

  // 1. 审查模式基础目标
  if (reviewMode === 'full') {
    goals.push('审查全部文件的完整内容是否正确实现，验证整体架构一致性和代码质量')
  } else {
    goals.push('审查变更内容是否正确实现，重点关注变更引入的问题、破坏性变更和回归风险')
  }

  // 2. 上下文背景
  const hint = contextHint.trim()
  if (hint.length > 0) {
    goals.push(`上下文背景：${hint}`)
  }

  // 3. 文件覆盖摘要
  const totalFiles = codeFiles.length + docFiles.length
  if (codeFiles.length > 0 && docFiles.length > 0) {
    goals.push(`变更覆盖 ${codeFiles.length} 个代码文件和 ${docFiles.length} 个文档文件（共 ${totalFiles} 个），验证代码实现与文档描述的一致性`)
  } else if (codeFiles.length > 0) {
    goals.push(`变更覆盖 ${codeFiles.length} 个代码文件，验证代码逻辑正确性、类型安全和编译通过`)
  } else if (docFiles.length > 0) {
    goals.push(`变更覆盖 ${docFiles.length} 个文档文件，验证文档内容一致性、完整性和可追溯性`)
  }

  // 4. 模块/目录影响分析
  const allFiles = [...codeFiles, ...docFiles]
  const moduleSet = new Set<string>()
  for (const fp of allFiles) {
    const normalized = normalizePath(fp)
    const parts = normalized.split('/')
    if (parts.length >= 2 && (parts[0] === 'src' || parts[0] === 'tests')) {
      moduleSet.add(parts.slice(0, 2).join('/'))
    }
  }
  if (moduleSet.size > 0) {
    const modules = [...moduleSet].sort().slice(0, 10)
    goals.push(`受影响模块：${modules.join('、')}${moduleSet.size > 10 ? ' 等' : ''}，验证各模块内部逻辑正确性和模块间接口兼容性`)
  }

  // 5. 设计维度覆盖
  const designDocs = docFiles.filter(isDesignDoc)
  if (designDocs.length > 0) {
    const dimensions = detectDesignDimensions(docFiles)
    if (dimensions.length > 0) {
      const dimNames: Record<string, string> = {
        'architecture': '架构',
        'api': 'API 契约',
        'database': '数据模型',
        'ui-ux': 'UI/UX',
        'test-cases': '测试用例',
        'security': '安全',
        'observability': '可观测性',
        'non-functional': '非功能',
      }
      const dimLabels = dimensions.map((d) => dimNames[d] ?? d)
      goals.push(`设计文档涉及 ${dimLabels.join('、')} 维度，验证各维度设计产物的完整性和维度间一致性`)
    }
  }

  // 6. 测试覆盖验证
  const testFiles = allFiles.filter((fp) => isTestDoc(fp) || /[\\/]tests?[\\/]/i.test(fp))
  if (testFiles.length > 0) {
    goals.push(`变更包含 ${testFiles.length} 个测试文件，验证测试覆盖是否充分、断言是否正确、新增功能是否有对应测试`)
  } else if (codeFiles.length > 0 && reviewMode === 'changes') {
    goals.push('变更未包含测试文件，验证是否有遗漏的测试覆盖')
  }

  // 7. 配置/Schema 变更验证
  const configFiles = allFiles.filter((fp) => {
    const ext = getExt(fp)
    return ext === 'json' || ext === 'yaml' || ext === 'yml' || ext === 'toml' || ext === 'ini' || ext === 'env'
  })
  if (configFiles.length > 0) {
    goals.push(`变更包含 ${configFiles.length} 个配置文件，验证配置项正确性和向后兼容性`)
  }

  return goals.join('；')
}

function isDimensionReviewer(name: string): boolean {
  return Object.values(DIMENSION_TO_AGENT).includes(name)
}

function isDesignIntegrityReviewer(name: string): boolean {
  return name === AGENT.DESIGN_INTEGRITY_REVIEWER
}

function isTraceabilityReviewer(name: string): boolean {
  return name === AGENT.TRACEABILITY_REVIEWER
}

function isGoalAlignmentReviewer(name: string): boolean {
  return name === AGENT.GOAL_ALIGNMENT_REVIEWER
}

function selectFilesForAgent(
  agentName: string,
  codeFiles: string[],
  docFiles: string[],
  designDocs: string[],
  allReviewFiles: string[],
): string[] {
  if (agentName === AGENT.OCR_REVIEWER) {
    return codeFiles
  }

  if (agentName === AGENT.DOCUMENT_REVIEWER) {
    return docFiles
  }

  if (isDimensionReviewer(agentName)) {
    return designDocs.length > 0 ? designDocs : docFiles
  }

  if (isDesignIntegrityReviewer(agentName)) {
    return designDocs
  }

  if (isTraceabilityReviewer(agentName)) {
    return docFiles
  }

  if (isGoalAlignmentReviewer(agentName)) {
    return allReviewFiles
  }

  return allReviewFiles
}

function buildAgentPrompt(
  agentName: string,
  filesForAgent: string[],
  reviewMode: string,
  goals?: string,
): string {
  const template = SPECIALIST_PROMPT_TEMPLATES[agentName] ?? `你是一位专精代理: ${agentName}。`
  const parts: string[] = [template]

  parts.push('')
  parts.push('审查文件列表：')
  for (const f of filesForAgent) {
    parts.push(`- ${f}`)
  }

  parts.push('')
  if (reviewMode === 'changes') {
    parts.push('审查这些文件的变更内容（Git diff 或会话变更），重点关注变更引入的问题。')
  } else if (reviewMode === 'full') {
    parts.push('审查这些文件的完整内容。')
  }

  if (goals && goals.trim().length > 0) {
    parts.push('')
    parts.push(`审查目标：${goals.trim()}`)
  }

  return parts.join('\n')
}

const CONTENT_ANALYSIS_PROMPT = `你是一个文档内容分析助手。请阅读以下文档内容，分析这些文档涉及哪些设计维度。

可选维度列表：
- architecture：架构、模块边界、依赖方向、分层规则、数据流
- api：接口端点、API 契约、版本策略、幂等性
- database：数据模型、表结构、ER 关系、迁移策略
- ui-ux：页面、组件、交互、信息架构、设计 Token
- test-cases：测试用例、覆盖矩阵、P0-P3 用例
- security：认证、权限、威胁模型、信任边界、数据分级
- observability：日志、监控、告警、SLO/SLI、健康检查
- non-functional：性能、并发、容量、缓存、事务边界

请仅返回 JSON 数组格式，包含涉及的维度名，如 ["architecture", "api"]。
如果文档不涉及任何设计维度，返回空数组 []。
只返回 JSON 数组，不要包含其他文字。`

async function analyzeDocContentViaSubSession(
  docFiles: string[],
  worktree: string,
): Promise<string[]> {
  const client = getGlobalClient()
  if (!client) return []

  const nonDesignDocs = docFiles.filter((f) => !isDesignDoc(f) && !isPrdDoc(f))
  if (nonDesignDocs.length === 0) return []

  const fileContents: string[] = []
  for (const fp of nonDesignDocs.slice(0, 10)) {
    try {
      const content = await readFile(join(worktree, fp), 'utf-8')
      fileContents.push(`--- ${fp} ---\n${content.slice(0, 2000)}`)
    } catch {
      // 文件读取失败时跳过
    }
  }

  if (fileContents.length === 0) return []

  const promptText = `${CONTENT_ANALYSIS_PROMPT}\n\n以下是需要分析的文档内容：\n\n${fileContents.join('\n\n')}`

  let sessionId: string | null = null
  try {
    const session = await client.session.create({
      title: 'ae-review-scope-analyze-content-analysis',
    })
    if (session.error || !session.data?.id) return []
    sessionId = session.data.id

    await client.session.prompt({
      sessionID: sessionId,
      parts: [{ type: 'text', text: promptText }],
      // '*': true 显式启用所有工具，edit/write/patch: false 禁止文件修改类工具，question: false 禁止提问确保无人值守
      tools: { '*': true, edit: false, write: false, patch: false, question: false },
    })

    const dimensions = await pollForAnalysisResult(client, sessionId)
    return dimensions
  } catch {
    return []
  } finally {
    if (sessionId) {
      try {
        await client.session.delete({ sessionID: sessionId })
      } catch {
        // 清理失败不影响主流程
      }
    }
  }
}

const MAX_POLL_ATTEMPTS = 10
const POLL_INTERVAL_MS = 1000

async function pollForAnalysisResult(
  client: NonNullable<ReturnType<typeof getGlobalClient>>,
  sessionId: string,
): Promise<string[]> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
    }

    const messages = await client.session.messages({
      sessionID: sessionId,
    })
    if (messages.error || !messages.data) continue

    const assistantMessages = messages.data.filter(
      (m: { info: { role?: string }; parts: Array<{ type: string; text?: string }> }) =>
        m.info?.role === 'assistant',
    )
    if (assistantMessages.length === 0) continue

    const lastMessage = assistantMessages[assistantMessages.length - 1]
    const textParts = lastMessage.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('') ?? ''

    const jsonMatch = textParts.match(/\[[\s\S]*\]/)
    if (!jsonMatch) continue

    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown
      if (!Array.isArray(parsed)) continue

      return parsed.filter(
        (item): item is string => typeof item === 'string' && VALID_DIMENSIONS.has(item),
      )
    } catch {
      continue
    }
  }

  return []
}

export const aeReviewScopeAnalyzeTool = tool({
  description: [
    '审查范围分析：根据文件路径列表快速选择审查代理，返回代理列表、审查范围和额外提示词。',
    '',
    '功能说明：',
    '- 接收文件路径数组和审查模式，按后缀快速分类为代码文件和文档文件',
    '- 代码文件 → 激活 ocr-reviewer；文档文件 → 激活 document-reviewer',
    '- ae/designs/ 下的设计文档通过路径关键词匹配激活对应维度代理',
    '- 非设计文档通过内部子会话分析文件内容，自动识别涉及的维度并激活对应代理',
    '- 用户未传入 goals 时，自动从上下文提示、文件路径、目录结构、设计维度、测试覆盖等多维度推断详细审查目标',
    '- 工具内部完成全部代理选择逻辑，编排层只需调用一次即可获得最终代理列表',
    '',
    '适用场景：',
    '- ae:review 编排层在确定审查范围后调用本工具，获取代理列表和审查上下文',
    '',
    '不适用场景：',
    '- 开发域调度（使用 ae-work-specialist-select，仅限 ae:work 流程）',
    '- 域目录查询（使用 ae-domain-catalog）',
  ].join('\n'),
  args: {
    files: z
      .array(z.string())
      .min(1)
      .describe('审查范围内的文件路径列表，相对于仓库根目录'),
    reviewMode: z
      .enum(['changes', 'full'])
      .describe('审查模式：changes=审查变更内容，full=审查完整文件内容'),
    goals: z
      .string()
      .optional()
      .describe('审查目标（成功条件列表）。用户显式传入时直接透传，跳过自动分析；未传入时工具自动从 contextHint、文件路径、目录结构、设计维度、测试覆盖、配置变更等多维度推断详细审查目标'),
    contextHint: z
      .string()
      .optional()
      .describe('上下文提示：描述审查背景（如"会话变更"、"全量审查"、"首次提交"等），用于推断目标代理激活'),
    worktree: z
      .string()
      .optional()
      .describe('工作区根目录绝对路径，用于读取文档文件内容进行子会话分析。未传入时跳过内容分析'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: '准备审查调度...', metadata: { fileCount: args.files.length, mode: args.reviewMode } })

    try {
      const { codeFiles, docFiles, excludedFiles } = classifyFiles(args.files)

      const agents: string[] = []
      const agentReasons: Array<{ agent: string; reason: string }> = []

      if (codeFiles.length > 0) {
        agents.push(AGENT.OCR_REVIEWER)
        agentReasons.push({ agent: AGENT.OCR_REVIEWER, reason: `范围包含 ${codeFiles.length} 个代码文件` })
      }

      if (docFiles.length > 0) {
        agents.push(AGENT.DOCUMENT_REVIEWER)
        agentReasons.push({ agent: AGENT.DOCUMENT_REVIEWER, reason: `范围包含 ${docFiles.length} 个文档文件` })

        const designDimensions = detectDesignDimensions(docFiles)
        for (const dim of designDimensions) {
          const agentName = DIMENSION_TO_AGENT[dim]
          if (agentName && !agents.includes(agentName)) {
            agents.push(agentName)
            agentReasons.push({ agent: agentName, reason: `ae/designs/ 文档涉及 ${dim} 维度` })
          }
        }

        const nonDesignDocs = docFiles.filter((f) => !isDesignDoc(f) && !isPrdDoc(f))
        if (nonDesignDocs.length > 0 && args.worktree) {
          ctx.metadata({ title: '正在分析文档内容特征...' })
          const contentDimensions = await analyzeDocContentViaSubSession(docFiles, args.worktree)
          for (const dim of contentDimensions) {
            const agentName = DIMENSION_TO_AGENT[dim]
            if (agentName && !agents.includes(agentName)) {
              agents.push(agentName)
              agentReasons.push({ agent: agentName, reason: `子会话内容分析检测到 ${dim} 维度` })
            }
          }
        }

        if (hasMultipleDesignDimensions(docFiles)) {
          if (!agents.includes(AGENT.DESIGN_INTEGRITY_REVIEWER)) {
            agents.push(AGENT.DESIGN_INTEGRITY_REVIEWER)
            agentReasons.push({ agent: AGENT.DESIGN_INTEGRITY_REVIEWER, reason: 'ae/designs/ 下存在 2+ 维度产物' })
          }
        }

        const docCategories = detectDocCategories(docFiles)
        if (docCategories >= 2) {
          if (!agents.includes(AGENT.TRACEABILITY_REVIEWER)) {
            agents.push(AGENT.TRACEABILITY_REVIEWER)
            agentReasons.push({ agent: AGENT.TRACEABILITY_REVIEWER, reason: `审查范围包含 ${docCategories} 类项目文档` })
          }
        }
      }

      const hasExplicitGoals = args.goals && args.goals.trim().length > 0
      const contextHint = (args.contextHint ?? '').toLowerCase()

      const effectiveGoals = hasExplicitGoals && args.goals
        ? args.goals.trim()
        : generateGoalsFromContext(args.contextHint ?? '', args.reviewMode, codeFiles, docFiles)

      if (hasExplicitGoals) {
        if (!agents.includes(AGENT.GOAL_ALIGNMENT_REVIEWER)) {
          agents.push(AGENT.GOAL_ALIGNMENT_REVIEWER)
          agentReasons.push({ agent: AGENT.GOAL_ALIGNMENT_REVIEWER, reason: '用户显式传入审查目标' })
        }
      } else {
        if (!agents.includes(AGENT.GOAL_ALIGNMENT_REVIEWER)) {
          agents.push(AGENT.GOAL_ALIGNMENT_REVIEWER)
          agentReasons.push({ agent: AGENT.GOAL_ALIGNMENT_REVIEWER, reason: '自动从上下文和变更文件推断审查目标' })
        }
      }

      const reviewFiles = [...new Set([...codeFiles, ...docFiles])]
      const extraPrompt = buildExtraPrompt(args.reviewMode, effectiveGoals)
      const designDocs = docFiles.filter(isDesignDoc)

      const tasks = agents.map((name) => {
        const filesForAgent = selectFilesForAgent(name, codeFiles, docFiles, designDocs, reviewFiles)
        const prompt = buildAgentPrompt(name, filesForAgent, args.reviewMode, effectiveGoals)
        return { agent: name, prompt, files: filesForAgent }
      })

      return JSON.stringify({
        agents,
        tasks,
        agentReasons,
        reviewFiles,
        excludedFiles,
        goals: effectiveGoals,
        extraPrompt,
        stats: {
          totalFiles: args.files.length,
          codeFiles: codeFiles.length,
          docFiles: docFiles.length,
          excludedFiles: excludedFiles.length,
          agentCount: agents.length,
        },
      }, null, 2)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `准备审查调度时出错: ${message}`
    }
  },
})
