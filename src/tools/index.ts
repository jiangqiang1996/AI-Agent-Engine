import type { ToolDefinition } from '@opencode-ai/plugin/tool'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { aeRecoveryTool } from './ae-recovery.tool.js'
import { aeReviewContractTool } from './ae-review-contract.tool.js'
import { aeHandoffTool } from './ae-handoff.tool.js'
import { aeWorktreeHandoffTool } from './ae-worktree-handoff.tool.js'
import { aeCreateSessionTool } from './ae-create-session.tool.js'
import { aePromptOptimizeTool } from './ae-prompt-optimize.tool.js'
import { aeHelpTool } from './ae-help.tool.js'
import { aeGateTool } from './ae-gate.tool.js'
import { aeReviewProofTool } from './ae-review-proof.tool.js'
import { aeAgentBrowserProofTool } from './ae-agent-browser-proof.tool.js'
import { aeSwaggerParserTool } from './ae-swagger-parser.tool.js'
import { aeHtmlBundleTool } from './ae-html-bundle.tool.js'
import { aeGraphBuildTool } from './ae-graph-build.tool.js'
import { aeGraphQueryTool } from './ae-graph-query.tool.js'
import { aeTaskAnalyzerTool } from './ae-task-analyzer.tool.js'
import { aeDocExtractTool } from './ae-doc-extract.tool.js'

export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    [TOOL.AE_RECOVERY]: aeRecoveryTool,
    [TOOL.AE_REVIEW_CONTRACT]: aeReviewContractTool,
    [TOOL.AE_HANDOFF]: aeHandoffTool,
    [TOOL.AE_WORKTREE_HANDOFF]: aeWorktreeHandoffTool,
    [TOOL.AE_CREATE_SESSION]: aeCreateSessionTool,
    [TOOL.AE_PROMPT_OPTIMIZE]: aePromptOptimizeTool,
    [TOOL.AE_HELP]: aeHelpTool,
    [TOOL.AE_GATE]: aeGateTool,
    [TOOL.AE_REVIEW_PROOF]: aeReviewProofTool,
    [TOOL.AE_AGENT_BROWSER_PROOF]: aeAgentBrowserProofTool,
    [TOOL.AE_SWAGGER_PARSER]: aeSwaggerParserTool,
    [TOOL.AE_HTML_BUNDLE]: aeHtmlBundleTool,
    [TOOL.AE_GRAPH_BUILD]: aeGraphBuildTool,
    [TOOL.AE_GRAPH_QUERY]: aeGraphQueryTool,
    [TOOL.AE_TASK_ANALYZER]: aeTaskAnalyzerTool,
    [TOOL.AE_DOC_EXTRACT]: aeDocExtractTool,
  }
}
