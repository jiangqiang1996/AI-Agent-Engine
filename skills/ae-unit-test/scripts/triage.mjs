#!/usr/bin/env node
/**
 * 测试失败根因分诊器（零依赖）
 *
 * 按固定顺序短路匹配 4 条规则，输出根因分类与分派目标。
 *   规则 1 测试代码自身错误  → 确定性判定
 *   规则 2 全部测试失败      → 确定性判定（疑似环境问题）
 *   规则 4 缺少基准文档      → 确定性判定（交人工确认期望）
 *   规则 3 有基准文档        → 需要语义推理，脚本只输出上下文
 *
 * 判定顺序：1 → 2 → 4 → 3（前三条命中即返回，都不命中才走规则 3）。
 *
 * 用法：
 *   node scripts/triage.mjs --input failures.json
 *   cat failures.json | node scripts/triage.mjs
 *   node scripts/triage.mjs --json '[{...}]' --total 42
 *
 * 输入（JSON 数组或对象；--input / --json / stdin 均可）：
 * {
 *   "failures": [
 *     { "testLayer": "unit|integration|e2e",          // 必填
 *       "failureType": "assertion|timeout|selector|http|env|runtime",  // 必填
 *       "testName": "...",                            // 必填
 *       "stackTrace": "...",                          // 可选，缺省 ""
 *       "expected": "...", "actual": "...",           // 可选，缺省 ""
 *       "domSnapshot": "可选", "screenshot": "可选",
 *       "relatedCase": "可选" }
 *   ],
 *   "requirementPath": "可选，需求规格文档路径",
 *   "caseSpecPath": "可选，测试用例规格路径",
 *   "gitDiff": "可选，最近变更 diff",
 *   "totalTestCount": "可选，总测试数"
 * }
 *
 * 输出：JSON 到 stdout。
 *   根因 rootCause ∈ test | env | unknown（规则 3 由语义判断给出 production | test | spec-drift）
 *   分派 dispatchTarget ∈ self-fix | manual（规则 3 由语义判断给出 production | spec-drift | manual）
 */

import { readFileSync } from 'node:fs'

const VALID_LAYERS = new Set(['unit', 'integration', 'e2e'])
const VALID_FAILURE_TYPES = new Set(['assertion', 'timeout', 'selector', 'http', 'env', 'runtime'])

/** 必填字段：缺失或类型不符即拒绝输入 */
const REQUIRED_FIELDS = ['testLayer', 'failureType', 'testName']
/** 可选字段：缺省补空串（写入报告时统一有值） */
const OPTIONAL_FIELDS = ['stackTrace', 'expected', 'actual']

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
    for (const field of REQUIRED_FIELDS) {
      if (typeof failure[field] !== 'string' || failure[field] === '') {
        problems.push(`failures[${index}].${field} 必须是非空字符串`)
      }
    }
    for (const field of OPTIONAL_FIELDS) {
      if (failure[field] !== undefined && typeof failure[field] !== 'string') {
        problems.push(`failures[${index}].${field} 必须是字符串`)
      }
    }
  })
  return problems
}

/** 归一化：补齐可选字段，保证下游读到的字段类型稳定 */
function normalizeFailure(failure) {
  const normalized = { ...failure }
  for (const field of OPTIONAL_FIELDS) {
    if (typeof normalized[field] !== 'string') {
      normalized[field] = ''
    }
  }
  return normalized
}

function classifyDomain(failure) {
  if (failure.testLayer === 'e2e' || failure.failureType === 'selector') {
    return 'frontend'
  }
  if (failure.failureType === 'http' || failure.testLayer === 'integration') {
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

  const normalizedFailures = failures.map(normalizeFailure)
  const allStackTraces = normalizedFailures.map((f) => f.stackTrace).join('\n---\n')

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

  // 规则 4：无基准文档 → 根因不可判定，需人工确认期望
  const hasRequirement = Boolean(input.requirementPath && String(input.requirementPath).length > 0)
  const hasCaseSpec = Boolean(input.caseSpecPath && String(input.caseSpecPath).length > 0)
  if (!hasRequirement && !hasCaseSpec) {
    return {
      rootCause: 'unknown',
      domain: null,
      dispatchTarget: 'manual',
      summary: '需求规格与用例规格均不清晰，无法判定根因，请确认测试期望',
      evidence: '未提供需求规格路径与用例规格路径，无法进行基准对齐判断',
      rule: 4,
    }
  }

  // 规则 3：有基准文档 → 需要语义对齐判断
  const isFrontend = classifyDomain(normalizedFailures[0]) === 'frontend'
  return {
    needsAgentDiagnosis: true,
    rule: 3,
    reason: '有基准文档（需求规格或用例规格）可用，需要语义对齐判断',
    requirementPath: input.requirementPath ?? null,
    caseSpecPath: input.caseSpecPath ?? null,
    gitDiff: input.gitDiff ?? null,
    failures: normalizedFailures.map((f) => ({
      testName: f.testName,
      expected: f.expected,
      actual: f.actual,
      stackTrace: f.stackTrace,
      failureType: f.failureType,
      testLayer: f.testLayer,
      relatedCase: f.relatedCase ?? null,
    })),
    fallbackDomain: isFrontend ? 'frontend' : 'backend',
    instructions: [
      '请读取基准文档（需求规格 / 用例规格），对比断言期望值与产品实际行为是否与基准一致：',
      '- 断言正确、产品行为偏离基准 → 修复产品代码（production bug）',
      '- 产品行为符合基准、断言写错 → 修复测试（test bug）',
      '- 基准文档本身与当前需求不符 → 修正基准文档（spec-drift）',
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

/** 去掉 UTF-8 BOM：Windows 编辑器写出的 JSON 常带 BOM，JSON.parse 会直接报错。 */
function stripBom(text) {
  return String(text ?? '').charCodeAt(0) === 0xFEFF ? String(text).slice(1) : String(text ?? '')
}

/**
 * 解析输入 JSON。
 * 顶层既可以是失败数组，也可以是含 failures 的对象，两种形态都接受。
 */
function parseInput(raw, label) {
  let parsed
  try {
    parsed = JSON.parse(stripBom(raw))
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON: ${error.message}`)
  }
  if (Array.isArray(parsed)) {
    return { failures: parsed }
  }
  if (parsed && typeof parsed === 'object') {
    return parsed
  }
  throw new Error(`${label} 必须是失败数组或包含 failures 的对象`)
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
        Object.assign(options, parseInput(readFileSync(next(), 'utf8'), '输入文件'))
      } catch (error) {
        process.stderr.write(`读取输入文件失败: ${error.message}\n`)
        return 1
      }
    } else if (item === '--json') {
      try {
        Object.assign(options, parseInput(next(), '--json'))
      } catch (error) {
        process.stderr.write(`${error.message}\n`)
        return 1
      }
    } else if (item === '--total') {
      options.totalTestCount = Number(next())
    } else if (item === '--requirement') {
      options.requirementPath = next()
    } else if (item === '--case-spec') {
      options.caseSpecPath = next()
    } else if (item === '--help' || item === '-h') {
      process.stdout.write([
        '用法: node triage.mjs --input <json 文件> [--total <总测试数>] [--requirement <需求规格路径>] [--case-spec <用例规格路径>]',
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
        Object.assign(options, parseInput(raw, 'stdin'))
      } catch (error) {
        process.stderr.write(`${error.message}\n`)
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
