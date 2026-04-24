import type { Ctx } from '../../services/orchestrator/types.js'
import type { TaskLoopInput, TaskLoopState } from '../task-loop.types.js'

type TL_Ctx = Ctx<TaskLoopInput, TaskLoopState>

export function scanProjectMessage(ctx: TL_Ctx): string {
  return [
    '## 任务：扫描项目状态',
    '',
    '扫描项目文件结构和代码，判断以下目标相关实现是否存在：',
    `**目标**：${ctx.state.goal}`,
    '',
    '## 输出要求',
    '返回 JSON 格式（不要用 markdown 代码块包裹）：',
    '{ "hasImplementation": true/false, "summary": "实现概况描述" }',
  ].join('\n')
}

export function analyzeQuestionsMessage(ctx: TL_Ctx): string {
  return [
    '## 任务：预分析提问',
    '',
    '分析以下目标的歧义和不确定性，输出需要向用户确认的问题列表：',
    `**目标**：${ctx.state.goal}`,
    '',
    '请识别：',
    '1. 目标中模糊的部分',
    '2. 实现路径上的关键决策点',
    '3. 偏好类问题（可附带建议默认值）',
    '4. 格式类问题（可附带建议默认值）',
    '',
    '## 输出要求',
    '返回 JSON 格式（不要用 markdown 代码块包裹）：',
    '{ "questions": [{ "id": "Q1", "question": "问题文本", "type": "text/choice/confirm", "defaultValue": "建议默认值(可选)" }] }',
  ].join('\n')
}

export function collectAnswersMessage(ctx: TL_Ctx): string {
  const questions = ctx.state.questionsAndAnswers
    .filter((q) => !q.answer)
    .map((q) => `- [${q.id}] ${q.question}`)
    .join('\n')
  return [
    '## 任务：收集用户回答',
    '',
    '请使用 question 工具逐条向用户确认以下问题：',
    '',
    questions,
    '',
    '## 输出要求',
    '收集完所有回答后，返回 JSON 格式（不要用 markdown 代码块包裹）：',
    '{ "answers": [{ "id": "Q1", "answer": "用户回答" }] }',
  ].join('\n')
}

export function deriveConditionsMessage(ctx: TL_Ctx): string {
  const answers = ctx.state.questionsAndAnswers
    .map((q) => `- [${q.id}] ${q.question} → ${q.answer}`)
    .join('\n')
  return [
    '## 任务：推导成功条件',
    '',
    '根据以下目标和用户回答，推导 3-8 条可验证的成功条件：',
    `**目标**：${ctx.state.goal}`,
    '',
    '## 用户回答',
    answers,
    '',
    `## 当前项目状态`,
    ctx.state.hasImplementation ? `已有实现：${ctx.state.implementationSummary}` : '无相关实现',
    '',
    '## 输出要求',
    '返回 JSON 格式（不要用 markdown 代码块包裹）：',
    '{ "conditions": [{ "id": "COND-001", "description": "条件描述" }] }',
  ].join('\n')
}

export function verifyMessage(ctx: TL_Ctx): string {
  const conditions = ctx.state.successConditions
    .map((c) => `- [${c.id}] ${c.description}`)
    .join('\n')
  return [
    '## 任务：验证成功条件',
    '',
    '逐条对照以下成功条件，检查当前项目状态：',
    '',
    conditions,
    '',
    '## 禁言令',
    'YOU MUST NOT USE THE question TOOL OR ASK THE USER ANY QUESTIONS.',
    '',
    '## 输出要求',
    '返回 JSON 格式（不要用 markdown 代码块包裹）：',
    '{ "results": [{ "conditionId": "COND-001", "passed": true/false, "evidence": "通过或不通过的证据" }], "unrecoverable": false }',
    '',
    '如果遇到不可恢复的错误（如磁盘满、权限不足等），设置 unrecoverable: true。',
  ].join('\n')
}

export function firstExecutionMessage(ctx: TL_Ctx): string {
  const skillSection = ctx.state.executionSkill
    ? `\n## 执行技能\n请参考技能 ${ctx.state.executionSkill} 的流程执行。`
    : ''
  return [
    '## 任务：首次执行',
    '',
    '根据以下目标，从零开始实现：',
    `**目标**：${ctx.state.goal}`,
    '',
    '## 成功条件',
    ...ctx.state.successConditions.map((c) => `- [${c.id}] ${c.description}`),
    '',
    '## 禁言令',
    'YOU MUST NOT USE THE question TOOL OR ASK THE USER ANY QUESTIONS.',
    '遇到歧义时自行分析选最优解。',
    skillSection,
  ].join('\n')
}

export function executeMessage(ctx: TL_Ctx): string {
  const mode = ctx.state.executionMode === 'REBUILD' ? '较大范围重做相关实现' : '定向修复问题清单中的问题'
  const problems = ctx.state.problemList.length > 0
    ? `\n## 问题清单\n${ctx.state.problemList.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
    : ''
  const skillSection = ctx.state.executionSkill
    ? `\n## 执行技能\n请参考技能 ${ctx.state.executionSkill} 的流程执行。`
    : ''
  return [
    '## 任务：执行修复',
    '',
    `**执行模式**：${mode}`,
    `**目标**：${ctx.state.goal}`,
    '',
    '## 成功条件',
    ...ctx.state.successConditions.map((c) => `- [${c.id}] ${c.description}`),
    '',
    '## 上一轮验证结果',
    ...ctx.state.lastVerificationResults.map((r) =>
      `- [${r.conditionId}] ${r.passed ? '✅ 通过' : '❌ 未通过'}: ${r.evidence}`,
    ),
    problems,
    '',
    '## 禁言令',
    'YOU MUST NOT USE THE question TOOL OR ASK THE USER ANY QUESTIONS.',
    '遇到歧义时自行分析选最优解。',
    skillSection,
  ].join('\n')
}
