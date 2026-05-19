import { SKILL, COMMAND, AGENT, TOOL } from '../schemas/ae-asset-schema.js'

const BROWSER_TRIGGER_PATTERNS = [
  'agent-browser',
  SKILL.TEST_BROWSER,
  `/${COMMAND.TEST_BROWSER}`,
  `@${AGENT.DESIGN_ITERATOR}`,
  `@${AGENT.FIGMA_DESIGN_SYNC}`,
  SKILL.FRONTEND_DESIGN,
  `/${COMMAND.FRONTEND_DESIGN}`,
]

const BROWSER_PROOF_CHECK_RE = new RegExp(`(先|必须|调用|执行).*${TOOL.AE_AGENT_BROWSER_PROOF}\\s+action=check`)
const BROWSER_ENVIRONMENT_FLOW_RE = new RegExp(`(先执行|先运行|完成).*(${SKILL.AGENT_BROWSER}|/${COMMAND.AGENT_BROWSER}).*(后|再)`)
const NEGATED_ENVIRONMENT_GATE_RE = new RegExp(`(不要|无需|不用|不必|不需要).{0,20}(${TOOL.AE_AGENT_BROWSER_PROOF}\\s+action=check|${SKILL.AGENT_BROWSER}|/${COMMAND.AGENT_BROWSER})`)

const BROWSER_ENVIRONMENT_GATE_PROMPT = [
  `必须先调用 ${TOOL.AE_AGENT_BROWSER_PROOF} action=check 检查当前工作区的 agent-browser 环境证明；`,
  `若未完成，先执行 ${SKILL.AGENT_BROWSER} / /${COMMAND.AGENT_BROWSER} 的环境验证流程，得到环境就绪结果并写入证明后再执行浏览器流程。`,
  'agent-browser 已安装或用户声称已安装都不能替代环境证明校验；连接已有浏览器前必须展示候选和风险并由用户确认目标。',
].join('')

const FIRST_REFERENCE_RE = /^([@/][\w:-]+)\s*/

export function ensureBrowserEnvironmentGate(prompt: string): string {
  const hasBrowserTrigger = BROWSER_TRIGGER_PATTERNS.some((p) => prompt.includes(p))
  if (!hasBrowserTrigger) {
    return prompt
  }

  const hasEnvironmentMarker = !NEGATED_ENVIRONMENT_GATE_RE.test(prompt)
    && BROWSER_PROOF_CHECK_RE.test(prompt)
    && BROWSER_ENVIRONMENT_FLOW_RE.test(prompt)
  if (hasEnvironmentMarker) {
    return prompt
  }

  const firstRefMatch = prompt.match(FIRST_REFERENCE_RE)
  if (firstRefMatch) {
    const firstRef = firstRefMatch[1]
    const afterFirstRef = prompt.slice(firstRef.length).replace(/^\s+/, '')
    return `${firstRef}\n\n${BROWSER_ENVIRONMENT_GATE_PROMPT}\n\n${afterFirstRef}`
  }

  return `${BROWSER_ENVIRONMENT_GATE_PROMPT}\n\n${prompt}`
}
