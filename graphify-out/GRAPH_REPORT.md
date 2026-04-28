# Graph Report - .  (2026-04-28)

## Corpus Check
- 127 files · ~59,639 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 389 nodes · 556 edges · 24 communities detected
- Extraction: 89% EXTRACTED · 11% INFERRED · 0% AMBIGUOUS · INFERRED: 62 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Tool Review Services|Tool Review Services]]
- [[_COMMUNITY_Catalog Registration|Catalog Registration]]
- [[_COMMUNITY_Planning Review Flow|Planning Review Flow]]
- [[_COMMUNITY_Gate Proof Service|Gate Proof Service]]
- [[_COMMUNITY_Review Persona Set|Review Persona Set]]
- [[_COMMUNITY_Execution Guardrails|Execution Guardrails]]
- [[_COMMUNITY_Session Handoff|Session Handoff]]
- [[_COMMUNITY_Runtime Asset Loading|Runtime Asset Loading]]
- [[_COMMUNITY_Project Usage Docs|Project Usage Docs]]
- [[_COMMUNITY_Recovery Metadata|Recovery Metadata]]
- [[_COMMUNITY_Research And MCP|Research And MCP]]
- [[_COMMUNITY_Work Task Loop|Work Task Loop]]
- [[_COMMUNITY_Research Security Flow|Research Security Flow]]
- [[_COMMUNITY_Browser Testing Setup|Browser Testing Setup]]
- [[_COMMUNITY_Frontend Design Sync|Frontend Design Sync]]
- [[_COMMUNITY_SQL Runtime Access|SQL Runtime Access]]
- [[_COMMUNITY_Brainstorm Documents|Brainstorm Documents]]
- [[_COMMUNITY_Testing Reviewers|Testing Reviewers]]
- [[_COMMUNITY_Update Workflow|Update Workflow]]
- [[_COMMUNITY_Postbuild Wrapper|Postbuild Wrapper]]
- [[_COMMUNITY_Agent Alias Map|Agent Alias Map]]
- [[_COMMUNITY_Prompt Optimization|Prompt Optimization]]
- [[_COMMUNITY_Rule Saving|Rule Saving]]
- [[_COMMUNITY_Vitest Config|Vitest Config]]

## God Nodes (most connected - your core abstractions)
1. `runGateSync()` - 16 edges
2. `resolveRecovery()` - 10 edges
3. `ae:review Skill` - 9 edges
4. `ae:plan Skill` - 8 edges
5. `buildCommandConfig()` - 7 edges
6. `buildHelpCatalog()` - 7 edges
7. `getPhaseOneEntries()` - 6 edges
8. `getAllAgentDefinitions()` - 6 edges
9. `createTuiCommands()` - 6 edges
10. `toRepoRelativePath()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `mergeCommandConfig()` --calls--> `buildCommandConfig()`  [INFERRED]
  src\index.ts → src\services\command-registration.ts
- `createRuntimeAssetManifestFromRoot()` --calls--> `getAllAgentDefinitions()`  [INFERRED]
  src\services\runtime-asset-manifest.ts → src\services\ae-catalog.ts
- `getRepoRoot()` --calls--> `resolveRepoRootFromModuleUrl()`  [INFERRED]
  src\services\help-catalog-service.ts → src\utils\path-utils.ts
- `buildHelpCatalog()` --calls--> `createRuntimeAssetManifestFromRoot()`  [INFERRED]
  src\services\help-catalog-service.ts → src\services\runtime-asset-manifest.ts
- `findPlanFileFromHistory()` --calls--> `isInsideRoot()`  [INFERRED]
  src\tools\ae-handoff.tool.ts → src\utils\path-utils.ts

## Hyperedges (group relationships)
- **AE Main Workflow Entries** — usage_main_workflow, usage_manual_stage_sequence, agents_ae_lfg_entry [EXTRACTED 1.00]
- **Research Agent Pair** — repo_research_analyst, web_researcher, repo_research_methodology [INFERRED 0.78]
- **Review Agent Suite Chunk 01** — adversarial_reviewer, correctness_reviewer, maintainability_reviewer, performance_reviewer, reliability_reviewer, product_lens_reviewer [EXTRACTED 1.00]
- **Review Agent Quality Team** — security_reviewer_agent, standards_reviewer_agent, testing_reviewer_agent, test_case_reviewer_agent, step_granularity_reviewer_agent [INFERRED 0.82]
- **Frontend Visual Workflow** — ae_frontend_design_skill, design_iterator_agent, figma_design_sync_agent, ae_frontend_design_visual_verification [EXTRACTED 1.00]
- **Brainstorm Document Pipeline** — ae_brainstorm_skill, requirements_capture_reference, ae_brainstorm_requirement_data_document, ae_brainstorm_handoff_reference, ae_review_document_domain [EXTRACTED 1.00]
- **AE Main Delivery Chain** — ae_lfg_skill, ae_plan_skill, ae_refactor_skill, ae_review_skill, ae_lfg_gate_proof [EXTRACTED 1.00]
- **Ideation Diverge Critique Handoff Chain** — ae_ideate_skill, ae_ideate_divergent_creativity, post_ideation_workflow_adversarial_filter, post_ideation_workflow_brainstorm_handoff [EXTRACTED 1.00]
- **Review Orchestration Chain** — ae_review_skill, scope_detection_git_diff, file_routing_table_reviewers, persona_catalog_review_personas, subagent_template_leaf_reviewers, synthesis_presentation_pipeline, review_output_template_markdown [EXTRACTED 1.00]
- **SQL 执行流水线** — ae_sql_jre_runtime, ae_sql_connection_discovery, ae_sql_driver_management, ae_sql_safety_confirmation, ae_sql_jdbc_cli [EXTRACTED 1.00]
- **浏览器登录测试流水线** — ae_test_browser_agent_browser_cli, ae_test_browser_route_discovery, ae_test_browser_login_detection, login_detection_polling [EXTRACTED 1.00]
- **工作交付质量门禁** — ae_work_testing_discipline, shipping_workflow_review_required, ae_work_gate_requirement, shipping_workflow_delivery_template [EXTRACTED 1.00]

## Communities

### Community 0 - "Tool Review Services"
Cohesion: 0.07
Nodes (3): findPlanFileFromHistory(), matchesEntry(), selectReviewers()

### Community 1 - "Catalog Registration"
Cohesion: 0.12
Nodes (24): buildAgentList(), getAllAgentDefinitions(), getDefaultEntry(), getGildedAgents(), getPhaseOneEntries(), getPhaseOnePaEntries(), getPhaseOnePoEntries(), getRequiredAgents() (+16 more)

### Community 2 - "Planning Review Flow"
Cohesion: 0.07
Nodes (34): Divergent Creativity Frameworks, Repo Elsewhere Software Non Software Classification, Ranked Ideation Artifact, ae:ideate Skill, AE Gate Proof Checkpoints, AE LFG Main Pipeline, ae:lfg Skill, Plan Confidence Check And Deepening (+26 more)

### Community 3 - "Gate Proof Service"
Cohesion: 0.12
Nodes (26): addArtifactBlockers(), addCheckpointBlockers(), addFinalBlockers(), addMissingEvidence(), addNextStep(), buildSummary(), collectChangedFiles(), containsGitWriteOperation() (+18 more)

### Community 4 - "Review Persona Set"
Cohesion: 0.07
Nodes (30): Document Falsification Review, Failure Scenario Construction, adversarial-reviewer, Breaking API Contract Changes, api-contract-reviewer, Architecture Pattern Compliance And Design Integrity, architecture-strategist, Document Internal Consistency (+22 more)

### Community 5 - "Execution Guardrails"
Cohesion: 0.08
Nodes (25): Commit Change Detection, Chinese Conventional Commit Format, AE Commit Command, Sensitive File Commit Filter, Independent New Session, AE Handoff Skill, Structured Handoff Context, AE Help Skill (+17 more)

### Community 6 - "Session Handoff"
Cohesion: 0.14
Nodes (14): ContextInjectError, createSessionWithFallback(), executeHandoff(), generateHandoffTitle(), SessionCreateError, executePromptSubmit(), generateSessionTitle(), PromptSessionCreateError (+6 more)

### Community 7 - "Runtime Asset Loading"
Cohesion: 0.15
Nodes (10): getArtifactDirectory(), listArtifacts(), readMarkdownFiles(), mergeCommandConfig(), loadBuiltinMcpConfig(), mergeBuiltinAndUserMcp(), registerMcp(), resolveRepoRootFromModuleUrl() (+2 more)

### Community 8 - "Project Usage Docs"
Cohesion: 0.11
Nodes (19): CLI Agent Readiness Audit, Agent Operational Parity, agent-native-reviewer, /ae-lfg Default Entry, 24 Required Plus 2 Gilded Agent Layering, AI Agent Engine, AE Custom Tools, opencode Plugin (+11 more)

### Community 9 - "Recovery Metadata"
Cohesion: 0.2
Nodes (12): displayPath(), fallbackSkillForPhase(), fingerprintFromFrontmatter(), invalidResult(), kebabCase(), nextArgumentsForArtifact(), nextCommandForArtifact(), nextSkillForArtifact() (+4 more)

### Community 10 - "Research And MCP"
Cohesion: 0.12
Nodes (18): Version Controlled AE Asset Source Of Truth, Runtime Artifacts, AE Built-in MCP Defaults, context7 MCP, gh_grep MCP, Lowest Priority Built-in MCP Policy, Same-type Field-level Shallow Merge, Different-type MCP Entry Replacement (+10 more)

### Community 11 - "Work Task Loop"
Cohesion: 0.17
Nodes (15): 统一退出判定, Phase 0 准备与交互前置, 迭代任务循环技能, 锁死成功条件, 循环验证修复机制, 内联串行并行执行策略, ae-gate 最终门禁要求, 输入分流与复杂度路由 (+7 more)

### Community 12 - "Research Security Flow"
Cohesion: 0.17
Nodes (12): Research Reviewer Agent, Context7 Documentation Query, Mandatory Deprecation Check, Organization Knowledge Search, Security Reviewer Agent, Attack Path Analysis, Document Threat Model Review, OWASP Top 10 Audit (+4 more)

### Community 13 - "Browser Testing Setup"
Cohesion: 0.2
Nodes (12): agent-browser 外部依赖, 安装后验证, AE 环境安装技能, agent-browser CLI, 失败类型转交策略, 登录检测与等待机制, 测试范围与路由推断, 浏览器测试技能 (+4 more)

### Community 14 - "Frontend Design Sync"
Cohesion: 0.22
Nodes (11): Frontend Design Context Detection, AE Frontend Design Skill, Frontend Visual Verification, Design Iterator Agent, Agent Browser Login Detection, Focused Screenshot Practice, Screenshot Analysis Improvement Loop, Figma Design Sync Agent (+3 more)

### Community 15 - "SQL Runtime Access"
Cohesion: 0.18
Nodes (11): 数据库连接信息获取, JDBC 驱动检查与下载, sql-tool JDBC CLI, JRE 17 运行时, SQL 安全确认规则, AE SQL 技能, Spring Boot 数据源配置解析, 国产数据库驱动手动安装 (+3 more)

### Community 16 - "Brainstorm Documents"
Cohesion: 0.31
Nodes (9): Collaborative Brainstorming Dialogue, Brainstorm Handoff Reference, Requirement Data Document, AE Brainstorm Skill, AE Document Review Skill, AE Review Document Domain, Requirements Capture Reference, Universal Brainstorming Reference (+1 more)

### Community 17 - "Testing Reviewers"
Cohesion: 0.4
Nodes (6): Test Case Reviewer Agent, Test Document Coverage Completeness, Test Executability and Verifiability, Testing Reviewer Agent, Behavioral Test Quality, Weak Assertions and False Confidence

### Community 18 - "Update Workflow"
Cohesion: 0.33
Nodes (6): AE 桥接文件, 先清理再拉取的理由, 清理拉取与重新构建流程, 全局更新模式, 项目级更新模式, AE 插件更新技能

### Community 19 - "Postbuild Wrapper"
Cohesion: 1.0
Nodes (2): main(), writePluginWrapper()

### Community 20 - "Agent Alias Map"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "Prompt Optimization"
Cohesion: 0.67
Nodes (3): Optimized Prompt New Session Execution, Prompt Reference Preservation, ae:prompt-optimize Skill

### Community 22 - "Rule Saving"
Cohesion: 1.0
Nodes (3): Rules Deduplication And History Validation, Project Level Rules Only Constraint, ae:save-rules Skill

### Community 23 - "Vitest Config"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **85 isolated node(s):** `Requirements To Delivery Workflow`, `Runtime Artifacts`, `AE Custom Tools`, `24 Required Plus 2 Gilded Agent Layering`, `Usage Guide` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Vitest Config`** (1 nodes): `vitest.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AE Built-in MCP Defaults` connect `Research And MCP` to `Project Usage Docs`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `Stable Usage Entry Points` connect `Project Usage Docs` to `Research And MCP`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `Evidence First Claims` connect `Execution Guardrails` to `Research Security Flow`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `buildCommandConfig()` (e.g. with `mergeCommandConfig()` and `getPhaseOneEntries()`) actually correct?**
  _`buildCommandConfig()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Requirements To Delivery Workflow`, `Runtime Artifacts`, `AE Custom Tools` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Tool Review Services` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Catalog Registration` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._