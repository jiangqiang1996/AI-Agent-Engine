# 审查域选择规则

本文档描述审查域代理如何选择审查专精代理，与代码层 `review-catalog.ts` 的 `REVIEW_MATRIX`（13 个代理）语义对齐。

**优先使用预计算结果**：当 `DomainCallRequest.selectedSpecialists` 存在且非空时，以其为权威选择，不再独立评估条件。

## 常驻代理

以下专精代理在对应域审查中自动选中：

| 专精代理 | 域 | 选择条件 |
|---------|-----|---------|
| ocr-reviewer | code | 常驻；通过 ae-ocr 工具覆盖 bug/安全/性能/可维护性/测试覆盖/风格/架构/API/可靠性/数据迁移/代理原生/对抗式 |
| document-reviewer | both | 常驻；覆盖内部一致性/可行性/产品视角/步骤粒度/需求/证据 |

## 条件激活代理

| 专精代理 | 域 | 激活条件 |
|---------|-----|---------|
| architecture-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design |
| api-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design |
| database-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design |
| ui-ux-design-reviewer | document | (hasDesignContract=true AND hasUi=true) OR targetTypes 包含 design |
| test-cases-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design OR targetTypes 包含 test-case |
| security-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design OR hasSecurity=true |
| observability-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design |
| non-functional-design-reviewer | document | hasDesignContract=true OR targetTypes 包含 design |
| design-integrity-reviewer | document | hasDesignContract=true OR targetTypes 包含 design |
| traceability-reviewer | both | hasMixedTargets=true OR kind=general |
| goal-alignment-reviewer | both | hasGoalAlignment=true |
