# Swagger 解析依赖决策

## 决策

首版不引入会自动解析外部 `$ref` 的 Swagger 解析依赖。解析与摘要走内部最小实现，`$ref` 只处理当前 JSON 文档内的 JSON Pointer。

## 边界

- 禁止默认启用外部 file resolver。
- 禁止默认启用外部 http resolver。
- 依赖不可用或策略不满足时退回内部 JSON Pointer resolver。
