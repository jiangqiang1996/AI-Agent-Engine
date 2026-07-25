---
name: ae:design-update
description: "根据已变更需求增量更新设计文件：读取 prd changes 数组精确变更信号，重跑受影响子代理 scoped regeneration，仅处理过期模块，不触碰未受影响文件"
argument-hint: "[模块名] [--dry-run]"
---

# 设计增量更新

`ae:design-update` 根据 prd 的 `changes` 数组（精确变更信号），增量更新同一份设计文件。它采用 scoped regeneration 策略——重跑受影响子代理，整体替换其负责的章节，不触碰未受影响模块。

此技能不实现代码。它更新设计文件、维护变更追踪、触发增量索引更新。

**重要：修改文件时所有文件引用必须使用仓库相对路径，绝不能使用绝对路径。**

## 核心原则

1. **变更信号驱动** - 读取 prd `changes` 数组获取精确变更信号，不靠 diff 推断。
2. **scoped regeneration** - 维度章节是相互依赖的连续体，重跑受影响子代理整体替换章节，保证维度间一致性。不用精确 patch（prd-update 用精确 edit 因为需求条目是离散原子项）。
3. **仅处理过期模块** - 只处理 `staleModules` 标记的模块，不触碰未受影响模块。
4. **方案确认** - 更新前必须向用户展示方案（原始内容 → 修改后内容 → 变更依据），确认后才执行。
5. **superseded_by 软删除** - 旧设计内容标记 `supersededBy` 保留历史。
6. **增量索引** - 更新后仅重新生成 `index.md`，不全量重建。
7. **局部校验** - 仅校验受影响文件的 ID 引用闭合，不全量校验。

## 交互规则

1. **方案展示** - 用表格展示原始内容、修改后内容和变更依据。
2. **使用平台的提问工具** - 优先使用 opencode 的 `question` 工具。
3. **跨模块影响确认** - blast radius ≥ 2 时需额外确认。

## 功能描述

<feature_description> #$ARGUMENTS </feature_description>

**如果未指定模块名，同步所有过期模块。如果无过期模块，输出"设计已是最新"。**

## 参数说明

### 模块名（位置参数）

- **格式**：`<模块名>`
- **作用**：仅同步指定模块的设计。
- **默认**：同步所有 `staleModules` 标记的过期模块。

### --dry-run

- **格式**：`--dry-run`
- **作用**：预览变更方案不执行。
- **默认**：不启用。

## 执行流程

### 阶段 0：变更信号读取

1. 读 prd `index.md` → 获取 `changes` 数组（精确变更信号）
2. 读 design `index.md` → 获取 `originStale` + `staleModules`
3. 无过期模块 → 输出"设计已是最新" → 结束
4. 有过期模块 → 列出过期模块 + 对应的变更信号

### 阶段 1：按变更信号精确加载

对每个过期模块（或用户指定的模块）：

1. 读 prd `modules/<NN>-<m>/module.md`（当前态需求，superseded 记录自动排除）
2. 读 prd `changes` 数组中该模块的变更条目
3. 读 design `modules/<NN>-<m>/<dimension>.md`（当前设计）
4. 读 design `global.md`（仅受影响章节，如 §architecture/§traceability）
5. 不读取未过期模块

### 阶段 2：设计变更方案生成

对每个过期模块：

1. 对比 prd 变更信号 vs 当前设计内容
2. 生成设计变更方案表格：

   | 设计文件 | 章节 | 原始内容 | 修改后内容 | 变更依据 |
   |---------|------|---------|-----------|---------|
   | modules/01-auth/api.md | @EP-001 | password: string | password: string (≥12位含特殊字符) | R1 变更 |
   | modules/01-auth/database.md | @T-users | password_hash VARCHAR(255) | password_hash VARCHAR(255) + 密码策略 | R1 变更 |
   | modules/01-auth/ui-ux.md | @PAGE-001 | password(必填,≥8位) | password(必填,≥12位含特殊字符) | R1 变更 |
   | modules/01-auth/test-cases.md | @TC-001 | 验证8位密码注册 | 验证12位含特殊字符密码注册 | R1 变更 |

3. 计算设计变更的 blast radius：
   - Radius 1: `modules/<NN>-<m>/` 下各维度文件间一致性
   - Radius 2: `global.md` §traceability（如 API 签名变更影响跨模块映射）
   - Radius 3: 其他模块（如 auth API 变更影响 resource 的鉴权调用）
4. 展示方案 → 用户确认
   - 确认 → 进入阶段 3
   - 拒绝 → 询问是否调整 → 回到阶段 2
   - 取消 → 结束

### 阶段 3：scoped regeneration

对每个过期模块：

1. 确定受影响子代理集合（从 `changes` 数组的 `affectedDimensions` 推导）
2. 重跑受影响子代理：
   - 读取该子代理的完整输入上下文（prd 当前态 + design global + 该模块当前设计）
   - 子代理产出可替换的完整维度文件内容
 3. 主代理用 edit 工具将该维度文件整体替换：
   - 匹配旧维度文件全部内容
   - 旧维度文件内容用 `superseded_by` 标记（HTML 注释隐藏）
   - 替换为新章节内容
4. 更新 `contentHash`
5. 更新 frontmatter `changes` 数组

如 blast radius ≥ 2：
- 更新 design `global.md` §traceability（跨模块映射）

如 blast radius ≥ 3：
- 更新受影响的其他模块（如 resource 的鉴权调用）
- 标记这些模块为需进一步同步

### 阶段 4：增量索引 + 局部校验

1. 重新生成 design `index.md`（自动）
2. 清除 `originStale` + `staleModules` 标记（已同步的模块）
3. 局部一致性校验：
   - 校验受影响模块的 ID 引用闭合
   - 校验跨模块 API 调用一致性（仅校验变更涉及的端点）
   - 校验 api ↔ database 字段对齐（仅校验变更涉及的字段）
4. 校验失败 → 标记不一致 → 提示用户
5. 校验通过 → 输出结果：
   - 设计变更摘要
   - 更新的文件列表
   - 一致性校验结果
   - 提示: "设计已同步，可运行 `/ae-work` 实施变更"

## 设计变更策略

按信息类型选择变更策略：

| 设计信息类型 | 变更策略 | 机制 |
|-------------|---------|------|
| API 端点（EP-XXX） | `superseded_by` 软删除 | 旧端点标记 superseded + 新端点链接 |
| 数据库表（T-XXX） | `superseded_by` 软删除 | 旧表结构标记 superseded + 新表结构链接 |
| UI 状态机（ST-XXX） | `superseded_by` 软删除 | 旧状态机标记 superseded + 新状态机链接 |
| 测试用例（TC-XXX） | `superseded_by` 软删除 | 旧用例标记 superseded + 新用例链接 |
| HTML/CSS 片段 | 原地修改 | 直接编辑（自由文本） |
| ADR 决策 | `superseded_by` 软删除 | 旧 ADR 标记 superseded + 新 ADR 链接 |

## 与全量 ae:design 的区别

| | ae:design（全量） | ae:design-update（增量） |
|---|---|---|
| 触发条件 | 首次设计或全量重建 | prd 变更后同步设计 |
| 读取范围 | 全部 prd 产物 | 仅 changes 数组 + 过期模块 |
| 生成范围 | 全部 design 产物 | 仅过期模块（scoped regeneration） |
| 子代理 | 全部 design 子代理 | 仅过期模块涉及的子代理 |
| 合并者 | 无需合并者（子代理直接产出独立维度文件） | 无需合并者（子代理直接产出独立维度文件） |
| 一致性校验 | 全量校验 | 局部校验（仅受影响文件） |
| 耗时 | 长（全量） | 短（仅变更部分） |

## 安全边界

- 仅处理 `staleModules` 标记的模块，不触碰未过期模块
- 设计变更方案必须经用户确认
- 更新同一份文件（edit 替换章节），不删除不重建
- superseded 设计内容用 HTML 注释隐藏
- 跨模块影响（blast radius ≥ 2）需额外确认
- 局部校验失败时不自动回退，标记不一致由用户决定
- 不修改 prd 文件（仅读取 changes 数组）

## 何时触发全量重建

以下情况提示用户运行 `ae:design` 全量重建而非增量更新：

| 触发条件 | 理由 |
|---------|------|
| 模块边界变更 | 影响范围无法精确计算 |
| 全局文件结构变更 | 影响所有模块 |
| 增量校验失败且用户选择全量 | 不一致可能超出局部 |
| 多模块同时过期 | 批量增量不如全量 |
| 用户显式请求 | 用户判断 |

## 交接

更新完成后呈现下一步选项：
- 运行 `/ae-work` 实施变更
- 继续同步其他过期模块（如有）
- 运行 `/ae-prd-update` 继续变更其他需求
