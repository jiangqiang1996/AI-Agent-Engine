# 设计产物输出模板

## 核心原则：总览层按方向拆分 + 模块层按维度拆分

- 产物采用总览层独立文件 + 模块级独立文件两层结构
- `overview.md` 包含设计读数、跨模块一致性约束、模块清单与边界
- 各全局方向独立文件（`architecture.md` / `security.md` / `observability.md` / `non-functional.md` / `design-spec.md`（由 `@ui-designer` mode=spec 产出） / `constraints.md` / `cross-mapping.md`）位于设计目录根下
- `modules/` 下按模块组织，每个模块位于 `modules/<NN>-<m>/` 子目录，含 `api.md` / `database.md` / `ui-ux.md` / `test-cases.md` 独立维度文件；涉及 UI 时含 `pages/` 目录下各页面独立文件
- 全程无中间大文件，避免 AI 上下文爆炸

## 产物目录结构

设计契约产出在 `ae/designs/<topic>-YYYY-MM-DD/` 目录下：

```
ae/designs/
└── user-auth-2026-06-24/
    ├── overview.md                     # 设计读数、跨模块一致性约束、模块清单
    ├── architecture.md                 # 系统架构
    ├── security.md                     # 安全（可选）
    ├── observability.md                # 可观测性（可选）
    ├── non-functional.md               # 非功能（可选）
    ├── design-spec.md                  # 设计规范（可选，涉及 UI 时）
    ├── constraints.md                  # 实施约束
    ├── cross-mapping.md                # 跨维度映射表
    └── modules/
        ├── 01-auth/
        │   ├── api.md                  # API 契约
        │   ├── database.md             # 数据库契约
        │   ├── ui-ux.md                # UI/UX 契约（路由表 + 设计 Token + 组件清单 + 组件定义 + 状态机 + 无障碍 + 组件复用策略）
        │   ├── pages/
        │   │   ├── 01-login.md         # 登录页 UI 规格
        │   │   └── 02-register.md      # 注册页 UI 规格
        │   └── test-cases.md           # 测试用例契约
        └── 02-resource/
            ├── api.md
            ├── database.md
            ├── ui-ux.md
            ├── pages/
            │   └── 01-resource-list.md
            └── test-cases.md
```

模块子目录名格式：`<NN>-<module-name>`，`<NN>` 为零填充两位数字序号（01、02、03、...），按 architecture.md 中模块划分顺序编号。

### "需求描述名"来源规则

- prd 文档作为输入时：从 prd 目录名提取（如 `ae/prds/user-auth-2026-06-24/overview.md` → `user-auth`）
- design 作为输入时：从 design 目录名提取（如 `ae/designs/user-auth-2026-06-20/` → `user-auth`）
- 裸描述作为输入时：从用户描述提取关键词转为 kebab-case（如"用户认证系统" → `user-auth`）
- 含特殊字符时强制 kebab-case 转换

---

## overview.md 模板

```markdown
---
type: design-overview
---

# 设计契约：<标题>

## 设计读数

（一句话声明设计意图和美学家族）

## 跨模块一致性约束

| 约束 | 涉及模块 | 约束内容 | 验证方式 |
|------|---------|---------|---------|
| 认证传递 | auth, resource | resource 模块所有端点必须校验 auth 模块签发的 token | 集成测试 TC-INT-002 |
| 审计写入 | auth, resource, audit | 所有写操作必须同步写入 audit 模块的审计日志 | 集成测试 TC-INT-AUDIT-* |

## 产物清单

| 文件 | 内容 |
|------|------|
| architecture.md | 系统架构（含模块清单与边界） |
| security.md | 安全 |
| modules/01-auth/api.md | 认证模块 API |
| modules/01-auth/database.md | 认证模块数据库 |
| ... | ... |
```

---

## architecture.md 模板

```markdown
---
type: design-architecture
ids: [ADR-001, ADR-002, ADR-003]
---

# 系统架构

## 技术选型

| 决策点 | 选项 | 选择 | 理由 |
|--------|------|------|------|
| 前端框架 | React/Vue/Svelte | React 19 | 生态成熟、团队熟悉 |
| 后端框架 | Express/Fastify/NestJS | Fastify | 高性能、TypeScript 原生支持 |
| 数据层 | PostgreSQL/MySQL | PostgreSQL | 支持 JSONB、全文搜索 |
| 基础设施 | Docker/K8s | Docker Compose | 单机部署满足当前规模 |

## ADR 真源

### ADR-001: [决策标题]
- **状态：** 已采纳
- **背景：** [决策背景]
- **决策：** [具体决策]
- **理由：** [选择理由]
- **后果：** [预期后果]

## 系统上下文图

（Mermaid graph 绘制系统与外部系统边界）

## 跨模块依赖关系图

（Mermaid graph 绘制模块间依赖，必须为 DAG）

## 全局数据流

（Mermaid flowchart 或 sequenceDiagram 绘制跨模块数据流）
```

---

## constraints.md 模板

```markdown
---
type: design-constraints
---

# 实施约束

## 环境变量

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| DATABASE_URL | 是 | — | 数据库连接字符串 |
| JWT_SECRET | 是 | — | JWT 签名密钥 |

## 依赖版本

| 依赖 | 版本 | 说明 |
|------|------|------|
| react | ^19.0.0 | 前端框架 |
| fastify | ^5.0.0 | 后端框架 |

## 目录结构

```
src/
├── modules/
│   ├── auth/
│   ├── resource/
│   └── audit/
├── shared/
└── config/
```

## 构建命令

- 开发：`npm run dev`
- 构建：`npm run build`
- 测试：`npm test`
```

---

## cross-mapping.md 模板

```markdown
---
type: design-cross-mapping
---

# 跨维度映射表

## API ↔ Database 字段映射

| API 端点 | 请求/响应字段 | 数据库表.字段 | 类型 | 可选性 | 转换规则 |
|---------|------------|-------------|------|--------|---------|
| EP-001 (POST /resources) | request.name | T-resources.name | VARCHAR(100) | required | 直接映射 |

## API 错误码 ↔ UI 状态机映射

| API 错误码 | HTTP 状态 | UI 状态机 | UI 状态 | 用户提示 | 恢复操作 |
|-----------|----------|----------|--------|---------|---------|
| INVALID_INPUT | 400 | ST-form | error | 字段错误标注 | 修正字段后重新提交 |

## 测试用例 ↔ 契约元素覆盖追溯

| 用例 ID | 优先级 | 测试层级 | 契约元素 ID | 断言要点 |
|---------|--------|---------|-----------|---------|
| TC-001 | P0 | 后端 | EP-001 | 端点返回 201 + 资源对象 |

## UI 组件 ↔ API 端点映射

| UI 组件 | 调用端点 | 所需字段 | 加载状态 | 错误处理 |
|--------|---------|---------|---------|---------|
| ResourceForm | EP-001 (POST /resources) | name, type | ST-button: loading | 显示错误提示 |

## 跨模块映射

### 模块间接口映射

| 源模块 | 目标模块 | 接口 | 调用方向 |
|--------|---------|------|---------|
| resource | auth | verifyToken(token) | resource → auth |

### 模块间数据一致性

| 一致性约束 | 涉及模块 | 机制 |
|-----------|---------|------|
| 用户删除后资源级联 | auth, resource | ON DELETE CASCADE |
```

---

## modules/\<NN\>-\<m\>/ui-ux.md 模板

```markdown
---
type: design-ui-ux
ids: [COMP-001, COMP-002, ST-button, ST-form]
---

# UI/UX 设计

## 技术栈声明

- 前端框架：React 19
- UI 组件库：shadcn/ui
- CSS 方案：Tailwind CSS 4
- 图标库：Phosphor
- 字体：Geist
- 路由方案：React Router 7

## 路由表

| 路由 | 页面 ID | 页面名 | 权限 | 页面文件 |
|------|---------|--------|------|---------|
| /login | PAGE-001 | 登录页 | 公开 | pages/01-login.md |
| /resources | PAGE-003 | 资源列表 | 需认证 | pages/01-resource-list.md |

## 设计 Token

### 色彩
- 背景：#0a0a0a
- 前景：#fafafa
- 强调色：#1890ff
- 中性色阶：#fafafa → #0a0a0a

### 字号阶
- 展示：text-4xl md:text-6xl
- 正文：text-base
- 辅助：text-sm

### 间距阶
- 段落间距：py-24 to py-40
- 组件间距：gap-6

### 圆角
- 统一系统：全柔和 12-16px

## 交互状态机总表

| 状态机 ID | 组件 | 状态 | 过渡动画 | 减少动效回退 |
|----------|------|------|---------|-------------|
| ST-button | Button | idle→loading→success→error | scale(0.98) | 即时切换 |
| ST-form | Form | empty→filling→submitting→error | opacity fade | 无动画 |

## 无障碍要求

- 对比度：WCAG AA
- 焦点环：最低 2px 实线
- aria 标注：图标按钮 aria-label
- 键盘导航：Tab 顺序、快捷键

## 组件清单

| 组件 ID | 组件名 | 来源 | 复用理由 |
|---------|--------|------|---------|
| COMP-001 | Button | 技术栈库引入 | shadcn/ui 提供基础按钮 |
| COMP-002 | Card | 技术栈库引入 | shadcn/ui 提供卡片容器 |
| COMP-003 | Form | 新建自研 | 技术栈库无满足业务表单需求的组件 |

## 组件复用策略

### 已有组件资产扫描

| 已有组件 | 路径/位置 | 复用方式 | 备注 |
|---------|----------|---------|------|
| Header | src/components/Header.tsx | 直接复用 | — |

### 跨页面复用分析

| 重复 UI 结构 | 出现页面 | 抽取为组件 | 组件 ID | 理由 |
|-------------|---------|-----------|---------|------|
| 卡片列表项 | PAGE-003, PAGE-004 | 是 | COMP-004 | 跨页面复用 |

### 组件定义

#### COMP-001: Button

**来源：** 技术栈库引入（shadcn/ui）
**Props 契约：**

```typescript
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size: 'sm' | 'md' | 'lg' | 'icon'
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  children: React.ReactNode
}
```

**状态机 ST-button：** idle → loading → success → error
```

---

## modules/\<NN\>-\<m\>/pages/\<NN\>-\<page-name\>.md 模板

```markdown
---
type: design-page
ids: [PAGE-001]
---

# PAGE-001: 登录页

**路由：** /login
**布局家族：** Centered Card

## 组件放置与布局

（页面级组件放置和布局细节）

## HTML 结构片段

（页面 HTML 骨架结构，精确到语义化标签和组件嵌套层级）

## CSS 样式片段

（页面关键样式，精确到布局属性和响应式断点）

## 字段到组件映射

| 字段名 | 组件 ID | 组件名 | Props | 校验规则 |
|--------|---------|--------|-------|---------|
| 邮箱 | — | Input | { type: "email", name: "email" } | 合法邮箱格式 |
| 密码 | — | Input | { type: "password", name: "password" } | 必填 |
| 提交 | COMP-001 | Button | { variant: "primary", type: "submit" } | — |

## 页面级交互状态机

- 提交表单 → POST /api/v1/auth/login → 成功跳转 /resources，失败显示错误提示
- 点击"注册" → 跳转 /register
- 状态机 ST-form: empty → filling → submitting → success/error

## 页面级响应式行为

- ≤ 768px：全宽，padding 缩小至 p-4
- > 768px：max-w-sm 居中
```

---

## Frontmatter 字段说明

| 文件 | frontmatter | 说明 |
|------|------------|------|
| `overview.md` | `type: design-overview` | — |
| `architecture.md` | `type: design-architecture`, `ids` | ids 含 ADR-XXX |
| `security.md` | `type: design-security`, `ids` | — |
| `observability.md` | `type: design-observability`, `ids` | — |
| `non-functional.md` | `type: design-non-functional`, `ids` | — |
| `design-spec.md` | `type: design-spec`, `ids` | — |
| `constraints.md` | `type: design-constraints` | — |
| `cross-mapping.md` | `type: design-cross-mapping` | — |
| `api.md` | `type: design-api`, `ids` | ids 含 EP-XXX |
| `database.md` | `type: design-database`, `ids` | ids 含 T-XXX |
| `ui-ux.md` | `type: design-ui-ux`, `ids` | ids 含 COMP-XXX, ST-XXX |
| `pages/<NN>-<page-name>.md` | `type: design-page`, `ids` | ids 含 PAGE-XXX |
| `test-cases.md` | `type: design-test-cases`, `ids` | ids 含 TC-XXX |

---

## 跨模块引用机制

模块间引用通过稳定 ID（EP-XXX、T-XXX、ST-XXX、COMP-XXX、PAGE-XXX、TC-XXX）松耦合，不直接加载其他模块文件。跨模块映射收敛到 `cross-mapping.md`，只保留模块间关系。

校验时只读 `overview.md` + `cross-mapping.md`，不读模块文件，避免上下文膨胀。

---

## 稳定 ID 体系

| ID 前缀 | 类型 | 示例 |
|---------|------|------|
| ADR | 架构决策记录 | ADR-001 |
| EP | API 端点 | EP-001 |
| T | 数据库表 | T-users |
| TC | 测试用例 | TC-001 |
| ST | UI 交互状态机 | ST-button |
| COMP | UI 组件 | COMP-001 |
| PAGE | 页面 | PAGE-001 |
| INT | UI 交互行为 | INT-001 |
| BR | 业务规则 | BR-001 |
