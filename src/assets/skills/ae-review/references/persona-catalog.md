# 代理清单

所有审查子代理位于 `src/assets/agents/reviewers/` 目录下，全并行调度，只找问题不做修复。

## 代理列表

| 代理 | 职责 | 激活条件 |
|------|------|---------|
| `ocr-reviewer` | 代码审查引擎：通过 ae-ocr 工具覆盖 bug/安全/性能/可维护性/测试覆盖/规范/对抗式 | 范围包含代码文件 |
| `document-reviewer` | 通用文档审查：内部一致性、可行性、证据核验 | 范围包含文档文件 |
| `architecture-design-reviewer` | 架构维度：模块边界、依赖方向、分层规则、数据流 | 文档涉及架构 |
| `api-design-reviewer` | API 维度：端点契约、接口定义、版本策略、幂等性 | 文档涉及 API |
| `database-design-reviewer` | 数据库维度：ER 模型、表结构、外键、迁移策略 | 文档涉及数据模型 |
| `ui-ux-design-reviewer` | UI/UX 维度：信息架构、页面规格、组件契约、交互状态机 | 文档涉及 UI |
| `test-cases-design-reviewer` | 测试用例维度：覆盖矩阵、P0-P3 用例、行为契约 | 文档涉及测试用例 |
| `security-design-reviewer` | 安全维度：威胁模型、信任边界、认证授权、数据分级、密钥管理 | 文档涉及安全 |
| `observability-design-reviewer` | 可观测性维度：日志规范、指标体系、告警规则、SLO/SLI | 文档涉及可观测性 |
| `non-functional-design-reviewer` | 非功能维度：性能目标、并发模型、事务边界、缓存策略 | 文档涉及非功能需求 |
| `design-integrity-reviewer` | 跨维度完整性：冲突检测、字段匹配、映射表完整性 | `ae/designs/` 下 2+ 维度产物 |
| `traceability-reviewer` | 跨文档追溯：锚点覆盖、断裂引用、孤儿条目 | 范围包含 2+ 类项目文档（需求 ae/prds/、设计 ae/designs/、测试 tests/ 目录下） |
| `goal-alignment-reviewer` | 目标对齐：对照审查目标逐条校验变更是否达成 | 始终激活（用户显式传入 goals 时透传，否则工具自动推断） |

## 选择规则

代理选择由 `ae-review-scope-analyze` 工具内部完成，编排层不自行判断：

1. 按文件后缀分类，确定基础代理（ocr-reviewer / document-reviewer）
2. `ae/designs/` 下的设计文档通过路径关键词匹配激活对应维度代理
3. 非设计文档通过工具内部子会话分析文件内容，识别涉及的维度并激活对应代理
4. 始终激活 goal-alignment-reviewer；用户未显式传入 goals 时由工具自动从上下文和变更文件推断审查目标
5. 所有激活代理在同一轮一次性并行派发，不分批次
6. 代理只找问题不做修复，修复由合并层统一处理
7. 每个代理只收到与其职责相关的文件列表（由工具分配）
