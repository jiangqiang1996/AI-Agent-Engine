# 人设目录

14 个审查者人设，按常驻、跨领域条件性和技术栈条件性层级组织，外加 AE 专用代理和深度审计代理。编排器使用此目录为每次审查选择要派生的审查者。

## 常驻（4 个人设 + 2 个 AE 代理）

每次审查都会派生，无论 diff 内容如何。

**人设代理（结构化 JSON 输出）：**

| 人设 | 代理 | 关注点 |
|------|------|--------|
| `correctness` | `correctness-reviewer` | 逻辑错误、边界情况、状态 bug、错误传播、意图符合度 |
| `testing` | `testing-reviewer` | 覆盖缺口、弱断言、脆弱测试、缺失边界测试 |
| `maintainability` | `maintainability-reviewer` | 耦合、复杂度、命名、死代码、过早抽象 |
| `project-standards` | `project-standards-reviewer` | AGENTS.md 合规性——frontmatter、引用、命名、跨平台可移植性、工具选择 |

**AE 代理（非结构化输出，单独综合）：**

| 代理 | 关注点 |
|------|--------|
| `agent-native-reviewer` | 验证新功能是否可被代理访问 |
| `learnings-researcher` | 搜索 docs/solutions/ 查找与此 PR 模块和模式相关的历史问题 |

## 条件性（8 个人设）

当编排器在 diff 中识别到相关模式时派生。编排器阅读完整 diff 并推理选择——这是代理判断，不是关键词匹配。

| 人设 | 代理 | 选择条件：diff 涉及... |
|------|------|----------------------|
| `security` | `security-reviewer` | 认证中间件、公共端点、用户输入处理、权限检查、密钥管理 |
| `performance` | `performance-reviewer` | 数据库查询、ORM 调用、循环密集型数据转换、缓存层、异步/并发代码 |
| `api-contract` | `api-contract-reviewer` | 路由定义、序列化器/接口变更、事件 schema、导出类型签名、API 版本管理 |
| `data-migrations` | `data-migrations-reviewer` | 迁移文件、schema 变更、回填脚本、数据转换 |
| `reliability` | `reliability-reviewer` | 错误处理、重试逻辑、熔断器、超时、后台任务、异步处理器、健康检查 |
| `adversarial` | `adversarial-reviewer` | diff 包含 >=50 行可执行代码变更（不包括散文/说明性 Markdown、JSON schema 或配置），或涉及认证、支付、数据变更、外部 API 集成或其他高风险领域（无论文件类型） |
| `cli-readiness` | `cli-readiness-reviewer` | CLI 命令定义、参数解析、CLI 框架使用、命令处理器实现 |
| `previous-comments` | `previous-comments-reviewer` | **仅限 PR。** 审查具有先前审查轮次评论或评论线程的 PR。当阶段 1 中未收集到 PR 元数据时完全跳过。 |

## 技术栈条件性（5 个人设）

这些审查者保持其原有的偏重视角。它们与上述跨领域人设互补，而非替代。

| 人设 | 代理 | 选择条件：diff 涉及... |
|------|------|----------------------|
| `kieran-typescript` | `kieran-typescript-reviewer` | TypeScript 组件、服务、hooks、工具函数或共享类型 |

## 深度审计代理

条件性人设提供 diff 级别的快速反馈。当 diff 涉及复杂或高风险领域时，编排器可额外派生以下深度审计代理进行完整分析：

| 代理 | 关注点 | 选择条件 |
|------|--------|----------|
| `cli-agent-readiness-reviewer` | 基于 7 项核心原则对 CLI 代码进行深度 agent 就绪审计：结构化输出、JSON 默认值、交互绕过、有界输出等 | diff 重度涉及 CLI 框架、命令定义或参数解析，且 `cli-readiness` 人设已发现值得深入分析的问题 |

`cli-readiness` 人设是 diff 级别的快速检查；`cli-agent-readiness-reviewer` 是完整深度审计。大多数 CLI 变更只需前者。仅在 CLI 变更复杂或 `cli-readiness` 已标记系统性问题时派生深度审计。

## 选择规则

1. **始终派生全部 4 个常驻人设** 加上 2 个 AE 常驻代理。
2. **对于每个跨领域条件性人设**，编排器阅读 diff 并判断该人设的领域是否相关。这是判断调用，不是关键词匹配。
3. **对于每个技术栈条件性人设**，以文件类型和变更模式为起点，然后判断 diff 是否确实为该审查者引入了有意义的工作。不要仅因为一个配置文件或生成文件碰巧匹配扩展名就派生语言特定审查者。
4. **对于 AE 条件性代理**，当 diff 包含迁移文件（`db/migrate/*.rb`、`db/schema.rb`）或数据回填脚本时派生。
5. **在派生前公布团队**，为每个被选中的条件性审查者提供一行理由。
6. **深度审计代理按需派生**，仅在对应条件性人设已发现值得深入分析的问题时触发。不要在每次审查中都派生深度审计代理。
