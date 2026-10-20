#!/usr/bin/env node
/**
 * 审查范围分析器（零依赖）
 *
 * 输入文件路径列表，按后缀/路径特征分类，判定需要激活哪些审查角色，
 * 为每个角色生成可直接使用的审查提示词，并自动推断审查目标。
 *
 * 用法：
 *   node scripts/scope-analyze.mjs --files a.ts,b.md --mode changes
 *   node scripts/scope-analyze.mjs --input scope.json
 *   cat scope.json | node scripts/scope-analyze.mjs
 *
 * 输入（JSON）：
 * {
 *   "files": ["src/a.ts", "ae/design/x/overview.md"],
 *   "reviewMode": "changes" | "full",
 *   "goals": "可选，显式审查目标；给出则跳过自动推断",
 *   "contextHint": "可选，审查背景描述"
 * }
 *
 * 输出（JSON）：
 * {
 *   "roles": ["ocr-reviewer", "..."],          // 需要激活的角色（对应 references/roles/<role>.md）
 *   "roleReasons": [{ "role": "...", "reason": "..." }],
 *   "tasks": [{ "role": "...", "prompt": "...", "files": [...] }],
 *   "reviewFiles": [...], "excludedFiles": [...],
 *   "goals": "...",
 *   "dimensions": ["architecture", "..."],       // 检出的设计维度
 *   "extraPrompt": "...",
 *   "stats": {...},
 *   "manualDimensionCheck": true|false          // true 时需人工/代理阅读文档内容补检维度
 * }
 */

import { readFileSync } from 'node:fs'

/* ------------------------------------------------------------------ *
 * 分类常量
 * ------------------------------------------------------------------ */

/** 可被代码审查工具处理的文件后缀 */
const CODE_EXTENSIONS = new Set([
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

/** 无后缀但属于代码的特殊文件名 */
const CODE_SPECIAL_FILENAMES = new Set([
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

/** AE 产物目录：审查范围默认排除自身产物 */
const EXCLUDED_DIR_PREFIXES = [
  'ae/logs/',
  'ae/review/',
  'ae/handoff/',
  'ae/test-artifacts/',
  'ae/e2e-test/',
  'ae/api-test/',
  'ae/unit-test/',
  'ae/playwright/',
]

const VALID_DIMENSIONS = new Set([
  'architecture', 'api', 'database', 'ui-ux', 'test-cases',
  'security', 'observability', 'non-functional',
  'design-spec', 'constraints', 'cross-mapping', 'overview',
])

/** 设计维度 → 审查角色名（对应 references/roles/<role>.md） */
const DIMENSION_TO_ROLE = {
  architecture: 'architecture-design-reviewer',
  api: 'api-design-reviewer',
  database: 'database-design-reviewer',
  'ui-ux': 'ui-ux-design-reviewer',
  'test-cases': 'test-cases-design-reviewer',
  security: 'security-design-reviewer',
  observability: 'observability-design-reviewer',
  'non-functional': 'non-functional-design-reviewer',
  'design-spec': 'ui-ux-design-reviewer',
  constraints: 'architecture-design-reviewer',
  'cross-mapping': 'design-integrity-reviewer',
  overview: 'design-integrity-reviewer',
}

/** 角色提示词模板 */
const ROLE_PROMPT_TEMPLATES = {
  'ocr-reviewer': '你是代码审查主引擎。通过 ocr-code-review 技能的 delegate 模式获取审查规格（文件清单 + 规则），由你执行审查，覆盖 bug/安全/性能/可维护性/测试覆盖/风格/规范/对抗式/可靠性。',
  'document-reviewer': '你是一位文档审查者。审查内部一致性、可行性、产品视角、步骤粒度、需求质量和证据核验。',
  'security-design-reviewer': '你是一位安全设计审查者。评估设计文档中的安全缺口、认证授权假设、数据暴露和威胁模型。',
  'architecture-design-reviewer': '你是一位架构设计审查者。从架构视角分析变更，检查架构边界、跨模块依赖和系统级抽象。',
  'api-design-reviewer': '你是一位 API 设计审查者。审查破坏性契约变更和兼容性。',
  'database-design-reviewer': '你是一位数据库设计审查者。审查数据完整性、迁移安全性和隐私合规。',
  'ui-ux-design-reviewer': '你是一位 UI/UX 设计审查者。审查设计决策、信息架构、交互状态、原型完整性和与需求的一致性。',
  'test-cases-design-reviewer': '你是一位测试用例审查者。审查测试文档的结构完整性、覆盖完备性、步骤可执行性和需求对齐。',
  'traceability-reviewer': '你是一位追溯审查者。审查需求、设计、原型、测试和代码之间的链路断裂。',
  'goal-alignment-reviewer': '你是一位目标对齐审查者。逐条校验变更是否达成审查目标。',
  'design-integrity-reviewer': '你是一位设计完整性审查者。审查设计文档与需求的一致性、设计维度完整性和架构可行性。',
  'observability-design-reviewer': '你是一位可观测性设计审查者。审查日志规范、指标体系、告警规则、健康检查和 SLO/SLI 定义。',
  'non-functional-design-reviewer': '你是一位非功能设计审查者。审查性能目标、并发模型、事务边界、缓存策略和容量规划。',
}

/* ------------------------------------------------------------------ *
 * 路径工具
 * ------------------------------------------------------------------ */

function normalizePath(filePath) {
  return String(filePath).replace(/\\/g, '/')
}

function getExt(filePath) {
  const normalized = normalizePath(filePath)
  const lastDot = normalized.lastIndexOf('.')
  if (lastDot === -1) {
    return ''
  }
  return normalized.slice(lastDot + 1).toLowerCase()
}

function basename(filePath) {
  return normalizePath(filePath).split('/').pop() ?? filePath
}

function isExcluded(filePath) {
  const normalized = normalizePath(filePath)
  const ext = getExt(normalized)
  const base = basename(normalized)
  if (ext === 'env') {
    return true
  }
  if (base.startsWith('.env') && base !== '.env.example' && base !== '.env.template') {
    return true
  }
  if (EXCLUDED_DIR_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }
  if (EXCLUDED_EXTENSIONS.has(ext)) {
    return true
  }
  if (normalized === 'package-lock.json' || normalized === 'yarn.lock' || normalized === 'pnpm-lock.yaml') {
    return true
  }
  return false
}

function isCodeFile(filePath) {
  const ext = getExt(filePath)
  if (CODE_EXTENSIONS.has(ext)) {
    return true
  }
  if (CODE_TEST_PATTERNS.some((pattern) => pattern.test(filePath))) {
    return true
  }
  if (CODE_SPECIAL_FILENAMES.has(basename(filePath).toLowerCase())) {
    return true
  }
  return false
}

function isDocFile(filePath) {
  return DOC_EXTENSIONS.has(getExt(filePath))
}

function isDesignDoc(filePath) {
  return normalizePath(filePath).startsWith('ae/design/')
}

function isPrdDoc(filePath) {
  return normalizePath(filePath).startsWith('ae/prd/')
}

function isTestDoc(filePath) {
  return /(^|\/)(tests?)(\/|$)/i.test(normalizePath(filePath)) || /\.(test|spec|bench)\./i.test(filePath)
}

/* ------------------------------------------------------------------ *
 * 核心逻辑
 * ------------------------------------------------------------------ */

function classifyFiles(filePaths) {
  const codeFiles = []
  const docFiles = []
  const excludedFiles = []
  for (const filePath of filePaths) {
    if (isExcluded(filePath)) {
      excludedFiles.push(filePath)
      continue
    }
    const code = isCodeFile(filePath)
    const doc = isDocFile(filePath)
    if (code) {
      codeFiles.push(filePath)
    }
    if (doc) {
      docFiles.push(filePath)
    }
    if (!code && !doc) {
      codeFiles.push(filePath)
      docFiles.push(filePath)
    }
  }
  return { codeFiles, docFiles, excludedFiles }
}

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

const DIMENSION_LABELS = {
  architecture: '架构',
  api: 'API 契约',
  database: '数据模型',
  'ui-ux': 'UI/UX',
  'test-cases': '测试用例',
  security: '安全',
  observability: '可观测性',
  'non-functional': '非功能',
  'design-spec': '设计规范',
  constraints: '实施约束',
  'cross-mapping': '跨维度映射',
  overview: '设计总览',
}

function detectDesignDimensions(docFiles) {
  const dimensions = []
  const designDocs = docFiles.filter(isDesignDoc)
  if (designDocs.length === 0) {
    return dimensions
  }

  const fileNameRules = [
    ['api', /\/api(-|\.md$)/],
    ['database', /\/database(-|\.md$)/],
    ['ui-ux', /\/ui-ux(-|\.md$)/],
    ['test-cases', /\/test-cases(-|\.md$)/],
    ['architecture', /\/architecture(-|\.md$)/],
    ['security', /\/security(-|\.md$)/],
    ['observability', /\/observability(-|\.md$)/],
    ['non-functional', /\/non-functional(-|\.md$)/],
    ['design-spec', /\/design-spec(-|\.md$)/],
    ['constraints', /\/constraints(-|\.md$)/],
    ['cross-mapping', /\/cross-mapping(-|\.md$)/],
    ['overview', /\/overview(-|\.md$)/],
  ]
  for (const filePath of designDocs) {
    const lower = normalizePath(filePath).toLowerCase()
    for (const [dimension, pattern] of fileNameRules) {
      if (pattern.test(lower)) {
        dimensions.push(dimension)
      }
    }
  }

  const joined = designDocs.join(' ').toLowerCase()
  for (const [dimension, pattern] of DIMENSION_KEYWORDS) {
    if (pattern.test(joined)) {
      dimensions.push(dimension)
    }
  }

  return [...new Set(dimensions)]
}

function detectDocCategories(docFiles) {
  let categories = 0
  if (docFiles.some(isPrdDoc)) categories += 1
  if (docFiles.some(isDesignDoc)) categories += 1
  if (docFiles.some(isTestDoc)) categories += 1
  return categories
}

function generateGoalsFromContext(contextHint, reviewMode, codeFiles, docFiles) {
  const goals = []
  if (reviewMode === 'full') {
    goals.push('审查全部文件的完整内容是否正确实现，验证整体架构一致性和代码质量')
  } else {
    goals.push('审查变更内容是否正确实现，重点关注变更引入的问题、破坏性变更和回归风险')
  }

  const hint = String(contextHint ?? '').trim()
  if (hint.length > 0) {
    goals.push(`上下文背景：${hint}`)
  }

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
  for (const filePath of allFiles) {
    const parts = normalizePath(filePath).split('/')
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
      const labels = dimensions.map((d) => DIMENSION_LABELS[d] ?? d)
      goals.push(`设计文档涉及 ${labels.join('、')} 维度，验证各维度设计产物的完整性和维度间一致性`)
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

function buildExtraPrompt(reviewMode, goals) {
  const parts = []
  if (reviewMode === 'changes') {
    parts.push('审查这些文件的变更内容（Git diff 或会话变更），重点关注变更引入的问题。')
  } else if (reviewMode === 'full') {
    parts.push('审查这些文件的完整内容。')
  }
  if (goals && String(goals).trim().length > 0) {
    parts.push(`审查目标：${String(goals).trim()}`)
  }
  return parts.join('\n')
}

function selectFilesForRole(role, codeFiles, docFiles, designDocs, allReviewFiles) {
  if (role === 'ocr-reviewer') {
    return codeFiles
  }
  if (role === 'document-reviewer') {
    return docFiles
  }
  if (Object.values(DIMENSION_TO_ROLE).includes(role)) {
    return designDocs.length > 0 ? designDocs : docFiles
  }
  if (role === 'design-integrity-reviewer') {
    return designDocs
  }
  if (role === 'traceability-reviewer') {
    return docFiles
  }
  return allReviewFiles
}

function buildRolePrompt(role, files, reviewMode, goals) {
  const template = ROLE_PROMPT_TEMPLATES[role] ?? `你是一位审查角色：${role}。`
  const parts = [template, '', '审查文件列表：']
  for (const file of files) {
    parts.push(`- ${file}`)
  }
  parts.push('')
  if (reviewMode === 'changes') {
    parts.push('审查这些文件的变更内容（Git diff 或会话变更），重点关注变更引入的问题。')
  } else {
    parts.push('审查这些文件的完整内容。')
  }
  if (goals && String(goals).trim().length > 0) {
    parts.push('')
    parts.push(`审查目标：${String(goals).trim()}`)
  }
  return parts.join('\n')
}

export function analyzeScope(input) {
  const files = Array.isArray(input.files) ? input.files : []
  const reviewMode = input.reviewMode === 'full' ? 'full' : 'changes'
  const contextHint = input.contextHint ?? ''

  const { codeFiles, docFiles, excludedFiles } = classifyFiles(files)

  const roles = []
  const roleReasons = []
  const addRole = (role, reason) => {
    if (!roles.includes(role)) {
      roles.push(role)
      roleReasons.push({ role, reason })
    }
  }

  if (codeFiles.length > 0) {
    addRole('ocr-reviewer', `范围包含 ${codeFiles.length} 个代码文件`)
  }

  const dimensions = []
  if (docFiles.length > 0) {
    addRole('document-reviewer', `范围包含 ${docFiles.length} 个文档文件`)

    for (const dimension of detectDesignDimensions(docFiles)) {
      const role = DIMENSION_TO_ROLE[dimension]
      if (role) {
        addRole(role, `ae/design/ 文档涉及 ${dimension} 维度`)
      }
    }

    const designDocs = docFiles.filter(isDesignDoc)
    if (designDocs.length >= 2 && detectDesignDimensions(docFiles).length >= 2) {
      addRole('design-integrity-reviewer', 'ae/design/ 下存在 2+ 维度产物')
    }

    const docCategories = detectDocCategories(docFiles)
    if (docCategories >= 2) {
      addRole('traceability-reviewer', `审查范围包含 ${docCategories} 类项目文档`)
    }
  }

  const hasExplicitGoals = Boolean(input.goals && String(input.goals).trim().length > 0)
  const goals = hasExplicitGoals
    ? String(input.goals).trim()
    : generateGoalsFromContext(contextHint, reviewMode, codeFiles, docFiles)

  addRole(
    'goal-alignment-reviewer',
    hasExplicitGoals ? '用户显式传入审查目标' : '自动从上下文和变更文件推断审查目标',
  )

  const reviewFiles = [...new Set([...codeFiles, ...docFiles])]
  const designDocs = docFiles.filter(isDesignDoc)

  const tasks = roles.map((role) => {
    const filesForRole = selectFilesForRole(role, codeFiles, docFiles, designDocs, reviewFiles)
    return {
      role,
      roleCard: `references/roles/${role}.md`,
      prompt: buildRolePrompt(role, filesForRole, reviewMode, goals),
      files: filesForRole,
    }
  })

  // 非设计文档的维度只能靠内容判断，脚本无法判定，交给执行者补检
  const nonDesignDocs = docFiles.filter((f) => !isDesignDoc(f) && !isPrdDoc(f))
  const manualDimensionCheck = nonDesignDocs.length > 0

  return {
    roles,
    roleReasons,
    tasks,
    reviewFiles,
    excludedFiles,
    goals,
    dimensions: detectDesignDimensions(docFiles),
    extraPrompt: buildExtraPrompt(reviewMode, goals),
    manualDimensionCheck,
    stats: {
      totalFiles: files.length,
      codeFiles: codeFiles.length,
      docFiles: docFiles.length,
      excludedFiles: excludedFiles.length,
      roleCount: roles.length,
    },
  }
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

function main() {
  const argv = process.argv.slice(2)
  let input = {}

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--files') {
      input.files = String(argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean)
      i += 1
    } else if (item === '--mode') {
      input.reviewMode = argv[i + 1]
      i += 1
    } else if (item === '--goals') {
      input.goals = argv[i + 1]
      i += 1
    } else if (item === '--context') {
      input.contextHint = argv[i + 1]
      i += 1
    } else if (item === '--input') {
      try {
        input = { ...input, ...JSON.parse(readFileSync(argv[i + 1], 'utf8')) }
      } catch (error) {
        process.stderr.write(`读取输入文件失败: ${error.message}\n`)
        return 1
      }
      i += 1
    } else if (item === '--help' || item === '-h') {
      process.stdout.write([
        '用法: node scope-analyze.mjs --files <路径逗号分隔> [--mode changes|full] [--goals <目标>] [--context <背景>]',
        '或: node scope-analyze.mjs --input <json 文件>，或通过 stdin 传入 JSON。',
        '',
      ].join('\n'))
      return 0
    }
  }

  if (!input.files || input.files.length === 0) {
    const raw = readStdin()
    if (raw.trim()) {
      try {
        input = { ...input, ...JSON.parse(raw) }
      } catch (error) {
        process.stderr.write(`stdin 不是合法 JSON: ${error.message}\n`)
        return 1
      }
    }
  }

  if (!Array.isArray(input.files) || input.files.length === 0) {
    process.stderr.write('未提供文件列表。用 --files <路径逗号分隔> 或 --input <json>。\n')
    return 1
  }

  const result = analyzeScope(input)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  return 0
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('scope-analyze.mjs')
  : false

if (invokedDirectly) {
  process.exitCode = main()
}
