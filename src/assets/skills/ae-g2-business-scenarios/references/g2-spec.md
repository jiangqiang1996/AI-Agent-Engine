# G2 业务场景分析 步骤摘要

## 目标

填补 G1（不变量约束）→ G4（数据模型）之间的功能需求缺口，系统化提取业务场景、定义操作序列、发现隐含字段、梳理跨场景依赖。

## 核心规则

- 场景必须可操作：每个场景必须有明确的 actor、trigger、preconditions、postconditions
- 好的场景示例："用户在商品详情页点击立即购买，系统校验库存后创建订单"——可执行
- 坏的场景示例："系统支持下单"——不可执行，缺少触发条件和操作步骤
- 字段双源发现：不变量显式声明（derived）∪ 业务场景隐含推断（inferred）

## 任务清单

| 任务 | 说明 |
|------|------|
| T1 提取业务场景 | 从需求和不变量中提取场景，每场景含 id/name/actor/trigger/preconditions/postconditions/source_ref/module |
| T2 定义业务操作 | 每场景展开操作序列，标注 input_fields/output_fields |
| T3 双源字段发现与合并 | 不变量字段 origin:derived ∪ 业务场景字段 origin:inferred |
| T4 定义用户角色与权限 | 归纳角色、可执行操作、数据访问范围、继承关系 |
| T5 标注跨场景依赖 | 时序/因果依赖图，要求无环 |
| T6 写入产物 | business-scenarios/、field-catalog.md、roles.md |
| T7 产物审查 | ae:review mode=autofix domain=document g2/，最多3次 |

## 验收关卡

| 编号 | 检查项 | 通过标准 |
|------|--------|---------|
| G2-K1 | 场景覆盖完整 | 每个功能需求有对应场景 |
| G2-K2 | 操作字段闭合 | 操作字段在 field-catalog.md 中有对应条目 |
| G2-K3 | 字段双源闭合 | derived 可溯源至不变量，inferred 可溯源至场景 |
| G2-K4 | 角色覆盖完整 | 每个场景 actor 在 roles.md 中有定义 |
| G2-K5 | 依赖无环 | 依赖图无环 |
| G2-K6 | 歧义已闭合 | 影响场景定义的歧义项已裁定 |
| G2-K7 | 文件行数合规 | 所有产物文件不超过 500 行 |
| G2-K8 | 产物审查通过 | ae:review autofix 审查通过 |
| G2-K9 | 人工审核通过 | 用户确认完整 |

## 回退规则

- 不变量遗漏 → 回 G1 补充不变量
- 场景定义内部问题 → 仅重做 G2

## 通用产物规格

- 单轨格式：YAML Frontmatter 为唯一真源，正文为人类阐释
- 文件行数硬约束：每个产物文件不超过 500 行
- 超过时拆分为目录结构，含 index.md 汇总索引
