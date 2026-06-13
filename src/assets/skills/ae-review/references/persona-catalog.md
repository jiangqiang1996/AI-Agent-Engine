# 人设目录

审查者人设按常驻、跨领域条件性和技术栈条件性层级组织。与文件类型路由表（`references/file-routing-table.md`）配合使用——路由表决定哪些审查者参与，本目录描述每个审查者的关注点。

## 常驻（代码路由）

每次代码路由审查都会派发。

| 人设 | 代理 | 关注点 |
|------|------|--------|
| `correctness` | `correctness-reviewer` | 逻辑错误、边界情况、状态 bug、错误传播 |
| `testing` | `testing-reviewer` | 覆盖缺口、弱断言、脆弱测试 |
| `maintainability` | `maintainability-reviewer` | 耦合、复杂度、命名、死代码、脚本可移植性 |
| `standards` | `standards-reviewer` | AGENTS.md 合规性、配置文件语法正确性、schema 一致性、敏感值检测 |

## 条件性（跨领域）

当 diff 中识别到相关模式时派发。具体激活条件见路由表。

| 人设 | 选择条件：diff 涉及... |
|------|----------------------|
| `security` | 认证、公共端点、用户输入、权限 |
| `performance` | 数据库查询、数据转换、缓存、异步 |
| `api-contract` | 路由、序列化器、类型签名、版本控制 |
| `data-migrations` | 迁移、schema 变更、回填、数据库变更 |
| `reliability` | 错误处理、重试、超时、后台任务、基础设施定义 |
| `architecture-strategist` | 架构决策、新抽象或较大结构性变更 |
| `adversarial` | >=50 行可执行代码变更、高风险领域或新抽象 |
| `goal-alignment` | 提供了审查目标（goals= 参数），对照成功条件逐条校验变更是否达成，识别未达成项和偏离 |
| `previous-comments` | **仅限 PR** — 有先前审查评论的 PR |

## AE 代理

| 代理 | 关注点 |
|------|--------|
| `agent-native-reviewer` | 在涉及 CLI、UI、工具或代理配置时验证新功能可被代理访问、CLI 就绪度 |
| `research-reviewer` | 搜索历史方案、最佳实践和框架文档 |

## 选择规则

1. 路由表决定哪些审查者参与（按文件类型）
2. 条件性人设是代理判断，不是关键词匹配
3. 在派发前公布团队并附理由
