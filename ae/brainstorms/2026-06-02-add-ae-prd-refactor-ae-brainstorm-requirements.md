---
type: brainstorm
status: drafted
date: 2026-06-02
topic: add-ae-prd-refactor-ae-brainstorm
format: human-readable-requirements
sharded: false
---

# 新增 ae:prd 技能 + 改造 ae:brainstorm 为通用讨论能力

## AI 解析契约
- canonicalKind: requirements
- humanEquivalent: true
- stableIdsRequired: true
- noImplicitScope: true

## 问题框架

当前 ae:brainstorm 混合了两种不同心智模式：发散式探索（讨论方案）和收敛式确认（质疑假设、澄清需求、写需求文档）。这导致：
- 用户只想讨论方案时被迫产出文档
- 需求已明确时被迫走完探索流程
- 发散和收敛在同一技能中节奏感不好

同时，ae:brainstorm 作为主流程必经阶段，无法在其他需要讨论的场景中被复用。

## 需求

**主流程重构**

- R1. 新增 ae:prd 技能，替代 ae:brainstorm 在主流程中的位置 → 验收: 主流程变为 ideate (可选) → prd → plan → work → review
- R2. ae:prd 继承 ae:brainstorm 的需求定义能力（质疑假设、协作对话澄清需求、捕获需求文档） → 验收: prd 能完成当前 brainstorm 阶段 1.2、1.3、3、3.5 的全部功能
- R3. ae:prd 产出需求文档到 ae/prds/ 目录 → 验收: 产物路径为 ae/prds/YYYY-MM-DD-<topic>-prd.md
- R4. ae:prd 产出的文档 type 字段为 prd → 验收: frontmatter 中 type: prd
- R5. ae:prd 产出的文档 frontmatter 包含 date、topic、format: human-readable-requirements、sharded → 验收: 与当前 brainstorm 产物结构对齐，仅 type 不同
- R6. ae:prd 支持分片（prd-shard），规则与当前 brainstorm-shard 一致 → 验收: 分片主文件 sharded: true，子文件 type: prd-shard、parent、module

**ae:brainstorm 改造**

- R7. ae:brainstorm 从主流程中移除，改为通用讨论能力 → 验收: ae:lfg 管道不再调用 ae:brainstorm
- R8. ae:brainstorm 聚焦于方案探索和比较：提出 2-3 个方案、分析优缺点风险、给出推荐 → 验收: brainstorm 的核心流程为上下文扫描 → 探索方案 → 讨论 → 返回结论
- R9. ae:brainstorm 无持久产出物 → 验收: brainstorm 不写入任何文件，结论通过对话返回
- R10. ae:brainstorm 可在任何场景被调用，只要存在多个方案或需要深入讨论 → 验收: prd、plan、work、review 等技能均可按需调用 brainstorm
- R11. ae:brainstorm 保留用户直接调用入口（/ae-brainstorm 命令） → 验收: 用户可随时运行 /ae-brainstorm 开始讨论
- R12. ae:brainstorm 的 SKILL.md 中声明触发时机：需求背后有多个合理方案、需要多角度探讨决策、任何需要讨论而非确定的场景 → 验收: 触发条件在技能描述中可被 LLM 识别

**ae:prd 调用 ae:brainstorm**

- R13. ae:prd 在协作对话中遇到多个可行方案时，调用 ae:brainstorm 进行方案讨论 → 验收: prd 阶段 1.4 可触发 brainstorm
- R14. brainstorm 讨论结束后，结论回到 prd 继续需求确认和文档化 → 验收: brainstorm 的结论通过对话上下文传递给 prd

**ae:plan 上游查找适配**

- R15. ae:plan 上游查找优先搜索 ae/prds/，兼容 ae/brainstorms/ → 验收: plan 能找到 prd 产物作为上游；旧 brainstorm 产物仍可使用
- R16. ae:plan 上游查找文件匹配模式优先 *-prd-*.md，兼容 *-requirements.md → 验收: 两种命名格式都能被找到
- R17. ae:plan 需求不清时推荐 ae:prd（替代当前推荐 ae:brainstorm） → 验收: 引导文案指向 ae:prd

**ae:lfg 管道适配**

- R18. ae:lfg 步骤 2 运行 ae:prd（替代 ae:brainstorm） → 验收: lfg 管道调用 prd
- R19. ae:lfg 步骤 2 门控验证 ae/prds/ 产出 PRD 文档 → 验收: 门控路径和产物类型更新
- R20. ae:lfg 步骤 3 审查 ae/prds/ 产物 → 验收: 文档审查路径更新
- R21. ae:lfg 主链路描述更新为 ae:prd → ae:review → ae:plan / ae:refactor → ... → 验收: 链路描述中无 ae:brainstorm

**代码层常量与 Schema**

- R22. 技能名常量新增 PRD → 验收: SKILL.PRD = 'ae:prd'
- R23. 产物类型常量新增 PRD 和 PRD_SHARD → 验收: ARTIFACT_KIND.PRD = 'prd'，ARTIFACT_KIND.PRD_SHARD = 'prd-shard'
- R24. 产物目录常量新增 PRDS → 验收: DOCS_AE_SUBDIRS.PRDS = 'prds'
- R25. 产物目录映射新增 prd → prds → 验收: artifact-store 的 CONTEXT_DIR_TYPE_MAP 包含 prd 映射
- R26. 产物类型 Schema 新增 prd 和 prd-shard 枚举值 → 验收: ArtifactTypeSchema 包含新枚举
- R27. 产物 frontmatter Schema 新增 prd 类型校验规则 → 验收: prd 类型必须有 date 和 topic，status 允许 drafted / review-passed / completed
- R28. 技能名 Schema 新增 ae:prd 枚举值 → 验收: AeSkillNameSchema 包含 SKILL.PRD
- R29. 命令模型场景新增 prd 条目 → 验收: COMMAND_SCENARIOS 覆盖 ae-prd 命令

**Recovery 适配**

- R30. recovery 新增 prd phase → 验收: preferredArtifactTypes、fallbackSkillForPhase、nextSkillForArtifact 支持 prd
- R31. plan/lfg 阶段 recovery 优先查找 prd 产物，兼容 brainstorm 产物 → 验收: 查找顺序为 prd → brainstorm
- R32. plan/lfg 阶段 fallback 改为 SKILL.PRD → 验收: 缺少上游产物时推荐 ae:prd
- R33. prd artifactType 在 lfg 中路由到 REVIEW（与 brainstorm 行为一致） → 验收: 需求产物先进入审查入口

**向后兼容**

- R34. ae/brainstorms/ 目录和 type: brainstorm 文档保留，不删除不迁移 → 验收: 已有产物不受影响
- R35. plan 上游查找同时搜索 ae/prds/ 和 ae/brainstorms/（prd 优先） → 验收: 旧产物仍可被 plan 使用
- R36. recovery 同时查找 prd 和 brainstorm 产物（prd 优先） → 验收: 旧产物仍可被恢复

## 非功能需求

- NFR1. ae:prd 的需求文档模板与当前 brainstorm 的 requirements-capture.md 结构一致，仅 type 和路径不同 → 验收: 文档结构、稳定 ID 规则、验收语法、AI 解析契约均保持
- NFR2. ae:brainstorm 改造后保留非软件头脑风暴路由能力 → 验收: references/universal-brainstorming.md 仍可被加载
- NFR3. ae:prd 的技能描述和命令提示应明确区分与 ae:brainstorm 的职责 → 验收: 用户不会混淆何时用 prd 何时用 brainstorm

## 成功标准

- 主流程 ideate → prd → plan → work → review 完整可运行
- ae:prd 能独立完成从需求澄清到需求文档产出的全流程
- ae:brainstorm 能在任何场景被按需调用，无持久产出
- 已有的 ae/brainstorms/ 产物仍可被 plan 和 recovery 正常使用
- ae:prd 产出的文档可被 plan、recovery、ae-doc-extract 正确识别和使用

## 范围边界

### 范围内

- 新增 ae:prd 技能及其资产文件
- 改造 ae:brainstorm SKILL.md（精简流程、更新描述、移除需求捕获）
- 修改 ae:plan SKILL.md（上游查找适配）
- 修改 ae:lfg SKILL.md（管道步骤适配）
- 代码层常量、Schema、服务、工具的适配
- 测试新增和更新
- 向后兼容处理

### 范围外

- 自动迁移已有 ae/brainstorms/ 产物到 ae/prds/
- 删除 ae:brainstorm 技能或其命令入口
- 修改 ae:ideate 的行为
- 修改 ae:work 或 ae:review 的核心流程
- 新增工具或 hook 来自动检测多方案场景并触发 brainstorm

### 约束

- ae:brainstorm 的 references/requirements-capture.md 和 references/handoff.md 迁移到 ae:prd 后，brainstorm 不再保留这两份文件
- ae:prd 的 references/requirements-capture.md 中 type 字段改为 prd，产物路径改为 ae/prds/
- ae:prd 的 references/handoff.md 中下游技能指向 ae:plan

## 关键决策

- D1. ae:brainstorm 无持久产出物 → 理由: brainstorm 定位为纯讨论，结论通过对话返回给调用方
- D2. ae:prd 产物路径为 ae/prds/ → 理由: 与 brainstorm 的 ae/brainstorms/ 区分，语义更清晰
- D3. ae:prd 文档 type 为 prd → 理由: 语义最清晰，prd 产出的文档 type 就是 prd
- D4. ae:prd 文件命名为 YYYY-MM-DD-<topic>-prd.md → 理由: 简洁且与 plan 命名风格对齐
- D5. ae:brainstorm 的按需调用机制仅在 SKILL.md 中声明触发时机 → 理由: 最简实现，由 LLM 根据描述判断何时调用
- D6. ae:brainstorm 保留 /ae-brainstorm 命令入口 → 理由: 用户可随时直接调用讨论
- D7. 向后兼容而非迁移 → 理由: 已有产物不破坏，新需求走新流程

## 依赖 / 假设

### 依赖

- ae:prd 的需求文档模板基于当前 ae:brainstorm 的 references/requirements-capture.md
- ae:prd 的交接逻辑基于当前 ae:brainstorm 的 references/handoff.md

### 假设

- LLM 能根据 ae:brainstorm 的 SKILL.md 描述正确判断何时调用
- 已有 ae/brainstorms/ 产物不需要迁移，plan 和 recovery 的兼容查找足够

## 待定问题

### 推迟到规划

- [影响 R10][技术] ae:brainstorm 被其他技能调用时的上下文传递机制（对话内隐式传递 vs 显式参数）
- [影响 R13][技术] ae:prd 调用 ae:brainstorm 的具体交互模式（同步等待结论 vs 异步）
- [影响 R22][技术] ae:prd 技能是否需要 -po/-pa 命令变体

## 一致性检查
- requirementsCount: 36
- nonFunctionalRequirementsCount: 3
- decisionsCount: 7
- openQuestionsCount: 3
