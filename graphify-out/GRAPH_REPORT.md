# Graph Report - ai-agent-engine  (2026-05-05)

## Corpus Check
- 124 files · ~81,193 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 510 nodes · 1264 edges · 15 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 116 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b8b457b6`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]

## God Nodes (most connected - your core abstractions)
1. `runGateSync()` - 19 edges
2. `runBrowserMode()` - 18 edges
3. `runCollectMode()` - 17 edges
4. `parseSwaggerDocument()` - 17 edges
5. `FigmaAssetError` - 16 edges
6. `runFigmaAssetTool()` - 15 edges
7. `isInsideRoot()` - 15 edges
8. `runApiMode()` - 13 edges
9. `ensureNoSymlink()` - 12 edges
10. `resolveRecovery()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `runGit()` --calls--> `execFileSync()`  [INFERRED]
  src/services/gate-service.ts → tests/services/gate-service.test.ts
- `writeReviewReport()` --calls--> `hashReviewOutput()`  [INFERRED]
  tests/services/gate-service.test.ts → src/services/gate-service.ts
- `writeReviewReport()` --calls--> `hashReviewOutput()`  [INFERRED]
  tests/tools/ae-gate.tool.test.ts → src/services/gate-service.ts
- `runGateSync()` --calls--> `runGate()`  [INFERRED]
  tests/services/gate-service.test.ts → src/services/gate-service.ts
- `parseFixture()` --calls--> `parseSwaggerDocument()`  [INFERRED]
  tests/services/swagger-summary-service.test.ts → src/services/swagger-parser-service.ts

## Communities (26 total, 2 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (45): hasPromptOptimizeVariant(), skillDir(), buildAgentList(), getAllAgentDefinitions(), getDefaultEntry(), getGildedAgents(), getPhaseOneEntries(), getPhaseOnePaEntries() (+37 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (59): classifyFigmaPageState(), hashPrefix(), buildAuthHeaders(), classifyApiError(), classifyAuthMode(), downloadImageBytes(), isAllowedDownloadUrl(), isAllowedTokenEnv() (+51 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (62): addArtifactBlockers(), addCheckpointBlockers(), addFinalBlockers(), addGitAuthorizationBlockers(), addMissingEvidence(), addNextStep(), addReviewEvidenceBlockers(), authorizationCoversOperation() (+54 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (31): filterSwaggerOperations(), asRecordArray(), asString(), isRecord(), openApiServers(), operationSecurity(), operationServers(), parseOpenApiRequestBody() (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (28): formatSwaggerError(), SwaggerError, redactSwaggerOutput(), assertPublicRemoteAddress(), ipToNumber(), isBlockedV6(), isPrivateV4(), validateRemoteUrl() (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (15): ensureBrowserSetupGate(), getGlobalClient(), setGlobalClient(), matchesEntry(), selectReviewers(), showToast(), callTool(), collectTrustedReviewOutputs() (+7 more)

### Community 6 - "Community 6"
Cohesion: 0.13
Nodes (21): ipv4ToNumber(), isBlockedIPv4(), isDangerousHostname(), isLinkLocalIPv6(), isRecord(), loadBuiltinMcpConfigFromPaths(), loadBuiltinOpencodeConfig(), mergeBuiltinOpencodeConfig() (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.13
Nodes (16): getArtifactDirectory(), listArtifacts(), readMarkdownFiles(), displayPath(), fallbackSkillForPhase(), fingerprintFromFrontmatter(), invalidResult(), kebabCase() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.18
Nodes (14): ContextInjectError, createSessionWithFallback(), executeHandoff(), generateHandoffTitle(), SessionCreateError, executePromptSubmit(), generateSessionTitle(), PromptSessionCreateError (+6 more)

### Community 9 - "Community 9"
Cohesion: 0.15
Nodes (6): agentBrowserCommand(), isDiscoveryOutput(), parseDiscoveryOutput(), redactAgentBrowserError(), runAgentBrowser(), isValidScriptId()

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (5): isSetupCompleted(), proofPath(), readSetupProof(), writeSetupProof(), assertBrowserSetupCompleted()

### Community 11 - "Community 11"
Cohesion: 0.52
Nodes (5): isCompatibleExtension(), isLocalOrPrivateHost(), normalizeContentType(), validateBrowserContentType(), validateBrowserResourceUrl()

### Community 13 - "Community 13"
Cohesion: 0.7
Nodes (4): bundlePluginEntry(), main(), removeTuiConfigPlugin(), writePluginWrapper()

## Knowledge Gaps
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `Community 5` to `Community 1`, `Community 4`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `isInsideRoot()` connect `Community 1` to `Community 0`, `Community 2`, `Community 5`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `parseSwaggerSource()` connect `Community 4` to `Community 3`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `runBrowserMode()` (e.g. with `runFigmaAssetTool()` and `normalizeNodeId()`) actually correct?**
  _`runBrowserMode()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `runCollectMode()` (e.g. with `runFigmaAssetTool()` and `resolveExistingWorkspacePath()`) actually correct?**
  _`runCollectMode()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `parseSwaggerDocument()` (e.g. with `parseSwaggerSource()` and `parseFixture()`) actually correct?**
  _`parseSwaggerDocument()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._