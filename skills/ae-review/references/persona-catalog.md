# 人设目录

审查者人设按常驻、跨领域条件性和技术栈条件性层级组织。

## 常驻（4 个人设 + 2 个 AE 代理）

每次审查都会派发。

| 人设 | 代理 | 关注点 |
|------|------|--------|
| `correctness` | `correctness-reviewer` | 逻辑错误、边界情况、状态 bug、错误传播 |
| `testing` | `testing-reviewer` | 覆盖缺口、弱断言、脆弱测试 |
| `maintainability` | `maintainability-reviewer` | 耦合、复杂度、命名、死代码 |
| `project-standards` | `project-standards-reviewer` | AGENTS.md 合规性 |

**AE 代理：**

| 代理 | 关注点 |
|------|--------|
| `agent-native-reviewer` | 验证新功能可被代理访问 |
| `learnings-researcher` | 搜索 docs/ae/solutions/ 查找历史问题 |

## 条件性（8 个人设）

当 diff 中识别到相关模式时派发。

| 人设 | 选择条件：diff 涉及... |
|------|----------------------|
| `security` | 认证、公共端点、用户输入、权限 |
| `performance` | 数据库查询、数据转换、缓存、异步 |
| `api-contract` | 路由、序列化器、类型签名、版本控制 |
| `data-migrations` | 迁移、schema 变更、回填 |
| `reliability` | 错误处理、重试、超时、后台任务 |
| `adversarial` | >=50 行可执行代码变更，或高风险领域 |
| `cli-readiness` | CLI 命令定义、参数解析 |
| `previous-comments` | **仅限 PR** — 有先前审查评论的 PR |

## 技术栈条件性

| 人设 | 选择条件 |
|------|----------|
| `kieran-typescript` | TypeScript 组件、服务、hooks、类型 |

## 深度审计代理

| 代理 | 选择条件 |
|------|----------|
| `cli-agent-readiness-reviewer` | `cli-readiness` 已发现系统性问题 |

## 选择规则

1. 始终派发全部 4 个常驻人设 + 2 个 AE 代理
2. 条件性人设是代理判断，不是关键词匹配
3. 技术栈人设以变更模式为起点
4. 在派发前公布团队并附理由
5. 深度审计代理按需派发
