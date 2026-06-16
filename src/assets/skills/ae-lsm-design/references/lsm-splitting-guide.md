# LSM 设计产物拆分策略

设计产物的核心实体是 `U-*` 实现映射单元和 `P-*` 页面映射（UI 设计），具有双层结构：主设计层承载实现映射，UI 设计层承载页面映射和设计体系。拆分必须同时考虑两个层次的独立性。

## 行数限制

单个产物文件不得超过 800 行（含 frontmatter）。超过时必须拆分为文件夹结构。

## 主设计拆分

### 拆分维度

按模块或功能域分组 `U-*` 条目。同一模块的实现单元应放在同一子文件中，不跨模块拆分同一逻辑单元。

### 目录结构

```
ae/lsm/design/
└── <project-name>/
    ├── index.md               # 索引文件
    ├── <module-1>.md          # 子文件：模块 1 的 U-* 条目
    ├── <module-2>.md          # 子文件：模块 2 的 U-* 条目
    ├── ui-design.md           # UI 设计子文件（如有 U-* 标记"涉及 UI"）
    └── ...
```

### 索引文件

索引文件 `index.md` 是文件夹的入口，必须包含：

1. **完整 frontmatter**：与未拆分产物相同的元数据，附加 `splitFrom`（原单文件名）和 `totalFiles`（子文件数量）
2. **设计概述**：一段话描述整个设计的目标、范围和关键决策
3. **子文件索引表**：列出每个子文件的文件名、涵盖的 `U-*` ID 范围和作用描述

```markdown
---
lsmKind: design
upstreamRefs: [...]
traceTable: { ... }
trimmingGuide: { ... }
splittingGuide: { ... }
splitFrom: <project-name>.md
totalFiles: <N>
---

# LSM Design: [项目名称]

## 设计概述

[一段话描述整个设计的目标、范围和关键决策]

## 子文件索引

| 文件名 | 范围 | 作用 |
|--------|------|------|
| auth-module.md | U-001 ~ U-003 | 认证与授权模块的完整实现单元 |
| order-service.md | U-004 ~ U-007 | 订单服务的完整实现单元 |
| ui-design.md | P-001 ~ P-005 | UI 设计体系与页面映射 |
```

### 子文件

每个子文件必须包含：

1. **轻量 frontmatter**：`lsmKind: design` 和 `parentIndex: ./index.md`
2. **该模块的完整实现单元**：需求映射、设计决策、接口边界、数据模型、依赖关系、风险说明、UI 标记、下游映射

```markdown
---
lsmKind: design
parentIndex: ./index.md
---

# 认证与授权模块

## U-001: 用户登录

[完整实现单元内容]
```

**禁止拆断单个 `U-*` 条目**：每个实现单元的描述、验收标准、接口边界、数据模型等必须完整存在于同一子文件中。

## UI 设计拆分

UI 设计子文件 `ui-design.md` 承载设计体系（设计令牌、信息架构）和 `P-*` 页面映射。当存在任意 `U-*` 标记为"涉及 UI"时必须生成。

### UI 设计自身需要拆分时

当 `ui-design.md` 超过 800 行时，按页面或功能域进一步拆分：

```
ae/lsm/design/<project-name>/
├── index.md
├── ...
├── ui-design/
│   ├── index.md          # UI 设计索引：设计令牌 + 信息架构 + 子文件索引
│   ├── ui-dashboard.md   # 仪表盘页面
│   └── ui-settings.md    # 设置页面
```

UI 设计索引文件保留设计体系概述、设计令牌、信息架构与导航，以及页面映射子文件索引表。**设计令牌仅在索引文件中定义一次**，子文件通过引用使用。

UI 设计索引文件 frontmatter：

```yaml
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ui-design.md
totalFiles: <N>
---
```

UI 设计子文件 frontmatter：

```yaml
---
lsmKind: design-ui
parentIndex: ./index.md
---
```

UI 设计索引文件 frontmatter 格式：

```markdown
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ui-design.md
totalFiles: <N>
---

# UI Design: [项目名称]
```

UI 设计子文件 frontmatter 格式：

```markdown
---
lsmKind: design-ui
parentIndex: ./index.md
---

# [页面/功能域名称]
```

UI 设计索引文件 frontmatter 示例：

```markdown
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ui-design.md
totalFiles: <N>
---

# UI 设计：[项目名称]
```

UI 设计子文件 frontmatter 示例：

```markdown
---
lsmKind: design-ui
parentIndex: ./index.md
---

# 仪表盘页面
```

索引文件 frontmatter：

```markdown
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ui-design.md
totalFiles: <N>
---
```

子文件 frontmatter：

```markdown
---
lsmKind: design-ui
parentIndex: ./index.md
---
```

UI 设计索引文件 frontmatter：

```yaml
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ui-design.md
totalFiles: <N>
---
```

UI 设计子文件 frontmatter：

```yaml
---
lsmKind: design-ui
parentIndex: ./index.md
---
```

UI 设计索引文件 frontmatter 格式：

```markdown
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ../ui-design.md
totalFiles: <N>
---
```

UI 设计子文件 frontmatter 格式：

```markdown
---
lsmKind: design-ui
parentIndex: ./index.md
---
```

UI 设计索引文件 frontmatter 格式：

```yaml
---
lsmKind: design-ui
parentIndex: ../index.md
splitFrom: ui-design.md
totalFiles: <N>
---
```

UI 设计子文件 frontmatter 格式：

```yaml
---
lsmKind: design-ui
parentIndex: ./index.md
---
```

### `U-*` 与 `P-*` 的关联

- 每个"涉及 UI"的 `U-*` 在"UI 设计引用"字段填写对应的 `P-*` 页面映射 ID
- `P-*` 页面映射在"实现单元映射"字段引用对应的 `U-*` ID
- 拆分后此双向关联不受影响，因为 `parentIndex` 保证子文件可追溯到索引

## 拆分触发

1. AI 生成产物时，先评估预估行数；若预计超过 800 行，直接按拆分结构生成
2. 生成过程中发现行数超限时，暂停并重构为拆分结构
3. 优先按模块边界拆分主设计，再检查 UI 设计是否需要独立拆分
