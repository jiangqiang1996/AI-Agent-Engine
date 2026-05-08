---
type: brainstorm
status: drafted
date: 2026-05-08
topic: skill-from-session-merge
---

# 合并会话沉淀与资产纠偏技能

## 问题框架

`ae:save-session-flow` 和 `ae:asset-debug` 经过职责收敛后都变成了同一种工作流：从当前会话提取可复用经验，整理为技能创建需求，再转交 `ae:skill-creator` 创建技能。继续保留两个独立入口会造成概念重复、帮助信息膨胀和维护成本增加。

目标是创建一个新的统一技能，覆盖“会话流程沉淀”和“资产纠偏沉淀”两类来源，并把当前会话中的流程用于创建新的项目级技能或更新已有的项目级技能。除非用户显式要求全局级，否则默认作用域为项目级。两个原始技能入口需要彻底删除。

## 需求

**统一技能行为**

- R1. 新增统一技能 `ae:skill-from-session`，用于从当前会话提取可复用流程或纠偏经验，并转交 `ae:skill-creator` 创建新技能或更新已有技能。→ 验收: `/ae-help` 或等价帮助输出中可发现 `ae:skill-from-session`，其描述明确包含“从当前会话创建或更新技能”语义。
- R2. 新技能必须支持两类输入场景：普通会话流程沉淀，以及资产执行偏差/纠偏流程沉淀。→ 验收: 技能文档中分别说明两类场景的输入、提取重点、确认点和完成汇报。
- R3. 新技能默认创建或更新项目级技能；只有用户明确要求“全局”“全局级”或传入 `--global` 时，才允许转交全局级创建或更新需求。→ 验收: 技能文档和参数提示均表达默认项目级，且全局级有影响范围提示。
- R4. 新技能不得直接写入技能、命令、代理、规则、工具、hook、service、schema 或注册文件，只能整理需求并调用 `ae:skill-creator`。→ 验收: 技能文档中没有直接写文件、注册旧资产或创建覆盖的执行步骤。
- R5. 新技能必须区分“创建新技能”和“更新已有技能”两种意图；当用户指定已有技能名或发现同名技能存在时，转交需求必须要求 `ae:skill-creator` 进入更新/合并流程，而不是静默覆盖。→ 验收: 技能文档包含创建/更新判定、已有技能冲突处理和用户确认要求。

**旧技能删除**

- R6. 彻底删除 `ae:save-session-flow` 和 `ae:asset-debug` 两个旧技能资产，不保留转发兼容。→ 验收: `src/assets/skills/ae-save-session-flow/` 和 `src/assets/skills/ae-asset-debug/` 不再作为公开技能资产存在。
- R7. 从注册与可调用链路中移除两个旧技能入口。→ 验收: schema 常量、技能名枚举、命令枚举、catalog 条目、帮助输出和模型路由中不再暴露 `ae:save-session-flow`、`ae:asset-debug`、`ae-save-session-flow` 或 `ae-asset-debug`。
- R8. 删除旧入口后，所有运行时注册链路、帮助链路和测试断言必须使用 `ae:skill-from-session`。→ 验收: 相关测试不再期望旧技能可用；旧名称 grep 结果必须逐项确认不属于公开运行时资产或可调用入口。

**用户确认与交接**

- R9. 新技能在调用 `ae:skill-creator` 前必须展示转交摘要并取得明确确认。→ 验收: 技能文档定义确认选项，包括确认创建/更新、修改后创建/更新、只输出诊断/摘要、不创建/不更新和取消。
- R10. 对资产纠偏场景，新技能必须先定位候选资产并区分入口资产与实际执行资产。→ 验收: 技能文档要求在候选不唯一或调用链证据不足时暂停询问用户。

## 成功标准

- 用户只需要记住一个入口：`ae:skill-from-session`。
- 新技能能覆盖原两个技能的有效价值：会话流程沉淀、资产偏航诊断、纠偏流程沉淀、转交 `ae:skill-creator`。
- 新技能能根据当前会话流程创建新项目级技能或更新已有项目级技能；全局级仅在显式要求时启用。
- 旧技能名称从公开可调用入口中彻底消失，不产生隐藏兼容路径。
- 变更后类型检查、相关资产/schema/catalog/help/model routing 测试通过。

## 范围边界

- 不保留 `ae:save-session-flow` 或 `ae:asset-debug` 的命令、catalog 条目或 schema 常量作为兼容入口。
- 不改变 `ae:skill-creator` 的创建/更新语义；它仍负责实际文件创建、命令创建、已有技能更新或合并、冲突处理和结构校验。
- 不新增代码工具来替代 `ae:skill-creator`。
- 不要求为旧入口提供迁移命令或自动重写用户输入。

## 关键决策

- 新技能名采用 `ae:skill-from-session`: 名称直接表达“从当前会话生成或更新技能”，覆盖流程沉淀和纠偏沉淀两类来源。
- 旧入口彻底删除: 用户明确选择破坏性删除，不保留转发兼容。
- 默认项目级创建或更新: 与 `ae:skill-creator` 的默认作用域一致，降低误写全局配置的风险。

## 依赖 / 假设

- 用户已确认 `ae:skill-creator` 目前支持创建和更新项目级/全局级 OpenCode 原生技能，并支持 `--global` 与 `--no-command`；规划阶段只需要核对其现有更新/合并入口，并确保 `ae:skill-from-session` 正确转交。
- 当前公开技能由 `src/schemas/ae-asset-schema.ts`、`src/services/ae-catalog.ts` 和 `src/assets/skills/` 共同驱动。
- 删除旧技能属于破坏性变更，后续规划需覆盖 schema、catalog、模型路由、帮助和测试更新。

## 待定问题

### 规划前需解决

- 无。

### 推迟到规划

- [影响 R5][技术] 规划阶段需要核对 `ae:skill-creator` 现有更新/合并入口，并决定 `ae:skill-from-session` 的转交输入格式。
- [影响 R6-R8][技术] 规划阶段需要列出所有旧技能名引用位置，并判断哪些测试或文档中的历史引用可以保留。
- [影响 R8][技术] 规划阶段需要确定最小验证集，至少覆盖 typecheck、schema/catalog/help/model routing 相关测试。

## 下一步

-> /ae-plan docs/ae/brainstorms/2026-05-08-skill-from-session-merge-requirements.md
