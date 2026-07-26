/**
 * 开发专精代理选择脚本
 *
 * 为 ae:work 预计算开发专精代理列表、协调策略和 prompt 模板。
 *
 * 用法：
 *   node specialist-select.mjs --intent="任务意图" [--has_ui] [--has_api] ...
 *   echo '{"intent":"...","has_ui":true}' | node specialist-select.mjs
 *
 * 输出：JSON 到 stdout，包含 domain、strategy、tasks、specialistCount
 */

// ── 静态数据：开发专精代理目录 ──

const DEVELOPMENT_SPECIALISTS = [
  {
    name: 'frontend-dev',
    capabilities: ['UI 组件', '样式', '交互逻辑', '响应式设计', '前端', '页面', '表单', '组件', '视图', 'html', 'css'],
    selectionCriteria: '任务涉及前端/UI/组件/样式时选中',
    inputContract: '任务描述和前端上下文',
    outputContract: '前端实现和样式代码',
  },
  {
    name: 'backend-dev',
    capabilities: ['API', '数据层', '业务逻辑', '中间件', '接口', '服务层', '逻辑', 'controller', 'service'],
    selectionCriteria: '任务涉及 API/数据库/服务/后端时选中',
    inputContract: '任务描述和后端上下文',
    outputContract: '后端实现和接口代码',
  },
  {
    name: 'backend-fix',
    capabilities: ['错误分析', '根因定位', '修复实现', '回归验证', '问题', '报错', '异常', '崩溃', '排查', '修复', 'bug'],
    selectionCriteria: '任务涉及调试/修复/Bug 时选中',
    inputContract: '任务描述和错误上下文',
    outputContract: '修复代码和验证结果',
  },
]

const SPECIALIST_PROMPT_TEMPLATES = {
  'frontend-dev': '你是一位前端开发专精代理。处理 UI 组件、样式、交互逻辑和响应式设计。',
  'backend-dev': '你是一位后端开发专精代理。处理 API、数据层、业务逻辑和中间件。',
  'backend-fix': '你是一位后端修复专精代理。处理错误分析、根因定位、修复实现和回归验证。',
}

const DOMAIN_COORDINATION = {
  development: { strategy: 'parallel-then-sequential', aggregation: 'merge' },
}

// ── 核心逻辑 ──

function getSpecialistPrompt(specialistName) {
  return SPECIALIST_PROMPT_TEMPLATES[specialistName] ?? `你是一位专精代理: ${specialistName}。`
}

function getCoordinationStrategy(domain) {
  return DOMAIN_COORDINATION[domain] ?? { strategy: 'parallel', aggregation: 'merge' }
}

function isAlwaysOn(specialist, domain, domainContext) {
  if (domain === 'development' && domainContext.defaultToAll === true) {
    return true
  }
  return false
}

function matchesCriteria(specialist, taskIntent, domainContext, domain) {
  const intentLower = taskIntent.intent.toLowerCase()
  const constraintsLower = (taskIntent.constraints ?? []).map((c) => c.toLowerCase())
  const contextText = Object.values(domainContext)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'string')
    .map((value) => value.toLowerCase())
  const allText = [intentLower, ...constraintsLower, (taskIntent.rawInput ?? '').toLowerCase(), ...contextText].join(' ')

  const criteriaLower = specialist.selectionCriteria.toLowerCase()
  const capabilityTerms = specialist.capabilities.map((c) => c.toLowerCase())

  for (const term of capabilityTerms) {
    if (allText.includes(term)) return true
  }

  if (criteriaLower.includes('安全') && allText.includes('安全')) return true
  if (criteriaLower.includes('api') && allText.includes('api')) return true
  if (criteriaLower.includes('性能') && allText.includes('性能')) return true
  if (criteriaLower.includes('架构') && allText.includes('架构')) return true
  if (criteriaLower.includes('ui') && (allText.includes('ui') || allText.includes('界面'))) return true
  if (criteriaLower.includes('迁移') && allText.includes('迁移')) return true
  if (specialist.name === 'frontend-dev' && domainContext.hasUi === true) return true
  if (specialist.name === 'backend-dev' && (domainContext.hasApi === true || domainContext.hasDatabase === true)) {
    return true
  }

  return false
}

function selectSpecialists(domain, taskIntent, domainContext = {}) {
  const catalog = { domain: 'development', specialists: DEVELOPMENT_SPECIALISTS }
  if (catalog.domain !== domain) return []

  const selected = []

  for (const specialist of catalog.specialists) {
    if (isAlwaysOn(specialist, domain, domainContext)) {
      selected.push(specialist)
      continue
    }

    if (matchesCriteria(specialist, taskIntent, domainContext, domain)) {
      selected.push(specialist)
    }
  }

  // 兜底：development 域未选中任何专精时选中 backend-fix
  if (domain === 'development' && selected.length === 0) {
    const backendFix = catalog.specialists.find((s) => s.name === 'backend-fix')
    if (backendFix) {
      selected.push({ ...backendFix, selectionCriteria: `${backendFix.selectionCriteria}（兜底选中）` })
    }
  }

  return selected
}

// ── 参数解析 ──

function parseArgs() {
  const argvArgs = process.argv.slice(2)

  // 有 argv 参数时优先从 argv 解析
  if (argvArgs.length > 0) {
    const params = { constraints: [] }

    for (const arg of argvArgs) {
      if (arg.startsWith('--intent=')) {
        params.intent = arg.slice(9)
      } else if (arg.startsWith('--constraints=')) {
        params.constraints = arg.slice(14).split(',').map((s) => s.trim()).filter(Boolean)
      } else if (arg.startsWith('--changed_lines=')) {
        params.changed_lines = parseInt(arg.slice(16), 10)
      } else if (arg.startsWith('--requirement_count=')) {
        params.requirement_count = parseInt(arg.slice(20), 10)
      } else if (arg.startsWith('--')) {
        const key = arg.slice(2)
        params[key] = true
      }
    }

    if (!params.intent) {
      console.error('用法: node specialist-select.mjs --intent="任务意图" [--has_ui] [--has_api] ...')
      console.error('  或: echo \'{"intent":"...","has_ui":true}\' | node specialist-select.mjs')
      process.exit(1)
    }

    run(params)
    return
  }

  // 无 argv 参数时从 stdin 读取 JSON
  const chunks = []
  process.stdin.resume()
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => chunks.push(chunk))
  process.stdin.on('end', () => {
    const raw = chunks.join('').trim()
    if (!raw) {
      console.error('用法: node specialist-select.mjs --intent="任务意图" [--has_ui] [--has_api] ...')
      console.error('  或: echo \'{"intent":"...","has_ui":true}\' | node specialist-select.mjs')
      process.exit(1)
    }
    try {
      const json = JSON.parse(raw)
      if (!json.intent) {
        console.error('用法: node specialist-select.mjs --intent="任务意图" [--has_ui] [--has_api] ...')
        console.error('  或: echo \'{"intent":"...","has_ui":true}\' | node specialist-select.mjs')
        process.exit(1)
      }
      run(json)
    } catch {
      console.error('stdin JSON 解析失败')
      process.exit(1)
    }
  })
}

// ── 主逻辑 ──

function run(args) {
  try {
    const taskIntent = {
      stage: 'entry',
      intent: args.intent,
      domain: 'development',
      constraints: args.constraints ?? [],
      rawInput: args.intent,
      timestamp: new Date().toISOString(),
    }

    const domainContext = {
      domain: 'development',
      defaultToAll: args.default_to_all ?? args.defaultToAll ?? false,
      hasSecurity: args.has_security ?? false,
      hasApi: args.has_api ?? false,
      hasPerformance: args.has_performance ?? false,
      hasReliability: args.has_reliability ?? false,
      hasCli: args.has_cli ?? false,
      hasTooling: args.has_tooling ?? false,
      hasAgentConfig: args.has_agent_config ?? false,
      hasTypescript: args.has_typescript ?? false,
      hasMigrations: args.has_migrations ?? false,
      hasConfig: args.has_config ?? false,
      hasInfra: args.has_infra ?? false,
      hasDatabase: args.has_database ?? false,
      hasScript: args.has_script ?? false,
      hasUi: args.has_ui ?? false,
      changedLineCount: args.changed_lines,
      requirementCount: args.requirement_count,
    }

    const specialists = selectSpecialists('development', taskIntent, domainContext)
    const strategy = getCoordinationStrategy('development')

    if (specialists.length === 0) {
      console.log(JSON.stringify({
        domain: 'development',
        strategy,
        tasks: [],
        specialistCount: 0,
        errorHint: '未选中任何开发专精代理。请检查 intent 和布尔标记参数是否正确。',
      }, null, 2))
      return
    }

    const tasks = specialists.map((s) => ({
      agent: s.name,
      prompt: getSpecialistPrompt(s.name),
      capabilities: s.capabilities,
      selectionCriteria: s.selectionCriteria,
    }))

    console.log(JSON.stringify({
      domain: 'development',
      strategy,
      tasks,
      specialistCount: specialists.length,
    }, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(JSON.stringify({
      domain: 'development',
      strategy: null,
      tasks: [],
      specialistCount: 0,
      error: message,
    }, null, 2))
  }
}

parseArgs()
