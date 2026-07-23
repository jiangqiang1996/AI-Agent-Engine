---
name: ae:prd-update
description: "AI 辅助需求变更：根据自然语言变更意图修改已有需求文件，维护 superseded_by 软删除链和 changes 变更摘要，触发增量索引更新和 design 过期标记"
argument-hint: "[变更意图描述] [--auto-sync-design]"
---

# AI 辅助需求变更

`ae:prd-update` 根据用户的自然语言变更意图，修改已有需求文件。它维护 `superseded_by` 软删除链保留历史，自动生成结构化变更摘要（`changes` 数组）供 `ae:design-update` 精确同步消费，并标记 design 过期模块。

此技能不实现代码。它修改需求文件、维护变更追踪、触发增量索引更新。

**重要：修改文件时所有文件引用必须使用仓库相对路径，绝不能使用绝对路径。**

## 核心原则

1. **意图先行** - 先理解变更意图，定位目标条目，再生成修改方案。
2. **方案确认** - 修改前必须向用户展示方案（原始内容 → 修改后内容 → 影响范围），确认后才执行。
3. **精确 edit** - 需求条目是离散原子项，用 edit 工具精确修改目标条目，不触碰未变更条目。
4. **superseded_by 软删除** - 旧条目标记 `supersededBy` 保留历史，新条目添加 `supersedes` 链接。默认读取只返回当前态。
5. **自动变更摘要** - 修改后 diff 引擎自动生成 frontmatter `changes` 数组，供 `ae:design-update` 消费。
6. **增量索引** - 修改后仅重新生成 `index.md`，不全量重建所有文件。
7. **design 过期标记** - 修改后标记 design `index.md` 的 `originStale=true` + `staleModules=[<受影响模块>]`。
8. **不追问实现方式** - 需求变更只修改产品行为和范围边界，不涉及技术选型。

## 交互规则

1. **一次只问一个问题** - 意图模糊时调用 `ae:grill` 追问，上限 3 轮。
2. **方案展示** - 用表格展示原始内容、修改后内容和影响范围。
3. **使用平台的提问工具** - 优先使用 opencode 的 `question` 工具。

## 功能描述

<feature_description> #$ARGUMENTS </feature_description>

**如果上面的功能描述为空，询问用户：** "您想变更什么需求？请描述变更意图，如'把 R1 的密码要求改成至少12位含特殊字符'。"

在获得用户的变更意图之前不要继续。

## 参数说明

### --auto-sync-design

- **格式**：`--auto-sync-design`
- **作用**：需求变更完成后自动触发 `ae:design-update` 同步设计。
- **默认**：不自动同步，仅提示用户运行 `/ae-design-update`。

## 变更类型

| 变更类型 | 行为 | superseded_by | 影响范围 |
|---------|------|--------------|---------|
| 修改需求描述 | 旧条目标记 superseded + 新条目替代 | 是 | 模块内 + 关联 design |
| 新增需求条目 | 添加新条目，分配新 ID | 否 | 模块内 + 关联 design |
| 删除需求条目 | 标记 supersededBy（软删除），不物理删除 | 是 | 模块内 + 关联 design |
| 修改验收条件 | 旧 SC 标记 superseded + 新 SC 替代 | 是 | 模块内 |
| 修改原型/页面 | 直接修改原型描述 | 否（自由文本原地修改） | 模块内 + design ui-ux |
| 修改模块边界 | 迁移需求条目到新模块 | 是（条目归属变更） | 全局 + 多模块 |
| 修改全局决策 | 旧 D 标记 superseded + 新 D 替代 | 是 | 全局 + 所有受影响模块 |

## 执行流程

### 阶段 0：恢复和路由

识别要变更的需求文档：
- 从当前会话上下文中用户明确提到的需求文件名或路径
- 当前会话中已产出的需求文档

读取 prd `index.md` 获取全局导航和 ID 索引。

### 阶段 1：意图理解

1. 读 prd `index.md`（全局导航 + ID 索引 + 模块清单）
2. 解析用户变更意图，定位目标需求条目/模块
3. 如意图模糊 → 调用 `ae:grill` 追问澄清（上限 3 轮）
4. 输出结构化变更意图：`{targetId, changeType, description, affectedModule}`

### 阶段 2：上下文加载

1. SELECTIVE_LOAD: 读 `index.md` + `global.md` + `modules/<m>.md`
2. 理解目标需求的完整上下文（依赖链、验收条件、原型引用）
3. 读 design `index.md` → 预估 blast radius（哪些 design 模块会受影响）

### 阶段 3：方案生成（先提案不直接改）

1. 生成修改方案表格：

   | 项目 | 原始内容 | 修改后内容 |
   |------|---------|-----------|
   | R1 描述 | "密码需至少8位..." | "密码需至少12位含特殊字符..." |
   | PAGE-001 表单字段 | password(必填, 至少8位...) | password(必填, 至少12位含特殊字符...) |

2. 生成影响范围表格：

   | 受影响文件 | 受影响 ID | 变更类型 |
   |-----------|---------|---------|
   | prd modules/auth.md | R1, PAGE-001 | modify |
   | design modules/auth.md | EP-001, T-users, ST-001, TC-001 | stale |

3. 展示方案 → 用户确认
   - 确认 → 进入阶段 4
   - 拒绝 → 询问是否调整方案 → 回到阶段 3
   - 取消 → 结束

### 阶段 4：执行修改

1. Read `modules/<m>.md` 完整内容
2. 用 edit 工具精确修改目标条目：
   - 修改需求描述（如 R1 描述）
   - 旧条目添加 `supersededBy: <新版本号>` + `validFrom` + `supersededAt`
   - 新条目添加 `supersedes: <旧版本号>` + `changedAt`
   - 修改关联原型/验收条件（如有）
3. superseded 记录用 HTML 注释隐藏：`<!-- ### R1.v1: 用户注册（已废弃） -->`
4. diff 引擎自动生成 frontmatter `changes` 数组条目
5. 更新 `contentHash`

### changes 数组条目格式

```yaml
changes:
  - id: change-001
    date: "2026-07-24"
    type: modify          # modify | add | remove
    targetId: R1
    fromVersion: R1.v1
    toVersion: R1
    changeSummary: "密码强度要求从无约束改为至少8位含大小写字母和数字"
    affectedDimensions: [api, database, ui-ux, test-cases]
    affectedIds: [EP-001, T-users, PAGE-001, ST-001, TC-001]
    blastRadius: 2
    reason: "用户反馈密码强度不足"
```

### 阶段 5：增量索引更新

1. 重新生成 prd `index.md`（自动）：更新模块导航、ID 索引、变更历史摘要
2. 标记 design `index.md`：`originStale: true`, `staleModules: [<受影响模块>]`
3. 局部一致性校验：仅校验受影响模块的 ID 引用闭合
4. 输出结果：
   - 变更摘要
   - design 过期状态 + 建议同步的模块
   - 如未指定 `--auto-sync-design`：提示"运行 `/ae-design-update` 同步设计"
   - 如指定 `--auto-sync-design`：自动调用 `ae:design-update`

## superseded_by 规则

1. 旧记录保留，标记 `supersededBy: <新ID>`，不从文件中删除
2. 新记录添加 `supersedes: <旧ID>` 链接
3. 默认读取只返回 `supersededBy` 为 null 的记录（当前态）
4. Supersession 是单向箭头，允许链式（R1→R1.v2→R1.v3），禁止环
5. Superseded 记录跳过一致性校验
6. Superseded 记录用 HTML 注释隐藏，默认不显示

## 安全边界

- 修改前必须 Read 完整文件，用 edit 精确匹配，禁止盲目 write 覆盖
- 修改方案必须经用户确认后才执行
- superseded 记录用 HTML 注释隐藏（`<!-- -->`），默认不显示
- 每次修改后立即校验 frontmatter 结构完整性
- 批量变更逐个生成方案，统一确认后批量执行
- 不修改 design 文件（仅标记过期状态）

## 交接

变更完成后呈现下一步选项：
- 运行 `/ae-design-update` 同步设计（如未自动同步）
- 运行 `/ae-work` 实施变更
- 继续变更其他需求
