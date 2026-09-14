#!/usr/bin/env node
/**
 * scope-analyze.mjs — ae-review 的确定性审查范围分析与代理路由。
 *
 * 从 AE 的 ae-review-scope-analyze 工具移植为技能内嵌脚本：
 * - 保留全部确定性逻辑（文件分类、维度检测、goals 推断、per-persona prompt 构建）
 * - 删除 LLM 子会话分支：非设计文档的维度判断由编排模型内联完成（见 SKILL.md）
 * - 输出 tasks[].registered 标记：true 表示 omp 已注册代理（仅 ocr-reviewer），
 *   false 表示 persona，编排层用通用 task 子代理 + 本脚本构建的 prompt 派发
 *
 * 用法：
 *   node scope-analyze.mjs --files a.ts,b.md --mode changes|full \
 *        [--goals "..."] [--context-hint "..."] [--worktree <abs>]
 *
 * 输出：stdout 一个 JSON 对象（结构见 buildOutput）。仅依赖 node 内置模块。
 */

import process from 'node:process'

// ---------- OCR (open-code-review) 支持范围 ----------
// 来源：open-code-review/internal/config/allowlist/supported_file_types.json
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

// 来源：open-code-review/internal/tool/file_find.go shouldSkipFile 白名单
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

const EXCLUDED_DIR_PREFIXES = [
  'node_modules/',
  'ae/reviews/',
  'ae/handoffs/',
  'ae/logs/',
  'ae/screenshots/',
  'ae/markdown/',
  'ae/documents/',
  'ae/reports/',
]

// ---------- persona 目录 ----------
const AGENT = {
  OCR_REVIEWER: 'ocr-reviewer',
  DOCUMENT_REVIEWER: 'document-reviewer',
  ARCHITECTURE_DESIGN_REVIEWER: 'architecture-design-reviewer',
  API_DESIGN_REVIEWER: 'api-design-reviewer',
  DATABASE_DESIGN_REVIEWER: 'database-design-reviewer',
  UI_UX_DESIGN_REVIEWER: 'ui-ux-design-reviewer',
  TEST_CASES_DESIGN_REVIEWER: 'test-cases-design-reviewer',
  SECURITY_DESIGN_REVIEWER: 'security-design-reviewer',
  OBSERVABILITY_DESIGN_REVIEWER: 'observability-design-reviewer',
  NON_FUNCTIONAL_DESIGN_REVIEWER: 'non-functional-design-reviewer',
  DESIGN_INTEGRITY_REVIEWER: 'design-integrity-reviewer',
  TRACEABILITY_REVIEWER: 'traceability-reviewer',
  GOAL_ALIGNMENT_REVIEWER: 'goal-alignment-reviewer',
}

// omp 侧已注册的代理；其余 persona 用通用 task 子代理 + 构建好的 prompt 派发
const REGISTERED_AGENTS = new Set([AGENT.OCR_REVIEWER])

const DIMENSION_TO_AGENT = {
  'architecture': AGENT.ARCHITECTURE_DESIGN_REVIEWER,
  'api': AGENT.API_DESIGN_REVIEWER,
  'database': AGENT.DATABASE_DESIGN_REVIEWER,
  'ui-ux': AGENT.UI_UX_DESIGN_REVIEWER,
  'test-cases': AGENT.TEST_CASES_DESIGN_REVIEWER,
  'security': AGENT.SECURITY_DESIGN_REVIEWER,
  'observability': AGENT.OBSERVABILITY_DESIGN_REVIEWER,
  'non-functional': AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER,
  'design-spec': AGENT.UI_UX_DESIGN_REVIEWER,
  'constraints': AGENT.ARCHITECTURE_DESIGN_REVIEWER,
  'cross-mapping': AGENT.DESIGN_INTEGRITY_REVIEWER,
  'overview': AGENT.DESIGN_INTEGRITY_REVIEWER,
}

const DIMENSION_LABELS = {
  'architecture': '架构',
  'api': 'API 契约',
  'database': '数据模型',
  'ui-ux': 'UI/UX',
  'test-cases': '测试用例',
  'security': '安全',
  'observability': '可观测性',
  'non-functional': '非功能',
  'design-spec': '设计规范',
  'constraints': '实施约束',
  'cross-mapping': '跨维度映射',
  'overview': '设计总览',
}

// 角色一行文案（源自 AE specialist-prompt-templates.ts）
const PERSONA_PROMPTS = {
  [AGENT.OCR_REVIEWER]: '你是 OCR 代码审查主引擎。通过 ocr CLI 的 delegate 模式获取审查规格（文件清单 + 规则），由本代理执行审查，覆盖 bug/安全/性能/可维护性/测试覆盖/风格/规范/对抗式/可靠性。',
  [AGENT.DOCUMENT_REVIEWER]: '你是一位文档审查者。审查内部一致性、可行性、产品视角、步骤粒度、需求质量和证据核验。',
  [AGENT.SECURITY_DESIGN_REVIEWER]: '你是一位安全设计审查者。评估设计文档中的安全缺口、认证授权假设、数据暴露和威胁模型。',
  [AGENT.ARCHITECTURE_DESIGN_REVIEWER]: '你是一位架构设计审查者。从架构视角分析变更，检查架构边界、跨模块依赖和系统级抽象。',
  [AGENT.API_DESIGN_REVIEWER]: '你是一位 API 设计审查者。审查破坏性契约变更和兼容性。',
  [AGENT.DATABASE_DESIGN_REVIEWER]: '你是一位数据库设计审查者。审查数据完整性、迁移安全性和隐私合规。',
  [AGENT.UI_UX_DESIGN_REVIEWER]: '你是一位 UI/UX 设计审查者。审查设计决策、信息架构、交互状态、原型完整性和与需求的一致性。',
  [AGENT.TEST_CASES_DESIGN_REVIEWER]: '你是一位测试用例审查者。审查测试文档的结构完整性、覆盖完备性、步骤可执行性和需求对齐。',
  [AGENT.TRACEABILITY_REVIEWER]: '你是一位追溯审查者。审查需求、设计、原型、测试和代码之间的链路断裂。',
  [AGENT.GOAL_ALIGNMENT_REVIEWER]: '你是一位目标对齐审查者。逐条校验变更是否达成审查目标。',
  [AGENT.DESIGN_INTEGRITY_REVIEWER]: '你是一位设计完整性审查者。审查设计文档与需求的一致性、设计维度完整性和架构可行性。',
  [AGENT.OBSERVABILITY_DESIGN_REVIEWER]: '你是一位可观测性设计审查者。审查日志规范、指标体系、告警规则、健康检查和 SLO/SLI 定义。',
  [AGENT.NON_FUNCTIONAL_DESIGN_REVIEWER]: '你是一位非功能设计审查者。审查性能目标、并发模型、事务边界、缓存策略和容量规划。',
}

// ---------- 文件分类 ----------
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/')
}

function getExt(filePath) {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filePath.slice(lastDot + 1).toLowerCase()
}

function isExcluded(filePath) {
  const normalized = normalizePath(filePath)
  const ext = getExt(normalized)
  const basename = normalized.split('/').pop() ?? normalized
  if (ext === 'env') return true
  if (basename.startsWith('.env') && basename !== '.env.example' && basename !== '.env.template') return true
  if (EXCLUDED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true
  if (EXCLUDED_EXTENSIONS.has(ext)) return true
  if (['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(normalized)) return true
  return false
}

function isCodeFile(filePath) {
  const ext = getExt(filePath)
  if (OCR_SUPPORTED_EXTENSIONS.has(ext)) return true
  if (CODE_TEST_PATTERNS.some((p) => p.test(filePath))) return true
  const basename = filePath.split(/[\\/]/).pop() ?? filePath
  return OCR_SPECIAL_FILENAMES.has(basename.toLowerCase())
}

function isDocFile(filePath) {
  return DOC_EXTENSIONS.has(getExt(filePath))
}

function isDesignDoc(filePath) {
  return normalizePath(filePath).startsWith('ae/designs/')
}

function isPrdDoc(filePath) {
  return normalizePath(filePath).startsWith('ae/prds/')
}

function isTestDoc(filePath) {
  return /[\\/]tests?[\\/]/i.test(filePath) || /\.(test|spec|bench)\./i.test(filePath)
}

function classifyFiles(filePaths) {
  const codeFiles = []
  const docFiles = []
  const excludedFiles = []

  for (const fp of filePaths) {
    if (isExcluded(fp)) {
      excludedFiles.push(fp)
      continue
    }
    const isCode = isCodeFile(fp)
    const isDoc = isDocFile(fp)
    if (isCode) codeFiles.push(fp)
    if (isDoc) docFiles.push(fp)
    // 无法判定的文件同时进入两侧，避免漏审
    if (!isCode && !isDoc) {
      codeFiles.push(fp)
      docFiles.push(fp)
    }
  }

  return { codeFiles, docFiles, excludedFiles }
}

// ---------- 维度检测 ----------
const DIMENSION_FILENAME_KEYS = [
  'api', 'database', 'ui-ux', 'test-cases', 'architecture', 'security',
  'observability', 'non-functional', 'design-spec', 'constraints',
  'cross-mapping', 'overview',
]

const DIMENSION_KEYWORDS = [
  ['architecture', /架构|模块|分层|边界|依赖方向|architecture/],
  ['api', /接口|端点|api|契约|endpoint/],
  ['database', /数据模型|表结构|迁移|database|schema|er\s*模型/],
  ['ui-ux', /页面|组件|交互|ui|ux|界面|原型|prototype/],
  ['test-cases', /测试用例|覆盖矩阵|test.case|覆盖率|p0|p1|p2|p3/],
  ['security', /认证|权限|密钥|威胁|安全|security|授权|信任边界/],
  ['observability', /日志|监控|告警|slo|sli|observability|指标/],
  ['non-functional', /性能|并发|容量|缓存|non-functional|latency|throughput/],
  ['design-spec', /设计规范|design.spec|视觉规范|design.token/],
  ['constraints', /实施约束|约束|constraints|技术约束/],
  ['cross-mapping', /跨维度|映射|cross.mapping|维度映射/],
  ['overview', /设计总览|总览|overview|设计概览/],
]

function detectDesignDimensions(docFiles) {
  const dimensions = []
  const designDocs = docFiles.filter(isDesignDoc)
  if (designDocs.length === 0) return dimensions

  // 文件名直接匹配维度
  for (const f of designDocs) {
    const lower = f.toLowerCase()
    for (const key of DIMENSION_FILENAME_KEYS) {
      if (lower.endsWith(`/${key}.md`) || lower.includes(`/${key}-`)) dimensions.push(key)
    }
  }

  // 关键词匹配兜底
  const designPaths = designDocs.join(' ').toLowerCase()
  for (const [dim, pattern] of DIMENSION_KEYWORDS) {
    if (pattern.test(designPaths)) dimensions.push(dim)
  }

  return [...new Set(dimensions)]
}

function detectDocCategories(docFiles) {
  let categories = 0
  if (docFiles.some(isPrdDoc)) categories++
  if (docFiles.some(isDesignDoc)) categories++
  if (docFiles.some(isTestDoc)) categories++
  return categories
}

function hasMultipleDesignDimensions(docFiles) {
  const designDocs = docFiles.filter(isDesignDoc)
  if (designDocs.length < 2) return false
  return detectDesignDimensions(designDocs).length >= 2
}

// ---------- goals 推断 ----------
function generateGoalsFromContext(contextHint, reviewMode, codeFiles, docFiles) {
  const goals = []

  if (reviewMode === 'full') {
    goals.push('审查全部文件的完整内容是否正确实现，验证整体架构一致性和代码质量')
  } else {
    goals.push('审查变更内容是否正确实现，重点关注变更引入的问题、破坏性变更和回归风险')
  }

  const hint = contextHint.trim()
  if (hint.length > 0) goals.push(`上下文背景：${hint}`)

  const totalFiles = codeFiles.length + docFiles.length
  if (codeFiles.length > 0 && docFiles.length > 0) {
    goals.push(`变更覆盖 ${codeFiles.length} 个代码文件和 ${docFiles.length} 个文档文件（共 ${totalFiles} 个），验证代码实现与文档描述的一致性`)
  } else if (codeFiles.length > 0) {
    goals.push(`变更覆盖 ${codeFiles.length} 个代码文件，验证代码逻辑正确性、类型安全和编译通过`)
  } else if (docFiles.length > 0) {
    goals.push(`变更覆盖 ${docFiles.length} 个文档文件，验证文档内容一致性、完整性和可追溯性`)
  }

  const allFiles = [...codeFiles, ...docFiles]
  const moduleSet = new Set()
  for (const fp of allFiles) {
    const parts = normalizePath(fp).split('/')
    if (parts.length >= 2 && (parts[0] === 'src' || parts[0] === 'tests')) {
      moduleSet.add(parts.slice(0, 2).join('/'))
    }
  }
  if (moduleSet.size > 0) {
    const modules = [...moduleSet].sort().slice(0, 10)
    goals.push(`受影响模块：${modules.join('、')}${moduleSet.size > 10 ? ' 等' : ''}，验证各模块内部逻辑正确性和模块间接口兼容性`)
  }

  const designDocs = docFiles.filter(isDesignDoc)
  if (designDocs.length > 0) {
    const dimensions = detectDesignDimensions(docFiles)
    if (dimensions.length > 0) {
      const dimLabels = dimensions.map((d) => DIMENSION_LABELS[d] ?? d)
      goals.push(`设计文档涉及 ${dimLabels.join('、')} 维度，验证各维度设计产物的完整性和维度间一致性`)
    }
  }

  const testFiles = allFiles.filter((fp) => isTestDoc(fp))
  if (testFiles.length > 0) {
    goals.push(`变更包含 ${testFiles.length} 个测试文件，验证测试覆盖是否充分、断言是否正确、新增功能是否有对应测试`)
  } else if (codeFiles.length > 0 && reviewMode === 'changes') {
    goals.push('变更未包含测试文件，验证是否有遗漏的测试覆盖')
  }

  const configFiles = allFiles.filter((fp) => {
    const ext = getExt(fp)
    return ['json', 'yaml', 'yml', 'toml', 'ini', 'env'].includes(ext)
  })
  if (configFiles.length > 0) {
    goals.push(`变更包含 ${configFiles.length} 个配置文件，验证配置项正确性和向后兼容性`)
  }

  return goals.join('；')
}

// ---------- 代理选择与 prompt 构建 ----------
function isDimensionReviewer(name) {
  return Object.values(DIMENSION_TO_AGENT).includes(name)
}

function selectFilesForAgent(agentName, codeFiles, docFiles, designDocs, allReviewFiles) {
  if (agentName === AGENT.OCR_REVIEWER) return codeFiles
  if (agentName === AGENT.DOCUMENT_REVIEWER) return docFiles
  if (agentName === AGENT.DESIGN_INTEGRITY_REVIEWER) return designDocs
  if (agentName === AGENT.TRACEABILITY_REVIEWER) return docFiles
  if (isDimensionReviewer(agentName)) return designDocs.length > 0 ? designDocs : docFiles
  if (agentName === AGENT.GOAL_ALIGNMENT_REVIEWER) return allReviewFiles
  return allReviewFiles
}

function buildAgentPrompt(agentName, filesForAgent, reviewMode, goals) {
  const template = PERSONA_PROMPTS[agentName] ?? `你是一位专精代理: ${agentName}。`
  const parts = [template, '', '审查文件列表：']
  for (const f of filesForAgent) parts.push(`- ${f}`)

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

  parts.push('')
  parts.push('只找问题不做修复。按 findings schema 返回结构化结果（severity/title/file/line/detail/suggestion）。')

  return parts.join('\n')
}

function buildExtraPrompt(reviewMode, goals) {
  const parts = []
  if (reviewMode === 'changes') {
    parts.push('审查这些文件的变更内容（Git diff 或会话变更），重点关注变更引入的问题。')
  } else if (reviewMode === 'full') {
    parts.push('审查这些文件的完整内容。')
  }
  if (goals && goals.trim().length > 0) parts.push(`审查目标：${goals.trim()}`)
  return parts.join('\n')
}

// ---------- CLI ----------
function parseArgs(argv) {
  const out = { files: [], mode: undefined, goals: undefined, contextHint: undefined, worktree: undefined }
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    switch (arg) {
      case '--files': {
        const raw = next()
        if (typeof raw !== 'string') fail('--files 需要逗号分隔的文件路径列表')
        out.files = raw.split(',').map((s) => s.trim()).filter(Boolean)
        break
      }
      case '--mode': out.mode = next(); break
      case '--goals': out.goals = next(); break
      case '--context-hint': out.contextHint = next(); break
      case '--worktree': out.worktree = next(); break
      default: fail(`未知参数: ${arg}`)
    }
  }
  return out
}

function fail(reason) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason }, null, 2)}\n`)
  process.exit(1)
}

function analyze(args) {
  if (args.files.length === 0) fail('至少需要 1 个文件路径（--files）')
  if (args.mode !== 'changes' && args.mode !== 'full') fail('--mode 必须是 changes 或 full')

  const { codeFiles, docFiles, excludedFiles } = classifyFiles(args.files)

  const agents = []
  const agentReasons = []
  const pushAgent = (agent, reason) => {
    if (!agents.includes(agent)) {
      agents.push(agent)
      agentReasons.push({ agent, reason })
    }
  }

  if (codeFiles.length > 0) {
    pushAgent(AGENT.OCR_REVIEWER, `范围包含 ${codeFiles.length} 个代码文件`)
  }

  if (docFiles.length > 0) {
    pushAgent(AGENT.DOCUMENT_REVIEWER, `范围包含 ${docFiles.length} 个文档文件`)

    for (const dim of detectDesignDimensions(docFiles)) {
      const agentName = DIMENSION_TO_AGENT[dim]
      if (agentName) pushAgent(agentName, `ae/designs/ 文档涉及 ${dim} 维度`)
    }

    // 非设计文档（不含 PRD）的内容维度判断由编排模型内联完成：
    // 脚本给出待判文件清单，编排模型读取后按 DIMENSION_KEYWORDS 语义补激活对应 persona。
    const nonDesignDocs = docFiles.filter((f) => !isDesignDoc(f) && !isPrdDoc(f))

    if (hasMultipleDesignDimensions(docFiles)) {
      pushAgent(AGENT.DESIGN_INTEGRITY_REVIEWER, 'ae/designs/ 下存在 2+ 维度产物')
    }

    const docCategories = detectDocCategories(docFiles)
    if (docCategories >= 2) {
      pushAgent(AGENT.TRACEABILITY_REVIEWER, `审查范围包含 ${docCategories} 类项目文档`)
    }

    return finish({ codeFiles, docFiles, excludedFiles, nonDesignDocs })
  }

  return finish({ codeFiles, docFiles, excludedFiles, nonDesignDocs: [] })

  function finish({ codeFiles: cf, docFiles: df, excludedFiles: ef, nonDesignDocs }) {
    const hasExplicitGoals = typeof args.goals === 'string' && args.goals.trim().length > 0
    const effectiveGoals = hasExplicitGoals
      ? args.goals.trim()
      : generateGoalsFromContext(args.contextHint ?? '', args.mode, cf, df)

    pushAgent(
      AGENT.GOAL_ALIGNMENT_REVIEWER,
      hasExplicitGoals ? '用户显式传入审查目标' : '自动从上下文和变更文件推断审查目标',
    )

    const reviewFiles = [...new Set([...cf, ...df])]
    const designDocs = df.filter(isDesignDoc)

    const tasks = agents.map((name) => {
      const filesForAgent = selectFilesForAgent(name, cf, df, designDocs, reviewFiles)
      return {
        agent: name,
        registered: REGISTERED_AGENTS.has(name),
        prompt: buildAgentPrompt(name, filesForAgent, args.mode, effectiveGoals),
        files: filesForAgent,
      }
    })

    return {
      ok: true,
      agents,
      tasks,
      agentReasons,
      reviewFiles,
      excludedFiles: ef,
      goals: effectiveGoals,
      extraPrompt: buildExtraPrompt(args.mode, effectiveGoals),
      // 编排模型需内联判断维度的非设计文档（脚本不做 LLM 分析）
      contentAnalysisCandidates: nonDesignDocs,
      worktree: args.worktree ?? null,
      stats: {
        totalFiles: args.files.length,
        codeFiles: cf.length,
        docFiles: df.length,
        excludedFiles: ef.length,
        agentCount: agents.length,
      },
    }
  }
}

const result = analyze(parseArgs(process.argv))
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
