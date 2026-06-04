---
name: ae:swagger-parser
description: 解析 Swagger/OpenAPI JSON/YAML 并输出接口联调摘要
argument-hint: "[source] [method] [path] [tag=TAG] [keyword=TEXT] [mode]"
---

# Skill: ae:swagger-parser

解析工作区内或远程 HTTP(S) 的 Swagger/OpenAPI JSON/YAML，输出用于接口联调的概览或详情摘要。

## 使用场景

- 用户提供 Swagger 2.0 或 OpenAPI 3.0/3.1 JSON/YAML 文件，需要快速了解接口列表。
- 用户需要查看单个接口的路径参数、查询参数、请求头、请求体字段、认证方式和响应结构。
- 用户使用 `method`、`path`、`tag` 或 `keyword` 缩小接口范围。

## 参数

- `source`：必填，本地 JSON/YAML 路径或 HTTP(S) URL。
- `method`：可选，HTTP 方法，例如 `GET`、`POST`。
- `path`：可选，OpenAPI path 模板，例如 `/pets/{id}`。
- `tag`：可选，标签名。
- `keyword`：可选，搜索 path、summary、description、operationId。
- `mode`：可选，`overview` 或 `detail`。

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型（仅在参数意图上下文中生效）

   | 值模式 | 推断为 |
   |--------|--------|
   | http:// 或 https:// 开头或含文件扩展名 | source |
   | GET / POST / PUT / DELETE / PATCH 等大写 | method |
   | / 开头含 { } 或路径参数 | path |
   | overview / detail | mode |

   ❌ 否定示例：`user` 无前缀时不推断为 tag 或 keyword
   约束：tag 与 keyword 值域重叠，必须使用 `tag=xxx` 或 `keyword=xxx` 显式消歧；无前缀自由文本不推断为 tag 或 keyword

3. 顺序兜底：`source → method → path → mode`（tag 和 keyword 不参与顺序兜底）

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `source=./api.json mode=detail`），不依赖值特征推断。

## 行为边界

- 无筛选时输出概览。
- `method + path` 唯一命中时输出接口详情。
- 非 `method + path` 的唯一命中默认仍输出概览；显式 `mode=detail` 才输出详情。
- 多命中默认输出候选概览；显式 `mode=detail` 且不超过 5 个接口时输出有限多接口请求摘要。
- 支持 JSON/YAML 主文档；Swagger UI HTML 页面只提示用户提供真实 JSON/YAML 规格地址，不自动爬取。
- 远程 `$ref` 默认不展开；本地相对文件 `$ref` 仅在安全边界内支持或降级。
- 首版不生成 SDK、类型定义、测试脚手架，也不自动请求业务接口。

## 工具调用

使用 `ae-swagger-parser` 工具，并传入结构化参数。不要把自然语言解析作为唯一入口。
