import type { ToolDefinition } from '@opencode-ai/plugin'

import { TOOL } from '../schemas/ae-asset-schema.js'
import { aeRecoveryTool } from './ae-recovery.tool.js'
import { aeReviewContractTool } from './ae-review-contract.tool.js'
import { aeHandoffTool } from './ae-handoff.tool.js'
import { aeWorktreeHandoffTool } from './ae-worktree-handoff.tool.js'
import { aeCreateSessionTool } from './ae-create-session.tool.js'
import { aeHelpTool } from './ae-help.tool.js'
import { aeReviewProofTool } from './ae-review-proof.tool.js'
import { aeSwaggerParserTool } from './ae-swagger-parser.tool.js'
import { aeHtmlBundleTool } from './ae-html-bundle.tool.js'
import { aeLibreofficeTool } from './ae-libreoffice.tool.js'
import { aeImageTool } from './ae-image.tool.js'
import { aeGraphBuildTool } from './ae-graph-build.tool.js'
import { aeGraphQueryTool } from './ae-graph-query.tool.js'
import { aeTaskAnalyzerTool } from './ae-task-analyzer.tool.js'
import { aeDocExtractTool } from './ae-doc-extract.tool.js'
import { aeDomainCatalogTool } from './ae-domain-catalog.tool.js'
import { aeChromeDevtoolsMcpTool } from './ae-chrome-devtools-mcp.tool.js'
import { aeTimerTool } from './ae-timer.tool.js'
import { aeDomainDispatchPrepareTool } from './ae-domain-dispatch-prepare.tool.js'
import { aeDomainDispatchAggregateTool } from './ae-domain-dispatch-aggregate.tool.js'
import { aeBackgroundExecTool } from './ae-background-exec.tool.js'
import { aeDocxTool } from './ae-docx.tool.js'
import { aePdfTool } from './ae-pdf.tool.js'
import { aePptxTool } from './ae-pptx.tool.js'
import { aePptxFromDesignTool } from './ae-pptx-from-design.tool.js'
import { aeXlsxTool } from './ae-xlsx.tool.js'

export function createToolRegistry(): Record<string, ToolDefinition> {
  return {
    [TOOL.AE_RECOVERY]: aeRecoveryTool,
    [TOOL.AE_REVIEW_CONTRACT]: aeReviewContractTool,
    [TOOL.AE_HANDOFF]: aeHandoffTool,
    [TOOL.AE_WORKTREE_HANDOFF]: aeWorktreeHandoffTool,
    [TOOL.AE_CREATE_SESSION]: aeCreateSessionTool,
    [TOOL.AE_HELP]: aeHelpTool,
    [TOOL.AE_REVIEW_PROOF]: aeReviewProofTool,
    [TOOL.AE_SWAGGER_PARSER]: aeSwaggerParserTool,
    [TOOL.AE_HTML_BUNDLE]: aeHtmlBundleTool,
    [TOOL.AE_LIBREOFFICE]: aeLibreofficeTool,

    [TOOL.AE_IMAGE]: aeImageTool,
    [TOOL.AE_GRAPH_BUILD]: aeGraphBuildTool,
    [TOOL.AE_GRAPH_QUERY]: aeGraphQueryTool,
    [TOOL.AE_TASK_ANALYZER]: aeTaskAnalyzerTool,
    [TOOL.AE_DOC_EXTRACT]: aeDocExtractTool,
    [TOOL.AE_DOMAIN_CATALOG]: aeDomainCatalogTool,
    [TOOL.AE_CHROME_DEVTOOLS_MCP]: aeChromeDevtoolsMcpTool,
    [TOOL.AE_TIMER]: aeTimerTool,
    [TOOL.AE_DOMAIN_DISPATCH_PREPARE]: aeDomainDispatchPrepareTool,
    [TOOL.AE_DOMAIN_DISPATCH_AGGREGATE]: aeDomainDispatchAggregateTool,
    [TOOL.AE_BACKGROUND_EXEC]: aeBackgroundExecTool,
    [TOOL.AE_DOCX]: aeDocxTool,
    [TOOL.AE_PDF]: aePdfTool,
    [TOOL.AE_PPTX]: aePptxTool,
    [TOOL.AE_PPTX_FROM_DESIGN]: aePptxFromDesignTool,
    [TOOL.AE_XLSX]: aeXlsxTool,
  }
}
