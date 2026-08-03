/**
 * 开发专精代理选择脚本
 *
 * 为 ae:work 预计算开发专精代理名称列表和协调策略。
 * 脚本只返回选中的代理名称，由 ae:work 技能自行根据名称调度。
 *
 * 用法：
 *   node specialist-select.mjs --intent="任务意图" [--has_ui] [--has_api] ...
 *   echo '{"intent":"...","has_ui":true}' | node specialist-select.mjs
 *
 * 输出：JSON 到 stdout，包含 domain、strategy、agents、specialistCount
 */

// ── 开发专精代理名称常量 ──

const AGENT = {
  FRONTEND_DEV: 'frontend-dev',
  BACKEND_DEV: 'backend-dev',
  BACKEND_FIX: 'backend-fix',
  FRONTEND_FIX: 'frontend-fix',
  API_TEST_RUNNER: 'api-test-runner',
  E2E_TEST_RUNNER: 'e2e-test-runner',
  UNIT_TEST_RUNNER: 'unit-test-runner',
}

const FALLBACK_AGENT = 'general'

// ── 选择规则：关键词与布尔标记匹配 ──

const SELECTION_RULES = {
  [AGENT.FRONTEND_DEV]: {
    keywords: ['前端', '组件', '样式', '表单', '视图', 'html', 'css', '界面', '响应式', '交互逻辑', 'api 联调', '状态管理', '组件开发', '前端重构', '性能优化', '可访问性', '认证集成', '数据流', '表单联动', '条件渲染', '懒加载', 'memo', 'bundle 优化', '重构', '视觉实现', '页面设计', '设计还原', 'ui 布局', '视觉代码', '设计稿', '截图', 'figma', '还原', '从零设计', '前端开发', '前端实现'],
    flags: ['hasUi', 'hasPerformance'],
  },
  [AGENT.BACKEND_DEV]: {
    keywords: ['后端', '数据层', '业务逻辑', '中间件', '服务层', 'controller', 'service', '后端开发', '后端实现', 'api 开发', '接口开发'],
    flags: ['hasApi', 'hasDatabase'],
  },
  [AGENT.BACKEND_FIX]: {
    keywords: ['修复', 'bug', '报错', '异常', '崩溃', '排查', '错误分析', '根因', '回归', '接口契约', '数据校验', '调用链', '空指针', '事务', '并发', '序列化'],
    flags: [],
  },
  [AGENT.FRONTEND_FIX]: {
    keywords: ['前端修复', '视觉修复', '交互修复', '样式问题', '布局问题', '无障碍', 'aria', '可访问性', '联调修复', '间距', '状态管理修复', '表单联动修复', '条件渲染修复', '事件绑定', '路由跳转', '认证修复', 'token', '加载态', '错误态', '空态', '焦点管理', '键盘导航'],
    flags: [],
  },
  [AGENT.API_TEST_RUNNER]: {
    keywords: ['接口测试', 'api 测试', '集成测试', '接口边界', '业务流程测试', '接口用例', '接口级测试', 'api 集成', '接口编排'],
    flags: ['hasApiTest'],
  },
  [AGENT.E2E_TEST_RUNNER]: {
    keywords: ['e2e', '端到端测试', '浏览器测试', '验收测试', 'playwright', 'ui 测试', '页面测试', '端到端', 'e2e 测试'],
    flags: ['hasE2e'],
  },
  [AGENT.UNIT_TEST_RUNNER]: {
    keywords: ['单元测试', 'unit test', '覆盖率', 'vitest', 'pytest', 'junit', 'go test', 'rust test', '测试生成', '单测', 'unit-test'],
    flags: ['hasUnitTest'],
  },
}

const DOMAIN_COORDINATION = {
  development: { strategy: 'parallel-then-sequential', aggregation: 'merge' },
}

// ── 核心逻辑 ──

function getCoordinationStrategy(domain) {
  return DOMAIN_COORDINATION[domain] ?? { strategy: 'parallel', aggregation: 'merge' }
}

function matchesCriteria(name, taskIntent, domainContext) {
  const rule = SELECTION_RULES[name]
  if (!rule) return false

  const intentLower = taskIntent.intent.toLowerCase()
  const constraintsLower = (taskIntent.constraints ?? []).map((c) => c.toLowerCase())
  const contextText = Object.values(domainContext)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => typeof value === 'string')
    .map((value) => value.toLowerCase())
  const allText = [intentLower, ...constraintsLower, (taskIntent.rawInput ?? '').toLowerCase(), ...contextText].join(' ')

  for (const term of rule.keywords) {
    if (allText.includes(term.toLowerCase())) return true
  }

  for (const flag of rule.flags) {
    if (domainContext[flag] === true) return true
  }

  return false
}

function selectSpecialists(domain, taskIntent, domainContext = {}) {
  if (domain !== 'development') return []

  const allNames = Object.values(AGENT)
  const selected = []

  for (const name of allNames) {
    if (domainContext.defaultToAll === true) {
      selected.push(name)
      continue
    }
    if (matchesCriteria(name, taskIntent, domainContext)) {
      selected.push(name)
    }
  }

  // 兜底：未选中任何专精时使用 general 代理
  if (selected.length === 0) {
    selected.push(FALLBACK_AGENT)
  }

  return selected
}

// ── 参数解析 ──

function parseArgs() {
  const argvArgs = process.argv.slice(2)

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
      hasApiTest: args.has_api_test ?? false,
      hasE2e: args.has_e2e ?? false,
      hasUnitTest: args.has_unit_test ?? false,
      changedLineCount: args.changed_lines,
      requirementCount: args.requirement_count,
    }

    const agents = selectSpecialists('development', taskIntent, domainContext)
    const strategy = getCoordinationStrategy('development')

    console.log(JSON.stringify({
      domain: 'development',
      strategy,
      agents,
      specialistCount: agents.length,
    }, null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.log(JSON.stringify({
      domain: 'development',
      strategy: null,
      agents: [],
      specialistCount: 0,
      error: message,
    }, null, 2))
  }
}

parseArgs()
