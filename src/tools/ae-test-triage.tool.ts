import { tool } from '@opencode-ai/plugin/tool'
import { z } from 'zod'

import {
  TestFailureBundleSchema,
  TestTriageResultSchema,
  type TestFailureBundle,
} from '../schemas/test-failure-bundle-schema.js'

export const aeTestTriageTool = tool({
  description: [
    '诊断测试失败根因并分派修复方向。',
    '',
    '功能说明：',
    '- 接收 TestFailureBundle 数组和上下文（PRD 路径、设计用例路径、git diff）',
    '- 工具执行确定性规则（规则 1/2/4/5），规则 3 真源对齐判断委托给 test-triage 代理',
    '- 输出 rootCause、domain、dispatchTarget、summary、evidence',
    '- summary 必须展示给用户，保证可解释性',
    '',
    '诊断规则（按顺序短路匹配）：',
    '1. 测试代码自身有明显错误 → self-fix（工具确定性判断）',
    '2. 全部测试失败 → manual（环境问题，工具确定性判断）',
    '3. 有真源时对齐判断：断言对+产品错→修复产品；产品对+断言错→self-fix；两者都不符→design-update',
    '   规则 3 需要语义推理，工具返回 needs_agent_diagnosis 标记，调用方应委托 test-triage 代理执行',
    '4. 无真源 → manual（工具确定性判断）',
    '5. 兜底 → 默认判定为产品代码问题（工具确定性判断）',
    '',
    '适用场景：',
    '- 测试技能执行后检测到失败，需要诊断根因',
    '- 用户要求分析测试失败原因',
    '',
    '不适用场景：',
    '- 直接修复代码（由修复技能处理）',
    '- 代码审查（使用 ae:review）',
  ].join('\n'),
  args: {
    failures: z.array(TestFailureBundleSchema).min(1).describe('测试失败包数组'),
    prdPath: z.string().optional().describe('PRD 文档路径'),
    designCasePath: z.string().optional().describe('设计用例路径'),
    gitDiff: z.string().optional().describe('最近变更 diff'),
    totalTestCount: z.number().optional().describe('总测试数，用于判断是否全部失败'),
  },
  execute: async (args, ctx) => {
    ctx.metadata({ title: '诊断测试失败根因...', metadata: { failureCount: args.failures.length } })

    const failures: TestFailureBundle[] = args.failures

    const allStackTraces = failures.map((f) => f.stackTrace).join('\n---\n')
    const allExpected = failures.map((f) => f.expected).join('; ')
    const allActual = failures.map((f) => f.actual).join('; ')

    const hasSyntaxError = /SyntaxError|TypeError.*not.*defined|ReferenceError|mock.*config/i.test(
      allStackTraces,
    )
    if (hasSyntaxError) {
      const specificError = allStackTraces.match(
        /SyntaxError[^\n]*|ReferenceError[^\n]*|TypeError[^\n]*|mock.*config[^\n]*/i,
      )?.[0]
      const result = {
        rootCause: 'test' as const,
        domain: null,
        dispatchTarget: 'self-fix' as const,
        summary: `测试代码自身存在错误：${specificError ?? '语法/引用/mock 配置错误'}`,
        evidence: `在 stack trace 中检测到测试代码自身错误信号。Stack: ${allStackTraces.slice(0, 500)}`,
      }
      return { output: JSON.stringify(TestTriageResultSchema.parse(result), null, 2) }
    }

    if (args.totalTestCount !== undefined && failures.length >= args.totalTestCount && args.totalTestCount > 1) {
      const result = {
        rootCause: 'env' as const,
        domain: null,
        dispatchTarget: 'manual' as const,
        summary: '全部测试失败，疑似环境问题',
        evidence: `${failures.length}/${args.totalTestCount} 个测试全部失败，通常指向环境配置或依赖问题而非代码缺陷`,
      }
      return { output: JSON.stringify(TestTriageResultSchema.parse(result), null, 2) }
    }

    const hasPrd = args.prdPath !== undefined && args.prdPath.length > 0
    const hasDesign = args.designCasePath !== undefined && args.designCasePath.length > 0

    if (!hasPrd && !hasDesign) {
      const result = {
        rootCause: 'production' as const,
        domain: null,
        dispatchTarget: 'manual' as const,
        summary: '需求和设计均不清晰，无法判定根因，请确认测试期望',
        evidence: '未提供 PRD 路径和设计用例路径，无法进行真源对齐判断',
      } as const
      return { output: JSON.stringify(TestTriageResultSchema.parse(result), null, 2) }
    }

    const isFrontend = classifyDomain(failures[0]) === 'frontend'
    const triageContext = {
      needs_agent_diagnosis: true,
      rule: 3,
      reason: '有真源（PRD 或设计用例）可用，需要语义对齐判断',
      prdPath: args.prdPath,
      designCasePath: args.designCasePath,
      gitDiff: args.gitDiff,
      failures: failures.map((f) => ({
        testName: f.testName,
        expected: f.expected,
        actual: f.actual,
        failureType: f.failureType,
        testLayer: f.testLayer,
        relatedDesignCase: f.relatedDesignCase,
      })),
      fallbackDomain: isFrontend ? 'frontend' : 'backend',
      instructions: '请调度 @test-triage 代理读取真源文件，对比断言期望值和产品实际行为与真源规格，判断属于 production bug / test bug / design-drift',
    }
    return {
      output: JSON.stringify(triageContext, null, 2),
      metadata: { needsAgentDiagnosis: true },
    }
  },
})

function classifyDomain(failure: TestFailureBundle): 'frontend' | 'backend' {
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
