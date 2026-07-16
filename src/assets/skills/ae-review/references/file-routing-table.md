# 文件类型路由表

审查范围确定后，每个变更文件按扩展名/路径匹配路由，确定路由代理。13 代理全并行架构下，路由表决定激活哪些代理，所有激活代理在同一轮一次性并行派发。

## 路由选择流程

1. **第一步**：文件格式/路径 → 匹配路由组 → 确定路由代理（确定性的、基于规则）
2. **第二步**：分析文件内容特征 → 代理判断激活条件代理
3. 多个文件属于不同路由时，合并所有活跃代理，去重后统一并行派发

## 全局排除

以下文件不进入审查：

- 图片：.png .jpg .gif .svg .ico .webp .bmp
- 字体：.woff .woff2 .ttf .eot .otf
- 媒体：.mp3 .mp4 .wav .avi .mov .webm
- 压缩包：.zip .tar .gz .rar .7z
- 数据：.csv .xlsx .xls .pdf .doc .docx
- 锁文件：package-lock.json yarn.lock pnpm-lock.yaml
- 密钥：.env .env.*（保留 .env.example .env.template）——**在文件收集阶段即从变更文件列表中移除，后续任何阶段不可读取或引用这些文件的内容**
- 运行时目录：.opencode/ 下的所有文件——**始终排除，不可覆盖**
- 受保护产物：ae/reviews/* ae/solutions/*

## 路由定义

### 源代码路由

**匹配文件：** .ts .tsx .js .jsx .mjs .cjs .py .java .go .rs .c .cpp .h .rb .php .swift .kt .scala

**路由代理：** `ocr-reviewer`

### 测试代码路由

**匹配文件：** *.test.* *_test.* *.spec.* *.bench.*

**路由代理：** `ocr-reviewer`

### 配置文件路由

**匹配文件：** .json .yaml .yml .toml .ini .xml

**路由代理：** `ocr-reviewer` + `document-reviewer`

### 需求文档路由

**匹配路径：** ae/prds/**

**路由代理：** `document-reviewer`

**说明：** 默认排除，用户明确指定时纳入。

### 设计文档路由

**匹配路径：** ae/designs/**

**路由代理：** `document-reviewer` + 对应维度代理 + `design-integrity-reviewer`

**维度代理激活条件：** 根据设计文档内容自动识别涉及的维度，激活对应维度代理：
- 涉及模块/分层 → `architecture-design-reviewer`
- 涉及接口/端点 → `api-design-reviewer`
- 涉及数据模型/表结构 → `database-design-reviewer`
- 涉及页面/组件/交互 → `ui-ux-design-reviewer`
- 涉及测试用例/覆盖 → `test-cases-design-reviewer`
- 涉及认证/权限/密钥 → `security-design-reviewer`
- 涉及日志/监控/告警 → `observability-design-reviewer`
- 涉及性能/并发/容量 → `non-functional-design-reviewer`

**说明：** 默认排除，用户明确指定时纳入。

### 通用文档路由

**匹配文件：** .md .rst .adoc .org .txt

**排除：** ae/prds/ 和 ae/designs/ 下的文件（见需求文档路由和设计文档路由）

**路由代理：** `document-reviewer`

### 基础设施路由

**匹配文件：** Dockerfile docker-compose.* *.tf *.tfvars .github/workflows/* Makefile Jenkinsfile

**路由代理：** `ocr-reviewer` + `document-reviewer`

### 数据库路由

**匹配文件：** *.sql .prisma 迁移文件

**路由代理：** `ocr-reviewer`

### API 契约路由

**匹配文件：** .graphql .proto .openapi.* swagger.*

**路由代理：** `ocr-reviewer`

### 脚本路由

**匹配文件：** .sh .bash .ps1 .bat .cmd

**路由代理：** `ocr-reviewer`

### 图片/字体/媒体路由

**匹配文件：** 见全局排除

**路由代理：** 排除

### 兜底路由

**匹配文件：** 不匹配任何路由的文件

**路由代理：** `ocr-reviewer` + `document-reviewer`

## 全局代理

以下代理跨所有路由按条件激活：

| 代理 | 激活条件 |
|--------|--------|
| `traceability-reviewer` | 需求/设计/代码同时存在时激活 |
| `goal-alignment-reviewer` | 仅当 `goals=` 参数提供审查目标时激活 |
