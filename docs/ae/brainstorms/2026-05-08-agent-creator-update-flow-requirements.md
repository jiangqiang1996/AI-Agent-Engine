---
type: brainstorm
status: drafted
date: 2026-05-08
topic: agent-creator-update-flow
---

# Agent Creator 更新流程

## 问题框架

`ae:agent-creator` 已在适用场景中声明支持“更新既有代理”，但正文工作流仍主要围绕初始化新代理展开。用户希望该技能也像 `ae:skill-creator` 的增强方向一样，把更新既有 OpenCode 原生代理作为一等流程表达。

仓库扫描显示，`src/assets/skills/ae-agent-creator/SKILL.md` 已采用“创建或调整”的合并模型，因此不需要新增独立 `ae:agent-updater`。更合适的方向是补齐现有技能中的更新流程、冲突处理和交付说明，让用户提出“更新某个代理”时仍由 `ae:agent-creator` 自然承接。

后续规划可参考 `docs/ae/plans/2026-05-08-002-enhance-skill-creator-update-flow-plan.md` 和 `src/assets/skills/ae-skill-creator/` 的增强方式：保留 creator 入口、不新增 updater、创建路径继续使用初始化脚本、更新路径改为读取旧内容后最小编辑、确认后写入并校验。该参考只用于流程模式对齐，不应把技能专属路径或命令规则照搬到代理场景。

## 需求

**能力范围**
- R1. `ae:agent-creator` 应明确支持创建新代理和更新既有代理两类场景 → 验收: 技能标题、描述、适用场景或工作流中能直接识别“更新既有代理”的入口，不再只依赖单条适用场景说明。
- R2. 更新流程应覆盖项目级和全局级 OpenCode 原生代理，并保持默认项目级、全局级需明确要求的安全边界 → 验收: 文档中项目级与全局级代理更新路径边界清晰，且全局写入前仍要求说明影响范围。
- R3. 更新既有代理时应先读取旧内容并识别更新目标、保留内容、冲突点和需要用户确认的变更 → 验收: 工作流包含读取现有代理文件、展示更新摘要或草案、确认后写入的步骤。
- R4. 更新目标解析应避免同名项目级与全局级代理冲突 → 验收: 当项目级和全局级存在同名代理，或用户未明确作用域时，流程要求列出候选并让用户选择；全局目标仍需明确确认。
- R5. 更新草案应默认采用最小编辑策略，避免整篇重写造成语义覆盖 → 验收: 草案或摘要至少展示 frontmatter 字段变化、正文增删摘要、敏感字段变化，以及将被删除或重写的旧段落。
- R6. 如既有代理存在关联命令，更新流程应提示检查命令是否仍与代理职责一致 → 验收: 工作流或交付说明包含关联命令检查；默认不创建或重写命令，除非用户明确要求。

**非目标与边界**
- R7. 本次不新增独立 `ae:agent-updater` 公开技能，除非规划阶段明确否决扩展现有技能 → 验收: 后续计划默认修改 `ae:agent-creator`；仅当扩展现有技能被明确否决时，才把新增技能作为备选方案。
- R8. `ae:agent-creator` 不应承担 AE 内置代理注册链路的完整维护职责；涉及 `src/assets/agents/`、schema、catalog 的内置代理固化应由专门规划处理 → 验收: 文档边界不把普通 OpenCode 原生代理更新误写为 AE 内置代理注册流程。
- R9. 更新流程不应默认放宽权限、修改 destructive Git 权限或扩大工具范围；权限变化必须作为高风险更新点单独确认 → 验收: 工作流要求识别 `tools`、`permission`、`mode` 等敏感字段变更并展示给用户确认。

## 成功标准

- 用户提出“更新某个代理”时，`ae:agent-creator` 能自然接住请求，而不是引导用户寻找另一个技能。
- 创建和更新共用同一套命名、作用域、路径、mode、权限和校验规则，减少公开技能入口重复。
- 更新既有代理时不会静默覆盖用户已有提示词、权限或命令绑定，必须先展示草案或冲突处理方案。
- 与 `ae:skill-creator` 的“创建或更新”增强方向保持一致，同时保留代理特有的 mode、tools、permission 和命令绑定检查。
- 与 `docs/ae/plans/2026-05-08-002-enhance-skill-creator-update-flow-plan.md` 的安全模型保持一致：初始化脚本只用于创建，更新流程不引入覆盖型脚本或 updater 入口。

## 范围边界

- 不新增 `ae:agent-updater`，除非规划证明独立入口更清晰。
- 不改变 `ae:update` 的含义；它仍是 AE 插件安装或源码维护更新能力，不是代理内容更新器。
- 不把普通项目代理更新流程扩展为默认修改 AE 插件源码注册文件。
- 不要求用户项目存在本仓库的 `src/`、`dist/`、`.opencode/plugins/` 或 `docs/ae/` 结构。

## 关键决策

- 扩展现有 `ae:agent-creator`，不新增技能：现有技能已经声明“创建或调整”，补齐更新流程比新增入口更小、更一致。
- 保留技能名 `ae:agent-creator`：稳定入口比精确新命名更重要，用户仍可通过原有命令进入创建与更新流程。
- 把“更新”定义为 OpenCode 原生代理内容维护，而非 AE 内置代理发布：避免把普通项目能力与插件源码维护混淆。
- 参考 `ae:skill-creator` 更新计划的流程模式：创建和更新分支分离，创建才使用初始化脚本，更新必须读取旧文件并展示草案；但代理更新必须额外处理 `mode`、`tools`、`permission` 与关联命令绑定。

## 依赖 / 假设

- 已验证 `src/assets/skills/ae-agent-creator/SKILL.md` 当前适用场景包含“更新既有代理”，但工作流仍偏创建。
- 已验证 `src/assets/skills/ae-skill-creator/SKILL.md` 当前只描述创建流程，上一轮需求已决定将其增强为创建与更新。
- 已读取 `docs/ae/plans/2026-05-08-002-enhance-skill-creator-update-flow-plan.md`，其中“文档流程增强优先、不改初始化脚本覆盖语义、不新增 updater 入口”的模型可作为本需求规划参考。

## 待定问题

### 推迟到规划

- [影响 R1][技术] 是否只需修改 `src/assets/skills/ae-agent-creator/SKILL.md` 流程说明，还是需要同步调整 `argument-hint` 或帮助/catalog 描述；规划时应先产出公开入口影响清单，再拆分实施步骤。
- [影响 R6][技术] 是否需要在现有校验脚本中增加代理与关联命令一致性检查，或仅在技能流程中提示人工检查；规划时应先决定自动校验、人工提示或暂不处理。

## 下一步

-> /ae-plan docs/ae/brainstorms/2026-05-08-agent-creator-update-flow-requirements.md
