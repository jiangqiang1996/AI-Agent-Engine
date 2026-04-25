# 文件类型路由表

审查范围确定后，每个变更文件按扩展名/文件名匹配路由，确定审查者。

## 路由选择流程

1. **第一步**：文件格式 → 匹配路由组 → 确定基础审查者（确定性的、基于规则）
2. **第二步**：分析文件内容特征（大小、主题、深度）→ 代理判断激活条件审查者
3. 多个文件属于不同路由时，合并所有活跃审查者，去重后统一派发

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
- 受保护产物：docs/ae/review/* docs/ae/solutions/*
- 需求文档和计划文档：docs/ae/brainstorms/ 和 docs/ae/plans/ 下的文件——**默认排除，用户明确指定时纳入**

## 全局审查者

以下审查者跨所有路由激活（不限于特定文件类型）：

| 审查者 | 关注点 |
|--------|--------|
| `learnings-researcher` | 搜索 docs/ae/solutions/ 查找历史问题 |
| `agent-native-reviewer` | 验证新功能可被代理访问 |

## 路由定义

### 源代码路由

**匹配文件：** .ts .tsx .js .jsx .mjs .cjs .py .java .go .rs .c .cpp .h .rb .php .swift .kt .scala

**基础审查者：** correctness, testing, maintainability, project-standards

**条件审查者：**
- security — 认证、权限、用户输入
- performance — 数据库查询、数据转换、缓存
- api-contract — 路由、类型签名、版本
- reliability — 错误处理、重试、超时
- adversarial — >=50 行可执行代码或高风险
- cli-readiness — CLI 命令定义
- previous-comments — 仅 PR 模式
- kieran-typescript — .ts/.tsx 文件

### 配置路由

**匹配文件：** .json .yaml .yml .toml .xml

**基础审查者：** correctness, maintainability, project-standards

**条件审查者：**
- security — 密钥/权限配置

**领域代理：** `config-reviewer`

### 基础设施路由

**匹配文件：** Dockerfile docker-compose.* *.tf *.tfvars .github/workflows/* Makefile Jenkinsfile

**基础审查者：** correctness, maintainability, project-standards

**条件审查者：**
- security — 容器安全/CI 权限
- reliability — 错误处理/健康检查

**领域代理：** `infra-reviewer`

### 数据库路由

**匹配文件：** *.sql .prisma 迁移文件

**基础审查者：** correctness, maintainability, project-standards

**条件审查者：**
- data-migrations — schema 变更/迁移安全
- security — SQL 注入

**领域代理：** `database-reviewer`

### API 契约路由

**匹配文件：** .graphql .proto .openapi.* swagger.*

**基础审查者：** correctness, maintainability, project-standards

**条件审查者：**
- api-contract — 类型签名/版本/破坏性变更

### 样式/UI 路由

**匹配文件：** .css .scss .less .html .vue .svelte

**基础审查者：** correctness, maintainability

**条件审查者：**
- security — XSS/模板注入

### 脚本路由

**匹配文件：** .sh .bash .ps1 .bat .cmd

**基础审查者：** correctness, maintainability, project-standards

**条件审查者：**
- security — 注入/权限
- reliability — 错误处理/退出码

**领域代理：** `script-reviewer`

### 文档路由

**匹配文件：** .md .rst .adoc .org .txt

**排除：** docs/ae/brainstorms/ 和 docs/ae/plans/ 下的需求文档和计划文档默认排除——除非用户明确指定纳入，此时由 ae:document-review 审查后结果合并到统一报告。

**处理方式：** 需求/计划之外的文档文件委派给 ae-document-review 技能。ae-review 通过 `Skill("ae:document-review", "mode:headless <文件路径>")` 调用，由 ae-document-review 负责文档审查的完整流程。

审查者选择、条件激活、发现综合全部由 ae-document-review 处理，ae-review 只负责合并返回结果。

### 兜底路由

**匹配文件：** 不匹配任何路由的文件

**基础审查者：** correctness, maintainability, project-standards

**条件审查者：** 无
