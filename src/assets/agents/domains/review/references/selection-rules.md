# 审查域选择规则

本文档描述审查域代理如何选择审查专精代理，与代码层 `review-selector.ts` 的逻辑语义对齐。

**优先使用预计算结果**：当 `DomainCallRequest.selectedSpecialists` 存在且非空时，以其为权威选择，不再独立评估条件。

## 代码审查常驻代理

以下专精代理在任何代码审查中自动选中：

| 专精代理 | 选择条件 |
|---------|---------|
| correctness-reviewer | 常驻 |
| testing-reviewer | 常驻 |
| maintainability-reviewer | 常驻 |
| standards-reviewer | 常驻 |
| research-reviewer | 常驻 |

## 文档审查常驻代理

以下专精代理在任何文档审查中自动选中：

| 专精代理 | 选择条件 |
|---------|---------|
| coherence-reviewer | 常驻 |
| feasibility-reviewer | 常驻 |

## 条件激活代理

| 专精代理 | 域 | 激活条件 |
|---------|-----|---------|
| security-reviewer | both | hasSecurity=true |
| adversarial-reviewer | both | 变更>=50行 OR hasSecurity OR hasApi OR 需求>=5 OR hasArchitectureDecision OR isHighRiskDomain OR hasNewAbstraction |
| agent-native-reviewer | code | hasCli OR hasUi OR hasTooling OR hasAgentConfig |
| architecture-strategist | both | (code + hasArchitectureDecision) OR (code + hasNewAbstraction) OR (code + 变更>=50行) OR (document + design + hasArchitectureDecision) |
| performance-reviewer | code | hasPerformance=true |
| api-contract-reviewer | code | hasApi=true |
| reliability-reviewer | code | hasReliability OR hasInfra |
| data-migrations-reviewer | code | hasMigrations OR hasDatabase |
| previous-comments-reviewer | code | hasPrMetadata=true |
| product-lens-reviewer | document | documentType=design OR 需求>=5 OR hasProductClaim |
| step-granularity-reviewer | document | documentType=design OR targetTypes 包含 design OR reviewScenes 包含 design OR 需求>=5 |
| design-lens-reviewer | document | hasUi=true |
| test-case-reviewer | document | documentType=test |
| requirements-reviewer | document | documentType=requirements OR targetTypes 包含 requirements OR reviewScenes 包含 requirements |
| prototype-reviewer | document | documentType=prototype OR targetTypes 包含 prototype OR reviewScenes 包含 prototype |
| evidence-reviewer | document | documentType=general OR targetTypes 包含 document OR reviewScenes 包含 general-document OR hasEvidenceClaim=true |
| goal-alignment-reviewer | both | hasGoalAlignment=true |
| traceability-reviewer | both | hasMixedTargets=true OR kind=general |
