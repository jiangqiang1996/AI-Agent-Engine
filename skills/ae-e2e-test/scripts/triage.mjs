#!/usr/bin/env node
/**
 * 测试失败根因分诊器（零依赖）
 *
 * 按 5 条规则的固定顺序短路匹配，输出根因分类与分派目标。
 * 规则 1/2/4/5 为确定性判断；规则 3（真源对齐）需要语义推理，
 * 脚本只输出"需要人工/代理诊断"的上下文，由执行者继续判断。
 *
 * 用法：
 *   node scripts/triage.mjs --input failures.json
 *   cat failures.json | node scripts/triage.mjs
 *   node scripts/triage.mjs --json '[{...}]' --total 42
 *
 * 输入（JSON 数组或对象）：
 * {
 *   "failures": [
 *     { "testLayer": "unit|api|e2e",
 *       "failureType": "assertion|timeout|selector|http|env|runtime",
 *       "testName": "...",
 *       "stackTrace": "...",
 *       "expected": "...", "actual": "...",
 *       "domSnapshot": "可选", "screenshot": "可选",
 *       "relatedDesignCase": "可选" }
 *   ],
 *   "prdPath": "可选，需求文档路径",
 *   "designCasePath": "可选，设计用例路径",
 *   "gitDiff": "可选，最近变更 diff",
 *   "totalTestCount": "可选，总测试数"
 * }
 *
 * 输出：JSON 到 stdout。
 */

import { readFileSync } from 'node:fs'

const VALID_LAYERS = new Set(['unit', 'api', 'e2e'])
const VALID_FAILURE_TYPES = new Set(['assertion', 'timeout', 'selector', 'http', 'env', 'runtime'])

function validateFailures(failures) {
  const problems = []
  failures.forEach((failure, index) => {
    if (!failure || typeof failure !== 'object') {
      problems.push(`failures[${index}] 不是对象`)
      return
    }
    if (!VALID_LAYERS.has(failure.testLayer)) {
      problems.push(`failures[${index}].testLayer 非法: ${failure.testLayer}`)
    }
    if (!VALID_FAILURE_TYPES.has(failure.failureType)) {
      problems.push(`failures[${index}].failureType 非法: ${failure.failureType}`)
    }
    for (const field of ['testName', 'stackTrace', 'expected', 'actual']) {
      if (typeof failure[field] !== 'string') {
        problems.push(`failures[${index}].${field} 必须是字符串`)
      }
    }
  })
  return problems
}

function classifyDomain(failure) {
  if (failure.testLayer === 'e2e' || failure.failureType === 'selector') {
    return 'frontend'
  }
  if (failure.failureType === 'http' || failure.testLayer === 'api') {
    return 'backend'
  }
  if (failure.domSnapshot !== undefined || failure.screenshot !== undefined) {
    return 'frontend'
  }
  return 'backend'
}

export function triage(input) {
  const failures = Array.isArray(input) ? input : input.failures
  if (!Array.isArray(failures) || failures.length === 0) {
    throw new Error('failures 必须是非空数组')
  }

  const problems = validateFailures(failures)
  if (problems.length > 0) {
    throw new Error(`输入校验失败:\n  ${problems.join('\n  ')}`)
  }

  const allStackTraces = failures.map((f) => f.stackTrace).join('\n---\n')

  // 规则 1：测试代码自身存在明显错误
  const hasSyntaxError = /SyntaxError|TypeError.*not.*defined|ReferenceError|mock.*config/i.test(allStackTraces)
  if (hasSyntaxError) {
    const specificError = allStackTraces.match(
      /SyntaxError[^\n]*|ReferenceError[^\n]*|TypeError[^\n]*|mock.*config[^\n]*/i,
    )?.[0]
    return {
      rootCause: 'test',
      domain: null,
      dispatchTarget: 'self-fix',
      summary: `测试代码自身存在错误：${specificError ?? '语法/引用/mock 配置错误'}`,
      evidence: `在 stack trace 中检测到测试代码自身错误信号。Stack: ${allStackTraces.slice(0, 500)}`,
      rule: 1,
    }
  }

  // 规则 2：全部测试失败 → 环境问题
  const totalTestCount = input.totalTestCount
  if (typeof totalTestCount === 'number' && totalTestCount > 1 && failures.length >= totalTestCount) {
    return {
      rootCause: 'env',
      domain: null,
      dispatchTarget: 'manual',
      summary: '全部测试失败，疑似环境问题',
      evidence: `${failures.length}/${totalTestCount} 个测试全部失败，通常指向环境配置或依赖问题而非代码缺陷`,
      rule: 2,
    }
  }

  // 规则 4：无真源 → 需人工确认
  const hasPrd = Boolean(input.prdPath && String(input.prdPath).length > 0)
  const hasDesign = Boolean(input.designCasePath && String(input.designCasePath).length > 0)
  if (!hasPrd && !hasDesign) {
    return {
      rootCause: 'production',
      domain: null,
      dispatchTarget: 'manual',
      summary: '需求和设计均不清晰，无法判定根因，请确认测试期望',
      evidence: '未提供 PRD 路径和设计用例路径，无法进行真源对齐判断',
      rule: 4,
    }
  }

  // 规则 3：有真源 → 需要语义对齐判断
  const isFrontend = classifyDomain(failures[0]) === 'frontend'
  return {
    needsAgentDiagnosis: true,
    rule: 3,
    reason: '有真源（需求文档或设计用例）可用，需要语义对齐判断',
    prdPath: input.prdPath ?? null,
    designCasePath: input.designCasePath ?? null,
    gitDiff: input.gitDiff ?? null,
    failures: failures.map((f) => ({
      testName: f.testName,
      expected: f.expected,
      actual: f.actual,
      failureType: f.failureType,
      testLayer: f.testLayer,
      relatedDesignCase: f.relatedDesignCase ?? null,
    })),
    fallbackDomain: isFrontend ? 'frontend' : 'backend',
    instructions: [
      '请读取真源文件（需求文档 / 设计用例），对比断言期望值与产品实际行为是否与真源一致：',
      '- 断言正确、产品行为偏离真源 → 修复产品代码（production bug）',
      '- 产品行为符合真源、断言写错 → 修复测试（test bug）',
      '- 真源本身与当前需求不符 → 回到设计阶段修正（design-drift）',
      '判断完成后，请按本技能的输出格式给出根因与分派目标。',
    ].join('\n'),
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
  const options = {}

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    const next = () => {
      const value = argv[i + 1]
      i += 1
      return value
    }
    if (item === '--input') {
      try {
        Object.assign(options, JSON.parse(readFileSync(next(), 'utf8')))
      } catch (error) {
        process.stderr.write(`读取输入文件失败: ${error.message}\n`)
        return 1
      }
    } else if (item === '--json') {
      try {
        options.failures = JSON.parse(next())
      } catch (error) {
        process.stderr.write(`--json 不是合法 JSON: ${error.message}\n`)
        return 1
      }
    } else if (item === '--total') {
      options.totalTestCount = Number(next())
    } else if (item === '--prd') {
      options.prdPath = next()
    } else if (item === '--design-case') {
      options.designCasePath = next()
    } else if (item === '--help' || item === '-h') {
      process.stdout.write([
        '用法: node triage.mjs --input <json 文件> [--total <总测试数>] [--prd <需求路径>] [--design-case <设计用例路径>]',
        '或: cat failures.json | node triage.mjs',
        '',
      ].join('\n'))
      return 0
    }
  }

  if (!options.failures) {
    const raw = readStdin()
    if (raw.trim()) {
      try {
        Object.assign(options, JSON.parse(raw))
      } catch (error) {
        process.stderr.write(`stdin 不是合法 JSON: ${error.message}\n`)
        return 1
      }
    }
  }

  try {
    const result = triage(options)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`分诊失败: ${error?.message ?? error}\n`)
    return 1
  }
}

const invokedDirectly = process.argv[1]
  ? process.argv[1].endsWith('triage.mjs')
  : false

if (invokedDirectly) {
  process.exitCode = main()
}
