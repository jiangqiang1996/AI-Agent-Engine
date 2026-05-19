---
type: plan
status: drafted
date: 2026-05-15
title: refactor-ts-tree-sitter-graph-parser
depth: deep
---

# TS tree-sitter 图谱解析重构计划

## AI 解析契约
- canonicalKind: plan
- humanEquivalent: true
- stableIdsRequired: true
- implementationUnitsRequired: true
- noImplicitScope: true

## 来源与目标
- 来源：当前图谱构建链路的解析实现以 `src/services/graph-parse-service.ts` 为核心，TS/JS 依赖 `typescript` compiler AST，其他语言多为浅层正则/文本抽取。
- 目标：把图谱“纯代码抽取”迁移为纯 TypeScript 实现的 tree-sitter AST 抽取，并继续通过 `ae-graph-build` 这个 OpenCode 自定义 tool 触发，不引入 Python 运行时或外部分析链路。
- 外部行为保持要求：`ae-graph-build`、`ae-graph-query` 和用户侧命令名保持可用；仅替换内部抽取实现与其测试基线。
- 重构边界：可以彻底移除旧的 compiler/regex 抽取实现，也可以重置图谱存储契约，不需要兼容历史产物格式、历史数据或旧解析债务；但不能移除文件收集、安全过滤、排除规则、查询和预览产物链路。

## 范围

### 包含
- 用 TypeScript 重写图谱解析服务，使其以 tree-sitter AST 为主完成文件级、符号级和关系级抽取。
- 保留并复用现有 OpenCode tool 入口 `ae-graph-build`，由 tool 驱动新解析器。
- 引入或整理语言解析器适配层，统一输出 `GraphNode`、`GraphRelation`、`GraphParserDiagnostic`、`GraphParserStats`。
- 保留当前工作区安全边界：符号链接拦截、工作区外路径拦截、敏感文件跳过、图谱输出目录排除、文件大小上限。
- 将 graphify 的纯代码抽取原则移植为 TS 版本：稳定 ID、AST 驱动、按语言分派、失败可降级、单文件失败不阻断全量构建。

### 不包含
- 不移植大模型分析、社区聚类、报告生成、知识问答或 watch 自动重建等非抽取能力。
- 不引入 Python、uv 或 graphify 的运行时。
- 不改变 `ae-graph-query` 的命令名称和用户入口。
- 不做调用图精确推理、类型检查器级语义分析或跨仓库远程解析。
- 不保留旧图谱存储格式、旧解析结果或历史债务兼容层。

### 约束
- 解析实现必须落在当前仓库的 TypeScript 代码中，作为 OpenCode 插件可分发资产的一部分。
- 运行时资产加载必须满足“桥接文件 + dist”场景，不依赖源码仓库布局。
- 新旧实现不能并存为双主路径；完成迁移后删除旧实现，避免维护两套抽取逻辑。
- 新图谱存储契约可以重新设计，不要求兼容旧 `graph.json` 结构或历史分片格式。

## 需求追溯
| 需求 ID | 计划响应 |
|---------|----------|
| R1 | U1, U2 |
| R2 | U1, U3 |
| R3 | U2, U3 |
| R4 | U1, U3 |
| R5 | U4 |

## 高层技术设计
- 解析链路保持 `ae-graph-build` → 文件收集 → 语言分派 → AST 抽取 → 图谱存储。
- tree-sitter 解析器以 TS 服务层加载，按语言选择 grammar，统一输出节点、关系、诊断和统计契约。
- 关系映射由 `src/services/graph/graph-schema.ts` 统一定义：`import` / `require` / `link` / `call` / `extends` / `implements` / `type_reference` 等由新实现显式生成，不要求沿用旧存储格式。
- 旧的 regex/TypeScript compiler 抽取逻辑在新实现稳定后删除，只保留必要的文件收集、安全检查和存储接口。

### 关键决策
- D1. 使用纯 TypeScript 实现 tree-sitter AST 抽取，而不是沿用外部 Python 项目实现。理由：符合本项目运行时和打包边界，也符合用户明确约束。
- D2. 保留 `ae-graph-build` 作为唯一用户入口。理由：避免新增命令分裂用户路径，也符合现有 OpenCode tool 设计。
- D3. 允许重置图谱 schema 与存储格式，优先以新 AST 抽取契约为准重新定义产物。理由：用户明确不需要兼容历史债务，重构目标应直接消除旧约束。
- D4. 先覆盖当前仓库已支持的语言和关系，再考虑扩展更多 tree-sitter 语法。理由：控制重构面，避免一次性扩大范围。

## 专项设计

### 接口设计
- `ae-graph-build` 继续接收现有参数，不新增用户可见解析参数。
- 内部解析服务输出统一的解析结果对象，包含 nodes、relations、diagnostics、stats。
- 如果某语言解析失败，返回 warning/diagnostic 而不是抛出未捕获异常。
- 图谱存储层可以重定义版本、分片和索引结构，不要求读取旧格式时自动迁移或双写。

### 性能设计
- tree-sitter 解析器实例复用，避免每个文件重复初始化。
- 保留现有文件大小上限和排除策略，防止 AST 抽取把超大或敏感内容拖入解析路径。
- 解析失败单文件降级，避免全量构建被单点阻断。

### 部署与回滚
- 先补齐测试，再切换主解析路径。
- 若构建结果显著退化、tree-sitter 资产无法加载或图谱写入失败，则回滚到上一个稳定提交，并保留测试用例以定位差异；不保留旧格式兼容层作为回滚方案。

## 实现单元

### U1. 设计并落地 TS tree-sitter 解析核心
- [ ] 目标: 在 TypeScript 服务层实现 tree-sitter AST 抽取主路径，替换当前 compiler/regex 抽取逻辑。
- [ ] 覆盖需求: R1, R2, R4
- [ ] 行为保持要求: 文件收集、安全过滤、排除规则、敏感文件跳过、符号链接边界和超大文件跳过必须保持；图谱产物格式可以重置，不需要向后兼容旧存储结构。
- [ ] 依赖: 现有 `graph-schema`、`tree-sitter-loader`、路径工具和图谱配置服务。
- [ ] 文件:
  - `src/services/graph-parse-service.ts`
  - `src/services/graph/tree-sitter-loader.ts`
  - `src/services/graph/parser-registry.ts`
  - `src/services/graph/graph-schema.ts`
- [ ] 方法:
  - 按语言注册 AST 解析器，统一产生文件节点、符号节点和关系边。
  - 将导入、导出、调用、继承、实现和类型引用映射到现有 graph schema。
  - 将 Markdown 链接、目录关系和安全边界拆成独立步骤，避免 AST 解析器承担非语法职责。
- [ ] 需遵循的模式:
  - 纯 TypeScript 实现
  - OpenCode tool 驱动
  - AST 优先，失败可降级
  - 稳定 ID 和统一关系契约
- [ ] 测试场景:
  - 正常路径: TS/JS、Python、Java、Go 的基础 AST 抽取输出稳定节点和关系。
  - 边界情况: TSX、动态 import、跨文件引用、注释内伪引用、无扩展名路径、index 解析。
  - 错误路径: 语法错误、缺失 grammar、文件过大、符号链接、工作区外路径、读取失败。
  - 集成场景: 与新的图谱存储和查询链路联动，构建后可查询；旧格式读取失败应作为预期外部行为，不需要兼容迁移。
- [ ] 验证:
  - `npm run typecheck`
  - `npx vitest run tests/services/graph-parse-service.test.ts`
  - `npx vitest run tests/services/tree-sitter-loader.test.ts`
- [ ] 回滚信号 [可选]: 抽取结果节点/关系数量大幅下降，或基础构建失败率上升。

### U2. 让 ae-graph-build 仅通过 OpenCode tool 驱动新解析器
- [ ] 目标: 保持工具入口不变，但把构建过程固定到新的 TS tree-sitter 抽取链路。
- [ ] 覆盖需求: R1, R3
- [ ] 行为保持要求: 工具参数、授权检查、写入图谱产物和预览页的行为不变。
- [ ] 依赖: U1 完成的解析服务、现有存储服务和运行时资产定位。
- [ ] 文件:
  - `src/tools/ae-graph-build.tool.ts`
  - `src/tools/index.ts`
  - `src/services/runtime-asset-manifest.ts`
- [ ] 方法:
  - 保持 `ae-graph-build` 作为唯一构建入口。
  - 统一由 tool 选择并调用新解析器，避免保留旧抽取分支作为主路径。
  - 确认 tree-sitter 相关资产在 `dist` 和桥接文件场景可定位。
- [ ] 需遵循的模式:
  - OpenCode 自定义 tool
  - 失败返回中文可恢复结果
  - 运行时独立于源码仓库布局
- [ ] 测试场景:
  - 正常路径: 构建产物、分片、manifest 和预览页按新格式生成。
  - 边界情况: 自动/增量构建、exclude 规则、无 Git 工作区降级。
  - 错误路径: 解析器不可用、资产缺失、授权拒绝、局部文件失败、旧图谱格式不可读。
  - 集成场景: tool 触发后图谱可被查询服务读取。
- [ ] 验证:
  - `npx vitest run tests/tools/ae-graph-build.tool.test.ts`
  - `npm run test`
- [ ] 回滚信号 [可选]: 构建结果无法写入，或 tool 输出与现有门禁不一致。

### U3. 锁定图谱契约与新增 AST 行为的测试
- [ ] 目标: 用测试固定迁移后的抽取语义，防止 tree-sitter 替换后出现静默回退。
- [ ] 覆盖需求: R2, R3, R4
- [ ] 行为保持要求: 新图谱查询、存储与 health 诊断行为不退化；旧存储格式不在兼容范围内。
- [ ] 依赖: U1、U2。
- [ ] 文件:
  - `tests/services/graph-parse-service.test.ts`
  - `tests/services/tree-sitter-loader.test.ts`
  - `tests/services/graph-storage-service.test.ts`
  - `tests/tools/ae-graph-build.tool.test.ts`
  - `tests/tools/ae-graph-query.tool.test.ts`
- [ ] 方法:
  - 先补保留行为测试，再补 AST 新能力测试。
  - 增加对 tree-sitter 解析失败、语言分派、关系映射和稳定 ID 的特征化测试。
  - 让测试同时覆盖正常路径、边界、错误和集成场景。
- [ ] 需遵循的模式:
  - Vitest
  - 特征化测试优先
  - 以行为为准，不依赖实现细节
- [ ] 测试场景:
  - 正常路径: AST 抽取输出与预期 schema 对齐。
  - 边界情况: TSX、动态 import、注释跳过、Markdown 链接、空文件。
  - 错误路径: grammar 缺失、解析异常、超大文件、符号链接边界、旧存储格式读取失败。
  - 集成场景: 构建后 query 可正常读取并返回健康状态。
- [ ] 验证:
  - `npm run typecheck`
  - `npm test`
- [ ] 回滚信号 [可选]: 新测试无法稳定通过，或旧行为出现不可接受差异。

### U4. 清除旧实现与遗留抽取分支
- [ ] 目标: 在新实现和测试稳定后，删除旧的 compiler/regex 抽取实现和不再需要的辅助分支。
- [ ] 覆盖需求: R5
- [ ] 行为保持要求: 删除旧实现前必须确认新实现已经覆盖全部保留行为和新增 AST 行为；旧格式兼容代码、旧迁移代码和历史债务代码应一并清理。
- [ ] 依赖: U1、U2、U3 全部完成。
- [ ] 文件:
  - `src/services/graph-parse-service.ts`
  - 与旧抽取路径直接耦合的辅助代码
- [ ] 方法:
  - 删除旧的 TypeScript compiler AST 直接抽取和 regex 兜底逻辑。
  - 保留不属于抽取本体的文件收集、安全检查、存储接口和查询契约。
  - 清理因此变成孤儿的导入、类型和测试桩，以及为兼容旧格式而存在的迁移分支。
- [ ] 需遵循的模式:
  - 一次性替换旧实现
  - 不保留兼容层
  - 删除完成后再做最终回归
- [ ] 测试场景:
  - 正常路径: 删除旧代码后全量测试仍通过。
  - 边界情况: 旧测试中依赖的行为由新实现接管，不要求旧存储格式继续可读。
  - 错误路径: 若删除导致缺失能力或出现历史兼容残留，可通过测试快速定位。
  - 集成场景: 入口、存储和查询链路保持一致。
- [ ] 验证:
  - `npm run typecheck`
  - `npm test`
- [ ] 回滚信号 [可选]: 删除后出现无法快速修复的行为缺口或构建失败。

## 风险与应对
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| tree-sitter 资产加载失败 | 插件用户环境无法解析代码 | 先做运行时定位测试，确保 bridge + dist 可加载 |
| AST 抽取覆盖不足 | 图谱关系变少或变形 | 先补特征化测试，再替换主路径 |
| 关系映射不一致 | query 结果失真 | 统一在 schema 映射层处理，不在多处散落规则 |
| 旧实现删除过早 | 解析能力回退 | 先完成并通过 U1-U3，再执行 U4 |
| 多语言解析成本过高 | 构建变慢 | 保留文件大小上限和失败降级，必要时分阶段迁移 |

## 待定问题

### 执行前需解决
- Q1. 首批要支持哪些语言解析器：只保留当前仓库实际需要的语言，还是同步覆盖更多 tree-sitter 语言？
- Q2. 是否需要在本次重构中同时整理 graph parser 的模块拆分，还是先保持单服务内替换？

### 推迟到执行
- Q3. 运行时 tree-sitter 资产的最终放置路径与打包策略。
- Q4. 是否需要新增 parser stats 的更细粒度字段。

## 等价性检查
- implementationUnitsCount: 4
- tracedRequirementsCount: 5
- decisionsCount: 4
- risksCount: 5
