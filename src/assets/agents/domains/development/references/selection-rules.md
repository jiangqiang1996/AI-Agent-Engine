# 开发域选择规则

本文档描述开发域代理如何选择开发专精代理。

**优先使用预计算结果**：当 `DomainCallRequest.selectedSpecialists` 存在且非空时，以其为权威选择，不再独立评估条件。

## 选择规则

| 任务关键词 | 选中专精代理 |
|-----------|------------|
| 前端、UI、组件、样式、交互、响应式、页面 | frontend-dev |
| API、数据库、服务、后端、接口、数据层、中间件 | backend-dev |
| 调试、修复、Bug、错误、异常、崩溃 | debug-fix |
| 重构、优化、技术债、架构改进、模式改进 | 按模块联合 frontend-dev/backend-dev，或由 debug-fix 兜底 |

## 组合规则

- 任务同时涉及前后端时，选择 frontend-dev + backend-dev 并行执行
- Bug 修复涉及前端或后端时，debug-fix 优先，按需联合 frontend-dev 或 backend-dev
- 重构任务按模块联合 frontend-dev/backend-dev 处理，或由 debug-fix 兜底
- 无法匹配任何专精时，优先使用 `DomainCallRequest.selectedSpecialists` 中的兜底选择；若该字段缺失，返回 failed 状态

## 兜底策略

当关键词匹配和 flags 匹配均无法命中任何专精代理时，按以下两层兜底选择：

1. **第一层（flags 兜底）**：检查 `domainContext.hasUi`/`hasApi`/`hasDatabase` 等 flags，按 flags 匹配专精代理
2. **第二层（最终兜底）**：选中 debug-fix 作为最通用的开发动作，比返回 failed 更好

## 常驻规则

开发域无常驻专精代理，所有专精均根据任务关键词条件激活。
