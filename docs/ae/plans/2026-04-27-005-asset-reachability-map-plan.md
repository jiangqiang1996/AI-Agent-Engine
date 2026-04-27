---
type: plan
status: drafted
date: 2026-04-27
title: asset-reachability-map
origin: docs/ae/brainstorms/2026-04-27-asset-reachability-map-requirements.md
originFingerprint: 2026-04-27-asset-reachability-map
depth: standard
---

# 资产可达性图谱实施计划

## 问题框架

AE 插件的技能、命令、代理和工具分散在 TypeScript 常量、catalog 数据结构、SKILL.md frontmatter 和文件系统中。维护者无法快速判断某个代理是否真实可达、是否有重复入口或废弃节点。本计划实施一份可脚本生成的仓库文档，以 Mermaid 子图 + 风险诊断的形式呈现资产拓扑。

## 实现单元

### 单元 1：数据采集与节点/边集构建

- [ ] **目标：** 创建 `scripts/asset-graph.mjs` 中的 `collectData()` 函数，读取结构化数据源并返回节点集和边集
- **需求覆盖：** R2, R3, R4, R5
- **依赖：** 无
- **文件：**
  - 新建 `scripts/asset-graph.mjs`
  - 修改 `package.json`（新增 `asset-graph` 脚本命令）
- **方法：**
  1. 使用动态 `import()` 加载 `dist/src/schemas/ae-asset-schema.js`（SKILL/AGENT/TOOL 常量）、`dist/src/services/ae-catalog.js`（PHASE_ONE_ENTRIES、代理列表）、`dist/src/services/review-catalog.js`（REVIEW_MATRIX）
  2. 使用动态 `import()` 加载 `dist/src/utils/frontmatter.js` 的 `parseFrontmatter()` 解析 SKILL.md frontmatter
  3. 使用 `fs` 扫描 `src/assets/skills/*/SKILL.md`（frontmatter 字段）、`src/assets/agents/**/*.md`（文件存在性）、`src/assets/skills/` 目录列表（检测幽灵目录）
  4. 扫描 `src/assets/commands/*.md`（磁盘命令文件）
  5. 从 `TOOL` 常量获取工具名集合（不导入 `createToolRegistry`，避免拉入 Effect 运行时依赖）
  6. 从 `recovery-service.ts` 源码文本中提取 `fallbackSkillForPhase` 的阶段→技能映射（正则匹配 switch-case 结构），因该函数未导出；在覆盖边界中标注此为手动同步点
  7. 构建节点集（入口、技能、命令、代理、工具）和边集（结构化引用），返回类型化的 `AssetGraphData` 对象
- **产出物：** `collectData(): AssetGraphData` 函数，返回节点集和边集
- **执行说明：**
  - 脚本必须在 `npm run build` 之后运行，依赖 `dist/src/` 下编译产物
  - 脚本启动时校验 `dist/src/` 存在，不存在时给出中文提示
  - frontmatter 解析复用 `dist/src/utils/frontmatter.js`，不引入第三方依赖
  - 脚本应可重复运行，输出幂等
- **需遵循的模式：** 参考 `src/services/help-catalog-service.ts` 的数据聚合模式
- **测试场景：**
  - 正常路径：`npm run build && npm run asset-graph` 后 `docs/ae/asset-graph.md` 存在且包含 Mermaid 代码块
  - 边界情况：某个 SKILL.md 文件缺失时，脚本报告风险而非崩溃
  - 错误路径：编译产物不存在时，脚本给出明确中文提示
  - 幽灵目录：`ae-static-preview` 空目录被检测为 orphan-directory
- **验证：** `node -e "import('./scripts/asset-graph.mjs').then(m => assert(Object.keys(m.collectData()).length > 0))"` 或等价命令通过

### 单元 2：风险计算引擎

- [ ] **目标：** 实现 `computeRisks(data: AssetGraphData): RiskReport` 函数，自动检测五类风险
- **需求覆盖：** R5, R6, R7, R8, R9
- **依赖：** 单元 1 的 `AssetGraphData` 类型
- **文件：** `scripts/asset-graph.mjs`（导出 `computeRisks` 函数）
- **产出物：** `computeRisks()` 函数，返回五类风险的 `RiskReport` 对象
- **方法：**
  1. **unreachable（存在但不可达）：** 从入口节点出发做 BFS，标记所有无法到达的资产节点。区分 `unreachable-guaranteed`（无任何结构化路径）和 `unreachable-conditional`（仅条件或弱引用可达）
  2. **broken-ref（引用但不存在）：** 双向校验：(a) 常量/catalog 声明的名称是否在文件系统中存在对应文件；(b) 文件系统中的技能目录是否在常量中声明（差集为 orphan-directory）
  3. **duplicate-entry（重复入口或别名）：** 检测多个命令/入口指向同一技能文件。已被 deprecated 标记的资产不重复报告此风险
  4. **deprecated（已注册但已废弃）：** 主条件 = catalog 的 customTemplate 非空且包含技能重定向模式；次条件 = SKILL.md frontmatter 含 `deprecated: true`（预留，当前仓库无匹配项）。两者为 OR 关系
  5. **low-reach（低触达率）：** 两条判定路径：(a) REVIEW_MATRIX 中 `alwaysOn: false` 的条件激活代理（标注条件摘要）；(b) `ae-catalog.ts` 中 `tier === 'gilded'` 的代理（天然低触达）
  6. 每类风险输出四元状态：`found` / `not-found-covered` / `not-found-partial` / `not-covered`，附带已检查数据源列表
  7. 为每种风险状态附带推荐修复动作模板：unreachable→检查是否应删除或添加引用；broken-ref→修复引用或删除节点；duplicate-entry→标注为 deprecated 并指向唯一入口；deprecated→评估是否移除注册；low-reach→确认是否为期望的低频激活
- **测试场景：**
  - `ae:document-review` 走 customTemplate 重定向路径被检测为 `deprecated`
  - gilded 代理走 tier 判定路径被标记为 `low-reach`
  - 常量中存在但文件系统中不存在的条目被标记为 `broken-ref`
  - `ae-static-preview` 空目录被检测为 `broken-ref`（orphan-directory 子类）
- **验证：** `node -e "..."` 断言 `computeRisks()` 返回的 deprecated 列表包含 `ae:document-review`

### 单元 3：Mermaid 子图渲染

- [ ] **目标：** 实现 `renderMermaid(data: AssetGraphData, risks: RiskReport): string` 函数
- **需求覆盖：** R1, R2, R11
- **依赖：** 单元 1 的 `AssetGraphData`、单元 2 的 `RiskReport`
- **文件：** `scripts/asset-graph.mjs`（导出 `renderMermaid` 函数）
- **产出物：** `renderMermaid()` 函数，返回 Mermaid 代码块字符串
- **方法：**
  1. **入口与主流程子图：** `/ae-lfg` → 主流程技能（ideate → brainstorm → plan → work → review）→ 工具节点。recovery fallback 边以 `-.->|fallback|` 表示；`ae:ideate` 标注 `optional-pre-step`
  2. **命令与技能子图：** Phase One 命令（实线指向技能）+ PO/PA 派生命令折叠为汇总节点 `*-po/pa` + 磁盘命令（`ae-commit`，标注 `source: filesystem`）
  3. **审查代理子图：** 按 `domain`（code/document）分组，每组内按 `stage`（review/research/workflow）分子子图；`alwaysOn` 用实线、条件激活用虚线，附带激活条件摘要
- **执行说明：**
  - `ae:document-review` 以虚线边标注 `deprecated → ae:review`，节点样式为 `stroke-dasharray`
  - 节点 ID 使用安全标识转换（`ae:brainstorm` → `ae_brainstorm`）
  - 每张子图节点数硬限制 <= 30；超过时 PO/PA 进一步折叠
- **测试场景：**
  - Mermaid 语法正确：无未闭合引号、无非法字符、子图关键字正确
  - 子图拆分后每张图节点数 <= 30
- **验证：** 输出字符串通过基础 Mermaid 语法正则校验（含 `graph`/`flowchart` 关键字、子图闭合）

### 单元 4：风险诊断区与元信息渲染

- [ ] **目标：** 实现 `renderDiagnostics(risks: RiskReport, data: AssetGraphData): string` 函数
- **需求覆盖：** R6, R7, R8, R9, R12, R13
- **依赖：** 单元 1 的 `AssetGraphData`、单元 2 的 `RiskReport`
- **文件：** `scripts/asset-graph.mjs`（导出 `renderDiagnostics` 函数）
- **产出物：** `renderDiagnostics()` 函数，返回风险诊断区 Markdown 字符串
- **方法：**
  1. **风险诊断表：** 按五类风险分组，每类列出具体发现条目，附带四元状态（`found`/`not-found-covered`/`not-found-partial`/`not-covered`）、已检查数据源和推荐修复动作
  2. **代理可达性表：** 列出所有 26 个代理。审查域代理从 REVIEW_MATRIX 获取 `alwaysOn`/`conditional` 标注；非审查域代理从 `ae-catalog.ts` 的 `tier` 字段推导（required → `suggests-reachable`，gilded → `low-reach`）。附带入口路径摘要
  3. **覆盖边界：** 明确列出首版已覆盖（常量、catalog、review-catalog、frontmatter、文件系统目录扫描）和未覆盖（SKILL.md 正文、agent prompt 正文、README 自由文本）的数据源，标注"未覆盖 ≠ 确认安全"。标注 recovery 回退映射为手动同步点
  4. **鲜度声明：** 输出生成时间戳、已扫描文件列表；附带更新命令 `npm run asset-graph`
  5. **演进建议：** 列出可后续演进的检查项（CI 门禁、自诊断命令、自然语言弱证据扩展、recovery 映射自动化）
- **测试场景：**
  - 风险诊断表包含所有五类风险，即使部分为"未发现"
  - 覆盖边界区分 `SKILL.md frontmatter`（已覆盖）和 `SKILL.md 正文`（未覆盖）
  - 代理可达性表包含全部 26 个代理
- **验证：** 输出字符串包含五类风险标题和覆盖边界节标题

### 单元 5：脚本编排与集成测试

- [ ] **目标：** 串联单元 1-4 的函数，输出完整文档；编写集成测试
- **需求覆盖：** 全部 R1-R13
- **依赖：** 单元 1-4
- **文件：**
  - `scripts/asset-graph.mjs`（主函数编排逻辑）
  - 新建 `tests/asset-graph.test.ts`（Vitest 集成测试）
- **方法：**
  1. 主函数 `generateAssetGraph()` 调用 `collectData()` → `computeRisks()` → `renderMermaid()` → `renderDiagnostics()` → 拼装完整 Markdown → 写入 `docs/ae/asset-graph.md`
  2. `package.json` 新增 `"asset-graph": "node scripts/asset-graph.mjs"`
  3. 集成测试（`tests/asset-graph.test.ts`）：
     - 运行 `generateAssetGraph()` 后断言 `docs/ae/asset-graph.md` 存在
     - 断言输出包含有效的 Mermaid 代码块
     - 断言风险诊断区包含五类风险标题
     - 断言 `ae:document-review` 被标记为 `deprecated`
     - 断言 gilded 代理被标记为 `low-reach`
     - 断言鲜度声明包含生成时间戳和更新命令
     - 断言覆盖边界区分已覆盖和未覆盖数据源
- **测试场景：**
  - 正常路径：完整生成流程
  - 回归：修改常量后重新生成，验证风险诊断区更新
- **验证：** `npm run test` 通过

## 高层技术设计

### 数据流

```
collectData() ──→ AssetGraphData
                        │
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
   computeRisks()  renderMermaid()  renderDiagnostics()
          │             │             │
          ▼             ▼             ▼
      RiskReport    Mermaid str    Diagnostics str
          │             │             │
          └─────────────┼─────────────┘
                        ▼
              generateAssetGraph()
                        │
                        ▼
          docs/ae/asset-graph.md
```

### 结构化边类型

| 边类型 | 来源 | 可视化 |
|--------|------|--------|
| command→skill | `ae-catalog.ts` PHASE_ONE_ENTRIES | 实线 |
| skill→tool | TOOL 常量 + catalog | 实线 |
| phase→next-skill | `recovery-service.ts` 源码文本提取 | 实线（主路径）/ 虚线（fallback） |
| review-agent→condition | `review-catalog.ts` REVIEW_MATRIX | 实线（alwaysOn）/ 虚线（conditional） |
| deprecated→redirect | `ae-catalog.ts` customTemplate | 虚线 + deprecated 标签 |
| command-filesystem→none | 磁盘命令文件 | 虚线 + 无技能关联标注 |

### 非结构化边处理策略

首版**不提取** SKILL.md 正文中的 `ae:*` / `@agent` 引用作为强边。在覆盖边界中明确标注此为未覆盖范围，并在演进建议中指出弱证据扩展方向。

## 关键决策

- **生成方式：** 脚本生成而非手写，确保可重复和可更新
- **依赖策略：** 复用 `dist/src/` 编译产物，不引入 AST 解析或新运行时依赖；frontmatter 解析复用 `dist/src/utils/frontmatter.js` 的 `parseFrontmatter()`
- **子图拆分：** 3 个子图（入口主流程含工具 / 命令技能 / 审查代理），代理按 domain 分组、组内按 stage 分子子图；PO/PA 折叠显示；工具归入入口主流程子图而非独立子图
- **风险分类：** 在需求文档 R6 三类风险基础上，根据 R8 代理可达性需求细化出 deprecated 和 low-reach 两个子类。deprecated 由 R6 的"重复入口"场景中"已废弃重定向"这一特定形态衍生；low-reach 由 R8"代理是否被结构化工作流触达"的"条件激活"和"gilded 低频"场景衍生
- **非结构化边：** 首版不提取，在覆盖边界和演进建议中说明
- **recovery 边：** 纳入图谱但以虚线 fallback 标注，与正常编排边区分；因 `fallbackSkillForPhase` 未导出，从源码文本提取，在覆盖边界标注为手动同步点
- **磁盘命令：** 纳入 Command 子图，标注 `source: filesystem`
- **工具名来源：** 从 `TOOL` 常量获取，不导入 `createToolRegistry`，避免拉入 Effect 运行时
- **幽灵目录检测：** broken-ref 增加双向校验，检测文件系统中存在但常量中无声明的技能目录

## 依赖 / 假设

- 脚本依赖 `npm run build` 产出的 `dist/src/` 下 `.js` 文件
- `parseFrontmatter()` 编译产物可被脚本 dynamic import，无 Effect Layer 依赖
- Mermaid 图在 GitHub 和常见 Markdown 预览器中可正常渲染
- recovery 回退映射从 `recovery-service.ts` 源码文本提取，需手动同步
- `createToolRegistry()` 等函数若未来引入 Effect Layer 等运行时依赖，脚本需改为从 `TOOL` 常量直接获取（已采用此方案）

## 待定问题（推迟到执行）

- [影响 单元 3][技术] Mermaid 子图的最大节点数是否需要在脚本中做硬限制（当前设为 <= 30）？
- [影响 单元 5][技术] 集成测试放在 `tests/` 还是 `scripts/__tests__/`？当前选 `tests/` 以匹配 vitest include 范围。

## 风险

| 风险 | 缓解 |
|------|------|
| 编译后 `.js` 路径变更导致脚本失效 | 脚本启动时校验 `dist/src/` 存在，不存在时给出中文提示 |
| YAML frontmatter 格式不规范导致解析失败 | 复用项目已有的 `parseFrontmatter()`，该函数已有容错处理 |
| Mermaid 图节点 ID 包含特殊字符 | 使用安全标识转换（`ae:brainstorm` → `ae_brainstorm`） |
| 图谱文档过大影响仓库 clone | 首版预估 < 500 行；如果超限可 `.gitattributes` 标记 |
| recovery 回退映射漂移 | 在覆盖边界标注为手动同步点；演进建议中提出自动化方向 |
| `ae-static-preview` 等幽灵目录未清理 | broken-ref 双向校验会检测到，但修复需人工判断 |
