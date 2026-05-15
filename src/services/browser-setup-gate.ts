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

const BROWSER_SETUP_MARKERS = [SKILL.SETUP, `/${COMMAND.SETUP}`]

const BROWSER_SETUP_GATE_PROMPT = [
  `必须先调用 ${TOOL.AE_SETUP_PROOF} action=check 检查当前工作区的 ae:setup 证明；`,
  '若未完成，先执行 ae:setup / /ae-setup，得到环境就绪结果并写入证明后再执行浏览器流程。',
  'agent-browser 已安装或用户声称已安装都不能替代 setup proof 校验。',
].join('')

const FIRST_REFERENCE_RE = /^([@/][\w:-]+)\s*/

export function ensureBrowserSetupGate(prompt: string): string {
  const hasBrowserTrigger = BROWSER_TRIGGER_PATTERNS.some((p) => prompt.includes(p))
  if (!hasBrowserTrigger) {
    return prompt
  }

  const hasSetupMarker = BROWSER_SETUP_MARKERS.some((m) => prompt.includes(m))
  if (hasSetupMarker) {
    return prompt
  }

  const firstRefMatch = prompt.match(FIRST_REFERENCE_RE)
  if (firstRefMatch) {
    const firstRef = firstRefMatch[1]
    const afterFirstRef = prompt.slice(firstRef.length).replace(/^\s+/, '')
    return `${firstRef}\n\n${BROWSER_SETUP_GATE_PROMPT}\n\n${afterFirstRef}`
  }

  return `${BROWSER_SETUP_GATE_PROMPT}\n\n${prompt}`
}
