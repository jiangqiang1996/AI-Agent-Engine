# 人设目录

17 个审查者人设，按常驻、跨领域条件性和技术栈条件性层级组织，外加 AE 专用代理。编排器使用此目录为每次审查选择要派生的审查者。

## 常驻（4 个人设 + 2 个 AE 代理）

每次审查都会派生，无论 diff 内容如何。

**人设代理（结构化 JSON 输出）：**

| 人设 | 代理 | 关注点 |
|------|------|--------|
| `correctness` | `ae:review:correctness-reviewer` | 逻辑错误、边界情况、状态 bug、错误传播、意图符合度 |
| `testing` | `ae:review:testing-reviewer` | 覆盖缺口、弱断言、脆弱测试、缺失边界测试 |
| `maintainability` | `ae:review:maintainability-reviewer` | 耦合、复杂度、命名、死代码、过早抽象 |
| `project-standards` | `ae:review:project-standards-reviewer` | AGENTS.md 合规性——frontmatter、引用、命名、跨平台可移植性、工具选择 |

**AE 代理（非结构化输出，单独综合）：**

| 代理 | 关注点 |
|------|--------|
| `ae:review:agent-native-reviewer` | 验证新功能是否可被代理访问 |
| `ae:research:learnings-researcher` | 搜索 docs/solutions/ 查找与此 PR 模块和模式相关的历史问题 |

## 条件性（8 个人设）

当编排器在 diff 中识别到相关模式时派生。编排器阅读完整 diff 并推理选择——这是代理判断，不是关键词匹配。

| 人设 | 代理 | 选择条件：diff 涉及... |
|------|------|----------------------|
| `security` | `ae:review:security-reviewer` | 认证中间件、公共端点、用户输入处理、权限检查、密钥管理 |
| `performance` | `ae:review:performance-reviewer` | 数据库查询、ORM 调用、循环密集型数据转换、缓存层、异步/并发代码 |
| `api-contract` | `ae:review:api-contract-reviewer` | 路由定义、序列化器/接口变更、事件 schema、导出类型签名、API 版本管理 |
| `data-migrations` | `ae:review:data-migrations-reviewer` | 迁移文件、schema 变更、回填脚本、数据转换 |
| `reliability` | `ae:review:reliability-reviewer` | 错误处理、重试逻辑、熔断器、超时、后台任务、异步处理器、健康检查 |
| `adversarial` | `ae:review:adversarial-reviewer` | diff 包含 >=50 行可执行代码变更（不包括散文/说明性 Markdown、JSON schema 或配置），或涉及认证、支付、数据变更、外部 API 集成或其他高风险领域（无论文件类型） |
| `cli-readiness` | `ae:review:cli-readiness-reviewer` | CLI 命令定义、参数解析、CLI 框架使用、命令处理器实现 |
| `previous-comments` | `ae:review:previous-comments-reviewer` | **仅限 PR。** 审查具有先前审查轮次评论或评论线程的 PR。当阶段 1 中未收集到 PR 元数据时完全跳过。 |

## 技术栈条件性（5 个人设）

这些审查者保持其原有的偏重视角。它们与上述跨领域人设互补，而非替代。

| 人设 | 代理 | 选择条件：diff 涉及... |
|------|------|----------------------|
| `dhh-rails` | `ae:review:dhh-rails-reviewer` | Rails 架构、服务对象、认证/会话选择、Hotwire vs SPA 边界，或可能违背 Rails 惯例的抽象 |
| `kieran-rails` | `ae:review:kieran-rails-reviewer` | Rails 控制器、模型、视图、任务、组件、路由或其他注重清晰度和惯例的应用层 Ruby 代码 |
| `kieran-python` | `ae:review:kieran-python-reviewer` | Python 模块、端点、服务、脚本或带类型的领域代码 |
| `kieran-typescript` | `ae:review:kieran-typescript-reviewer` | TypeScript 组件、服务、hooks、工具函数或共享类型 |
| `julik-frontend-races` | `ae:review:julik-frontend-races-reviewer` | Stimulus/Turbo 控制器、DOM 事件绑定、定时器、异步 UI 流程、动画或有竞态风险的前端状态转换 |

## AE 条件性代理（迁移专用）

这些 AE 原生代理提供超出人设代理覆盖范围的专业分析。当 diff 包含数据库迁移、schema.rb 或数据回填时派生它们。

| 代理 | 关注点 |
|------|--------|
| `ae:review:schema-drift-detector` | 交叉对比 schema.rb 变更与包含的迁移，捕获无关漂移 |
| `ae:review:deployment-verification-agent` | 生成 Go/No-Go 部署检查清单，包含 SQL 验证查询和回滚步骤 |

## 选择规则

1. **始终派生全部 4 个常驻人设** 加上 2 个 AE 常驻代理。
2. **对于每个跨领域条件性人设**，编排器阅读 diff 并判断该人设的领域是否相关。这是判断调用，不是关键词匹配。
3. **对于每个技术栈条件性人设**，以文件类型和变更模式为起点，然后判断 diff 是否确实为该审查者引入了有意义的工作。不要仅因为一个配置文件或生成文件碰巧匹配扩展名就派生语言特定审查者。
4. **对于 AE 条件性代理**，当 diff 包含迁移文件（`db/migrate/*.rb`、`db/schema.rb`）或数据回填脚本时派生。
5. **在派生前公布团队**，为每个被选中的条件性审查者提供一行理由。
