# 角色卡目录

本技能的多角色协作采用**角色卡**模式：每个审查角色写成一张独立卡片，位于 `references/roles/<role>.md`，
包含 5 个固定小节——职责 / 触发条件 / 输入契约 / 输出契约 / 工作流。

所有激活的角色卡全并行调度（或在宿主不支持子代理派发时顺序执行），**只找问题不做修复**。

## 角色卡列表

| 角色卡名 | 职责 | 触发条件 | 角色卡文件 |
|----------|------|----------|------------|
| `ocr-reviewer` | 代码审查引擎：覆盖 bug / 安全 / 性能 / 可维护性 / 测试覆盖 / 规范 / 对抗式 | 范围包含代码文件 | [references/roles/ocr-reviewer.md](roles/ocr-reviewer.md) |
| `document-reviewer` | 通用文档审查：内部一致性、可行性、证据核验 | 范围包含文档文件 | [references/roles/document-reviewer.md](roles/document-reviewer.md) |
| `architecture-design-reviewer` | 架构维度：模块边界、依赖方向、分层规则、数据流 | 文档涉及架构 | [references/roles/architecture-design-reviewer.md](roles/architecture-design-reviewer.md) |
| `api-design-reviewer` | API 维度：端点契约、接口定义、版本策略、幂等性 | 文档涉及 API | [references/roles/api-design-reviewer.md](roles/api-design-reviewer.md) |
| `database-design-reviewer` | 数据库维度：ER 模型、表结构、外键、迁移策略 | 文档涉及数据模型 | [references/roles/database-design-reviewer.md](roles/database-design-reviewer.md) |
| `ui-ux-design-reviewer` | UI/UX 维度：信息架构、页面规格、组件契约、交互状态机 | 文档涉及 UI | [references/roles/ui-ux-design-reviewer.md](roles/ui-ux-design-reviewer.md) |
| `test-cases-design-reviewer` | 测试用例维度：覆盖矩阵、P0-P3 用例、行为契约 | 文档涉及测试用例 | [references/roles/test-cases-design-reviewer.md](roles/test-cases-design-reviewer.md) |
| `security-design-reviewer` | 安全维度：威胁模型、信任边界、认证授权、数据分级、密钥管理 | 文档涉及安全 | [references/roles/security-design-reviewer.md](roles/security-design-reviewer.md) |
| `observability-design-reviewer` | 可观测性维度：日志规范、指标体系、告警规则、SLO/SLI | 文档涉及可观测性 | [references/roles/observability-design-reviewer.md](roles/observability-design-reviewer.md) |
| `non-functional-design-reviewer` | 非功能维度：性能目标、并发模型、事务边界、缓存策略、容量规划 | 文档涉及非功能需求 | [references/roles/non-functional-design-reviewer.md](roles/non-functional-design-reviewer.md) |
| `design-integrity-reviewer` | 跨维度完整性：冲突检测、字段匹配、映射表完整性 | `ae/design/` 的 `modules/<NN>-<m>/` 下存在 2+ 维度文件 | [references/roles/design-integrity-reviewer.md](roles/design-integrity-reviewer.md) |
| `traceability-reviewer` | 跨文档追溯：锚点覆盖、断裂引用、孤儿条目 | 范围包含 2+ 类项目文档（需求 `ae/prd/`、设计 `ae/design/`、测试 `tests/` 目录下） | [references/roles/traceability-reviewer.md](roles/traceability-reviewer.md) |
| `goal-alignment-reviewer` | 目标对齐：对照审查目标逐条校验变更是否达成 | 始终激活（用户显式传入 goals 时透传，否则脚本自动推断） | [references/roles/goal-alignment-reviewer.md](roles/goal-alignment-reviewer.md) |

## 角色卡通用约定

所有角色卡共享以下硬性规则：

- **只找问题，不做修复**。不编辑项目文件，不改变仓库状态，不调用其他技能。
- 每条发现必须包含至少一项基于实际代码/内容的证据。
- 不输出置信度低于 0.60 的发现（0.50+ 的 P0 除外）。
- 主动抑制：与本次变更无关的预存问题、格式化/lint 能捕获的琐碎问题、看似错误实则有意为之的写法、代码库其他位置已处理的问题、没有具体故障模式的泛泛建议。
- 属于其他角色卡维度的问题不重复标记。
- 因果标注：修复 A 会自动消除 B 时，A 的 `causes` 填 B 标识，B 的 `caused_by` 填 A 标识；无法确定时留空数组。
- 未发现问题返回空 `findings` 数组。

字段定义见 [findings-schema.json](findings-schema.json)，派发提示模板见 [subagent-template.md](subagent-template.md)。

## 选择规则

角色卡选择由 `scripts/scope-analyze.mjs` 内部完成，编排层不自行判断：

1. 按文件后缀分类，确定基础角色卡（`ocr-reviewer` / `document-reviewer`）
2. `ae/design/` 下的设计文档通过路径关键词匹配激活对应维度角色卡
3. 非设计文档通过脚本内部的内容分析识别涉及的维度并激活对应角色卡
4. 始终激活 `goal-alignment-reviewer`；用户未显式传入 goals 时由脚本自动从上下文和变更文件推断审查目标
5. 所有激活角色卡在同一轮一次性并行派发，不分批次；宿主不支持子代理派发时按同一顺序顺序执行
6. 角色卡只找问题不做修复，修复由合并层统一处理
7. 每张角色卡只收到与其职责相关的文件列表（由脚本分配）

文件类型到角色卡的映射见 [file-routing-table.md](file-routing-table.md)。
