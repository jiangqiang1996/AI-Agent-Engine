---
date: 2026-04-26
topic: review-unification
focus: 审查体系彻底重构——合并 ae:review 与 ae:document-review
mode: repo-grounded
---

# 创意构思：审查体系统一重构

## 落地上下文

基于 `docs/2026-04-25-agent-routing-map.md` 对审查体系的深度分析，识别出以下核心问题：
1. 两个技能（ae:review + ae:document-review）存在大量重复基础设施（schema、流水线、模板）
2. 阶段 5.7 的 schema 翻译层是人为复杂度——文档发现被强行转为代码发现格式
3. 代理激活有双路径问题（selectCodeReviewers vs SKILL.md 文件路由）
4. product-lens + scope-guardian 始终共激活但作为独立代理存在
5. 同方法论不同域的代理对（security/security-lens、adversarial/adversarial-document）可合并
6. 领域代理在 catalog 中但 selector 无法激活

## 排名想法

### 1. 统一 Findings Schema + 3 级 autofix
**描述：** 合并代码/文档两套 findings schema 为统一 schema，用 `domain: "code"|"document"` 判别器区分。`location` 为联合类型 `{type:"code",file,line}|{type:"document",file,section}`。autofix_class 从 4+2 级统一为 3 级：auto/gated/advisory。
**理由：** 消除综合流水线 5.7 的 schema 翻译层；两套 schema 70% 字段重叠，分离维护是纯开销；3 级比 4 级更清晰（gated_auto 和 manual 在同一队列）
**缺点：** 破坏性变更，需迁移两套 SKILL.md 和所有子代理模板；owner/requires_verification 需保留为 code-domain 可选字段
**置信度：** 85%
**复杂度：** 中
**状态：** 未探索

### 2. 声明式激活矩阵替代命令式 if-链
**描述：** 将 review-selector.ts 的两个选择函数替换为声明式数据表。每个审查者行声明激活谓词，选择函数变为 `REVIEW_MATRIX.filter(r => r.activation(input))`。
**理由：** 添加审查者从改 3 文件降为 1 文件；product-lens 重复触发自然消失；adversarial 的多 OR 条件变为可读谓词组合；领域代理激活逻辑可纳入同一矩阵
**缺点：** 需设计谓词 DSL 或函数式组合
**置信度：** 90%
**复杂度：** 中
**状态：** 未探索

### 3. 统一 Review Selection Input + 消除双重分派
**描述：** 合并 DocumentReviewSelectionInput 和 CodeReviewSelectionInput 为单一 ReviewSelectionInput，kind 作为输入维度之一。ae-review-contract 工具消除人工拆包层。
**理由：** hasSecurity 在两套接口中重复定义；工具 args 已扁平化，selector 拆分是人为边界
**缺点：** 语义混淆风险（changedLineCount 对文档无意义），但 optional 字段自然解决
**置信度：** 85%
**复杂度：** 低
**状态：** 未探索

### 4. 代理聚类：29 → 24
**描述：** 合并 5 对代理（correctness+kieran-ts, agent-native+cli-readiness, security+security-lens, adversarial+adversarial-doc, product-lens+scope-guardian, step-granularity+batch-operation），新增 traceability-reviewer，重命名 standards/learnings。
**理由：** 同方法论不同域的代理可合并；始终共激活的代理对无独立存在必要；kieran-ts 是 correctness 的 TS 深度模式不是独立关注点
**缺点：** 代理 persona 重写量大；目录迁移影响构建流程
**置信度：** 80%
**复杂度：** 高
**状态：** 未探索

### 5. 合并技能：ae:document-review → ae:review
**描述：** 将两个技能合并为统一 ae:review，通过 domain 字段区分代码/文档审查路径。统一 SKILL.md、综合流水线、代理目录、工具接口。
**理由：** 当前 ae:review 已通过阶段 4b 委派文档审查，然后强行做 schema 翻译——分离的收益被合并成本吞噬；两个技能的排除规则/模式规则/综合流水线 70% 重叠
**缺点：** SKILL.md 复杂度可能膨胀（缓解：域特定逻辑压入 references/）；破坏性变更面大
**置信度：** 75%
**复杂度：** 高
**状态：** 未探索

### 6. 统一综合流水线
**描述：** 合并 10 步（代码）和 8 步（文档）为 9 步统一流水线。核心 6 步相同，差异步骤通过 domain 分支处理。消除 5.7 翻译层。
**理由：** 两个流水线的核心步骤（校验→置信度→去重→共识→分歧→排序）逻辑完全相同
**缺点：** 文档域的残余风险提升和 autofix 提升是独特步骤，需保留为 domain 分支
**置信度：** 85%
**复杂度：** 中
**状态：** 未探索

### 7. 新增审查角度：traceability-reviewer
**描述：** 新增跨域代理，当代码和文档同时存在于审查范围时激活，检查代码-文档一致性和需求-实现可追溯性。
**理由：** 当前体系无代理检查"代码改了但文档没更新"；plan 有 step-granularity 但不追踪回溯到需求
**缺点：** 需定义具体审查逻辑和 findings 输出格式
**置信度：** 70%
**复杂度：** 中
**状态：** 未探索

## 拒绝摘要

| # | 想法 | 拒绝理由 |
|---|------|---------|
| 1 | Self-selecting agents with content bidding | token 成本翻倍，引入非确定性 |
| 2 | Adaptive confidence from review history | 冷启动问题，反馈回路自我强化 |
| 3 | Streaming dedup with early termination | 实现极复杂，当前并行模型已够快 |
| 4 | Catalog as agent metadata extension | 逆转依赖方向，迁移成本过高 |
| 5 | Bidirectional review delegation | 当前单向委派是有意设计（关注点分离） |
| 6 | Severity lattice (3D) | 过度设计，2D 已足够 |
| 7 | Cost-based reviewer selection | 缺乏 token 数据支撑成本模型 |
| 8 | Event-sourced findings | 过度工程化，当前产物文件已是事实日志 |
| 9 | Cross-agent finding stream | 非确定性问题，测试困难 |
| 10 | Live patch agents | safe_auto 已实现自动修复，收益不够 |
