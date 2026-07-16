# 人设目录

13 代理全并行架构。所有激活代理在同一轮一次性发出 Task 调用，只找问题不做修复。与文件类型路由表（`references/file-routing-table.md`）配合使用——路由表决定哪些代理参与，本目录描述每个代理的关注点。

## 代理列表

| 代理 | 人设描述 |
|------|---------|
| `ocr-reviewer` | OCR 代码审查引擎：通过 ae-ocr 工具调用 OpenCodeReview CLI 审查全部代码（含测试、配置），注入项目级规则和对抗性审查规则 |
| `document-reviewer` | 通用文档审查代理：类型路由→加载框架→执行原语，审查任意文本类型文件的文档属性 |
| `architecture-design-reviewer` | 架构维度审查：模块边界、依赖方向、分层规则、数据流、错误传播链 |
| `api-design-reviewer` | API 维度审查：端点清单、接口定义、认证授权、错误码、版本策略、幂等性 |
| `database-design-reviewer` | 数据库维度审查：ER 模型、表结构、外键关系、迁移策略、敏感字段 |
| `ui-ux-design-reviewer` | UI/UX 维度审查：信息架构、页面规格、组件契约、设计 Token、交互状态机、无障碍 |
| `test-cases-design-reviewer` | 测试用例维度审查：覆盖矩阵、P0-P3 用例、行为契约、维度覆盖追溯 |
| `security-design-reviewer` | 安全维度审查：威胁模型、信任边界、认证授权流程、数据分级、密钥管理 |
| `observability-design-reviewer` | 可观测性维度审查：日志规范、指标体系、告警规则、健康检查、SLO/SLI |
| `non-functional-design-reviewer` | 非功能维度审查：性能目标、并发模型、事务边界、缓存策略、容量规划 |
| `design-integrity-reviewer` | 完整性与确定性审查：跨维度冲突、字段匹配、映射表完整性、维度间引用一致性 |
| `traceability-reviewer` | 跨域追溯：需求→设计→代码的锚点覆盖、断裂引用、孤儿条目 |
| `goal-alignment-reviewer` | 目标对齐：对照审查目标逐条校验变更是否达成 |

## 代理分类

### 代码审查代理

- `ocr-reviewer` — 审查全部代码变更，包括源代码、测试代码、配置文件、脚本

### 文档审查代理

- `document-reviewer` — 审查任意文本类型文档的文档属性

### 设计维度审查代理

以下代理在设计文档审查时按维度并行激活：

- `architecture-design-reviewer`
- `api-design-reviewer`
- `database-design-reviewer`
- `ui-ux-design-reviewer`
- `test-cases-design-reviewer`
- `security-design-reviewer`
- `observability-design-reviewer`
- `non-functional-design-reviewer`

### 跨域审查代理

- `design-integrity-reviewer` — 设计文档存在时激活，核验跨维度一致性
- `traceability-reviewer` — 需求/设计/代码同时存在时激活，核验追溯链
- `goal-alignment-reviewer` — 仅当 `goals=` 参数提供审查目标时激活

## 选择规则

1. 路由表决定哪些代理参与（按文件类型）
2. 所有激活代理在同一轮一次性并行派发，不分批次
3. 代理只找问题不做修复，修复由合并层和修复流程统一处理
4. 在派发前公布团队并附理由
