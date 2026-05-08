---
type: brainstorm
status: drafted
date: 2026-05-08
topic: skill-creator-update-flow
---

# Skill Creator 更新流程

## 问题框架

当前 `ae:skill-creator` 明确面向创建 OpenCode 原生技能，但没有把“更新既有技能”作为一等场景表达。用户需要判断是否应该新增一个类似 `ae:skill-creator` 的“技能更新器”，还是扩展现有能力。

仓库扫描显示，`ae:agent-creator` 已采用“创建或调整”的合并模型，`ae:save-session-flow` 也覆盖了部分技能创建或更新场景。为了避免新增重叠入口，优先选择扩展 `ae:skill-creator`，让它覆盖既有技能更新流程。

## 需求

**能力范围**
- R1. `ae:skill-creator` 应明确支持创建新技能和更新既有技能两类场景 → 验收: 技能说明、适用场景或工作流中能直接识别“更新既有技能”的入口，不再只描述创建。
- R2. 更新流程应覆盖项目级和全局级 OpenCode 原生技能，并保持默认项目级、全局级需明确要求的安全边界 → 验收: 文档中更新项目级与全局级技能的路径边界清晰，且全局写入前仍要求说明影响范围。
- R3. 更新既有技能时应先读取旧内容并识别更新目标、保留内容、冲突点和需要用户确认的变更 → 验收: 工作流包含读取现有 `SKILL.md`、展示更新摘要或草案、确认后写入的步骤。

**非目标与边界**
- R4. 本次不新增独立 `ae:skill-updater` 公开技能，除非规划阶段发现扩展现有技能会造成职责混乱或交互显著变差 → 验收: 后续计划默认修改 `ae:skill-creator`，新增技能只作为被明确否决后的备选方案。
- R5. `ae:skill-creator` 不应承担 AE 内置技能注册链路的完整维护职责；涉及 `src/assets/skills/`、schema、catalog 的内置技能固化仍由 `ae:save-session-flow` 或专门规划处理 → 验收: 文档边界不把普通 OpenCode 原生技能更新误写为 AE 内置技能注册流程。
- R6. 更新流程不应默认新增命令、工具或脚本；仅在用户明确要求或现有技能已有对应产物需要同步时处理 → 验收: 工作流保留最小修改原则，并要求说明是否触及命令或脚本。

## 成功标准

- 用户提出“更新某个技能”时，`ae:skill-creator` 能自然接住请求，而不是引导用户寻找另一个技能。
- 创建和更新共用同一套命名、作用域、路径和校验规则，减少公开技能入口重复。
- 更新既有技能时不会静默覆盖用户已有内容，必须先展示草案或冲突处理方案。
- 与 `ae:agent-creator` 的“创建或调整”模型保持一致。

## 范围边界

- 不新增 `ae:skill-updater`，除非规划证明独立入口更清晰。
- 不改变 `ae:update` 的含义；它仍是 AE 插件安装或源码维护更新能力，不是技能内容更新器。
- 不把普通项目技能更新流程扩展为默认修改 AE 插件源码注册文件。
- 不要求用户项目存在本仓库的 `src/`、`dist/`、`.opencode/plugins/` 或 `docs/ae/` 结构。

## 关键决策

- 扩展现有 `ae:skill-creator`，不新增技能：这符合最小公开面原则，也与 `ae:agent-creator` 已有合并模型一致。
- 保留技能名 `ae:skill-creator`，只增强标题和描述：稳定入口比精确新命名更重要，用户仍可通过原有命令进入创建与更新流程。
- 把“更新”定义为 OpenCode 原生技能内容维护，而非 AE 内置技能发布：避免与 `ae:save-session-flow` 的 AE 内置模式和 `ae:update` 的插件更新语义冲突。

## 依赖 / 假设

- 已验证 `src/assets/skills/ae-skill-creator/SKILL.md` 当前只描述创建流程。
- 已验证 `src/assets/skills/ae-agent-creator/SKILL.md` 已支持更新既有代理，可作为交互边界参考。
- 已验证 `src/assets/skills/ae-save-session-flow/SKILL.md` 已包含 AE 内置技能创建或更新注册链路，不应被普通技能更新流程重复覆盖。

## 待定问题

### 推迟到规划

- [影响 R3][技术] 是否需要同步更新 `ae-skill-creator` 的脚本校验逻辑，还是只修改 `SKILL.md` 流程说明即可。
- [影响 R6][技术] 如果既有技能有关联命令，规划时需要确认是否扩展校验命令来检查同级命令一致性。

## 下一步

-> /ae-plan docs/ae/brainstorms/2026-05-08-skill-creator-update-flow-requirements.md
