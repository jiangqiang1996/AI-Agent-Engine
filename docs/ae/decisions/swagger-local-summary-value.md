# Swagger 本地摘要价值门

## 结论

通过。OpenAPI 3 概览和 Swagger 2 单接口详情 golden output 能回答联调所需的核心问题：怎么调用、必填参数是什么、认证方式是什么、成功响应关键字段是什么、常见错误响应是什么。

## 证据

- `tests/fixtures/swagger/golden/openapi-3-overview.md`
- `tests/fixtures/swagger/golden/swagger-2-detail.md`
- `npm run test -- tests/services/swagger-parser-service.test.ts tests/services/swagger-summary-service.test.ts`
