---
type: prd
status: drafted
date: 2026-06-03
topic: refactor-ae-lfg-skill
format: human-readable-requirements
sharded: false
---

# 重构 ae:lfg 技能

## AI 解析契约
- canonicalKind: requirements
- humanEquivalent: true
- stableIdsRequired: true
- noImplicitScope: true

## 问题框架

现有 ae:lfg 是 ae:prd → ae:plan → ae:work → ae:review 的组合管道，依赖四个子技能执行。用户需要在一次任务中经历多技能交互、多次授权确认，体验割裂且文档产物冗重。重构目标是让 ae:lfg 成为自包含管道：内联澄清、设计、实施，仅调用 ae:review 做审查，极简文档，一次澄清后静默执行到底。

## 需求

**核心流程**
- R1. 管道步骤为：澄清需求 → 审查并自动修复需求 → 设计 → 审查并自动修复设计 → 实施 → 审查并自动修复结果，共 6 步 → 验收: SKILL.md 中明确定义 6 步管道，每步有门控条件。门控条件：(1) 澄清完成门控：所有待定问题已解决，目标/范围/验收标准已确认；(2) 需求审查门控：ae:review 返回无 P0/P1 阻断发现；(3) 设计完成门控：设计文档已写入磁盘；(4) 设计审查门控：ae:review 返回无 P0/P1 阻断发现；(5) 实施完成门控：产出物与设计文档中的文件变更一致；(6) 结果审查门控：ae:review 返回可合并结论
- R2. 澄清、设计、实施均为内联逻辑，核心管道步骤（步骤 1/3/5）不调用 ae:prd、ae:plan、ae:work；澄清步骤可调用 ae:brainstorm 作为辅助（见 R4）→ 验收: SKILL.md 中步骤 1/3/5 无调用 ae:prd/ae:plan/ae:work 的指令
- R3. 审查步骤（步骤 2/4/6）调用现有 ae:review 技能 → 验收: 审查步骤明确调用 ae:review 并传参
- R4. 澄清需求时逐个提问（每次一个问题），可使用 ae:brainstorm 给出推荐答案供用户确认 → 验收: 澄清步骤说明一次一问和 brainstorm 用法
- R5. 澄清完成后，后续步骤禁止向用户提问，在当前工作空间一次性执行完毕；ae:review 在 headless/autofix 模式下内部不交互，若 ae:review 因权限不足等阻断性原因无法继续，管道中止并报告阻断原因 → 验收: SKILL.md 中声明"澄清完成后禁止提问"，并说明 ae:review 阻断时的中止行为

**任务路由**
- R6. 简单问答直接回答，不进管道 → 验收: 路由规则中 S1 简单问答直接回答
- R7. 单文件文字修改场景直接修改，不进管道 → 验收: 路由规则中单文件文字修改直接修改
- R8. 除 R6、R7 外所有场景均走管道；传入已有产物路径时按 R15/R16 跳步恢复，不走完整 6 步 → 验收: 路由规则明确常规场景走管道、恢复场景跳步

**产物体系**
- R9. 需求文档存 `ae/prds/YYYY-MM-DD-<topic>-lfg-prd.md`，设计文档存 `ae/plans/YYYY-MM-DD-NNN-<type>-<topic>-lfg-plan.md` → 验收: 产物路径规则与现有 ae:prd/ae:plan 同目录，文件名含 -lfg 标识
- R10. 需求文档极简格式：目标、范围、验收标准、约束、待定问题 → 验收: 需求文档模板只含这 5 个章节
- R11. 设计文档极简格式：实现步骤、文件变更、验证命令 → 验收: 设计文档模板只含这 3 个章节
- R12. 需求和设计文档与现有 ae:prd/ae:plan 产物格式不兼容 → 验收: 文档格式独立，不共享 frontmatter type 值
- R13. ae:plan 搜索 ae/prds/ 时排除文件名含 -lfg 的文档 → 验收: ae:plan 排除规则中声明
- R25. ae:prd 搜索 ae/prds/ 时排除文件名含 -lfg 的文档 → 验收: ae:prd 排除规则中声明

**参数与恢复**
- R14. 技能接受两个参数：task（必填，任务描述/步骤/目标/产物路径）和 compatible（可选，布尔值，默认 true）→ 验收: SKILL.md argument-hint 包含两个参数
- R15. 传入需求文档路径时，跳过澄清需求步骤，从设计步骤开始 → 验收: 恢复逻辑按产物类型跳步
- R16. 传入设计文档路径时，跳过澄清和设计步骤，从实施步骤开始 → 验收: 恢复逻辑按产物类型跳步

**不兼容更新**
- R17. compatible=false 时，需求文档 frontmatter 含 `breakingChange: true` → 验收: frontmatter 规则
- R18. compatible=false 时，设计文档 frontmatter 含 `breakingChange: true` → 验收: frontmatter 规则
- R19. compatible=false 时，需求文档明确记录"不兼容历史产物"，设计文档写明"清除历史技术债务，彻底重构，直接达成最终目标" → 验收: 文档内容要求

**审查产物**
- R20. 审查产物路径与现有 ae:review 审查产物保持同一目录 → 验收: 审查产物存 ae/reviews/

**非软件任务**
- R21. 同时支持软件任务和非软件任务；非软件任务中"设计"意为方案规划，"实施"意为方案落地，"审查"使用 ae:review domain:document → 验收: 管道步骤和文档格式不假设代码产物，SKILL.md 说明非软件任务下各步骤的语义映射

**去除项**
- R22. 去掉浏览器测试步骤 → 验收: 管道无浏览器测试步骤
- R23. 去掉 worktree 相关逻辑 → 验收: SKILL.md 不提及 worktree
- R24. 去掉 S1-S7 完整路由，简化为 R6-R8 的三条规则 → 验收: 无 S1-S7 引用

## 非功能需求
- NFR1. 澄清阶段应考虑任务执行过程中所有可能存在的问题，都在澄清步骤询问 → 验收: 澄清步骤说明"考虑所有可能问题"
- NFR2. 管道步骤失败时中止并报告：已完成步骤、失败步骤、失败原因、已产出物路径 → 验收: SKILL.md 定义失败中止行为
- NFR3. 每个审查步骤最多重试 3 次；3 次后仍有 P0/P1 阻断发现则中止管道并报告 → 验收: SKILL.md 定义审查收敛上限

## 成功标准
- 重构后的 ae:lfg 可独立完成从需求到交付的全流程，不依赖 ae:prd/ae:plan/ae:work
- 极简文档格式使需求+设计文档模板章节数不超过 8（需求 5 + 设计 3）
- 一次澄清后静默执行到底，中途不再提问

## 范围边界

### 范围内
- ae:lfg SKILL.md 重写
- ae:lfg references/ 目录下的参考文档更新
- 新的需求文档模板和设计文档模板
- ae:plan 排除 -lfg 产物规则
- ae:prd 排除 -lfg 产物规则

### 范围外
- ae:review 技能本身的修改
- ae:prd、ae:work 技能的修改
- ae:lfg 相关工具/服务的 TypeScript 代码修改
- 命令注册或 schema 常量变更

### 约束
- 技能名称仍为 ae:lfg
- 审查步骤必须复用现有 ae:review，不内嵌审查逻辑
- 产物目录与 ae:prd/ae:plan 共享，仅靠 -lfg 命名标识区分

## 关键决策
- D1. 内联澄清/设计/实施，仅调用 ae:review → 理由: 减少跨技能交互，一次澄清后静默执行
- D2. 产物存 ae/prds/ 和 ae/plans/ 同目录，-lfg 命名标识 → 理由: 用户偏好同目录聚合，排除规则解决误拾问题
- D3. 极简文档格式（5 章节+3 章节） → 理由: 用户要求尽可能简单
- D4. 去掉浏览器测试和 worktree → 理由: 用户明确要求简化

## 依赖 / 假设

### 依赖
- ae:review 技能可被调用且支持 mode:headless/autofix 和 domain:document/code
- ae:brainstorm 技能可被调用作为澄清步骤的辅助（可选依赖；不可用时降级为不提供推荐答案）

### 假设
- ae:plan 和 ae:prd 可添加排除 -lfg 文件的规则而不影响现有功能
- ae:review 传入 lfg 产物路径时可正常审查（格式不同但内容可读；lfg 产物使用独立 type 值，ae:review 对未知 type 值按 general 文档类型降级处理）

## 待定问题

### 推迟到规划
- [影响 R10][技术] 需求文档 frontmatter 的 type 值应为什么（不能是 prd 以免与 ae:prd 混淆）
- [影响 R11][技术] 设计文档 frontmatter 的 type 值应为什么（不能是 plan 以免与 ae:plan 混淆）

## 一致性检查
- requirementsCount: 25
- nonFunctionalRequirementsCount: 3
- decisionsCount: 4
- openQuestionsCount: 2
