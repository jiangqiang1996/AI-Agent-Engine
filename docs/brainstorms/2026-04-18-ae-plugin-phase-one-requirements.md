---
date: 2026-04-18
topic: ae-plugin-phase-one
---

# AE 插件一期需求边界

## Problem Frame

当前仓库要实现一套以 `compound-engineering-plugin` 为主参考、结合 `superpowers` 与 `oh-my-openagent` 优点的 AE 插件体系。目标不是做一个简化演示版，而是交付一条可实际使用、可跨会话继续、可精细控制每一步的工程工作流。

对用户而言，一期最直接的价值不是“更像 CE”，而是：在 opencode 环境里，通过统一、可发现的 `ae:*` / `/ae-*` 入口，以更低记忆负担完成从需求到执行的可恢复工程闭环；在流程中断后，可以基于既有文档和运行产物继续，而不是重新解释上下文或手工拼装下一步动作。

用户明确要求：
- 流程编排整体更接近 CE，而不是松散的命令集合
- 技能需要像 `superpowers` 一样能够被动态注册
- 命令需要像 `superpowers` 一样能出现在 `/` 命令提示里并被直接触发，而不是像当前 CE 一样主要停留在 skill 入口
- 每个阶段都需要支持反复修改、单独重入、跨会话继续
- 三类审查能力都必须保留 CE 式多 reviewer 并行审查机制，不能退化为单审查代理

一期的核心价值不是“把几个 prompt 搬过来”，而是把 CE 风格的工程方法落成一套 AE 版本的可重入插件能力，并把用户使用入口、审查机制、文档产物、恢复方式、README 说明和测试基线一起交付完整。

## Requirements

**入口与发现**

- R1. 一期所有公开技能统一使用 `ae:*` 命名空间，至少包含：`ae:brainstorm`、`ae:document-review`、`ae:plan`、`ae:plan-review`、`ae:work`、`ae:review`、`ae:lfg`
- R2. 一期所有公开命令统一使用连字符形式，至少包含与上述技能对应的可发现命令别名，例如 `/ae-brainstorm`、`/ae-plan`、`/ae-work`、`/ae-lfg`、`/ae-review-doc`、`/ae-review-plan`、`/ae-review-code`
- R3. 技能注册必须参考 `superpowers` 的动态注册方式，由插件在运行时注入技能目录，而不是依赖手工复制、手工配置或静态说明
- R4. 命令发现与触发体验必须达到 `superpowers` 可被 `/` 命令提示发现并直接执行的程度；不能只提供技能名或 README 文案而缺少真实可触发的命令入口
- R5. 技能是能力真源，命令是薄入口与触发别名。命令与技能之间的关系必须在用户体验上清晰且一致，不允许命令与技能语义漂移
- R31. 新用户默认应通过 `/ae-*` 命令发现并进入能力，进阶用户可直接使用 `ae:*` 技能；两套入口必须保持一一映射，并共享帮助信息、错误语义和恢复说明
- R48. `/ae-*` 命令提示可触发的实现路径优先参考 `superpowers` 在 opencode 中的做法；只要用户体验达到同等级别，内部实现可在规划阶段决定是否需要额外的命令入口层，但不得降低最终可发现性与可触发性要求

**参数与调用约定**

- R44. 一期所有 `ae:*` 技能与 `/ae-*` 命令的参数设计、`argument-hint` 表达方式、token 风格和自由文本尾参数语义都需要参考 CE，而不是重新发明另一套调用约定
- R45. 同一能力同时暴露为技能和命令时，参数名称、参数顺序、默认值、标志位语义与冲突处理规则必须保持一致，避免命令与技能出现两套不同心智模型
- R46. 对于 CE 中已有成熟约定的参数模式，一期默认沿用其形态，例如 `mode:*`、`plan:<path>`、`base:<ref>`、文档路径、PR/分支/自由描述等 token 风格；若 AE 必须偏离 CE，需求或规划中必须显式写明偏离理由

**核心流程编排**

- R6. `ae:brainstorm` 负责围绕用户需求进行需求澄清与需求文档产出，整体工作流参考 CE 的 `ce:brainstorm`，并在需求文档生成后自动触发文档审查
- R7. `ae:plan` 负责基于需求文档或用户直接输入生成计划文档，整体工作流参考 CE 的 `ce:plan`，并在计划文档生成后自动触发计划审查
- R8. `ae:work` 负责执行计划文档，整体工作流参考 CE 的 `ce:work`，执行后自动触发代码审查
- R9. `ae:lfg` 负责提供从需求进入到执行的总入口，整体行为参考 CE 的总流程型技能，基于各阶段可重入工作流推进，而不是把所有逻辑写成不可拆分的一次性黑盒流程
- R10. 当需求已存在、计划已存在或工作做到一半时，用户必须能够绕过前置阶段，直接重新进入某一阶段继续推进，例如新会话直接根据既有计划继续执行
- R32. 每个自动触发点都必须定义最小状态规则，至少覆盖：成功、无产物、空产物、审查失败、用户中止时如何停留、提示和恢复

**审查机制**

- R11. `ae:document-review` 必须实现 CE 风格的文档审查机制：根据文档类型和内容特征选择多个不同类型 reviewer，并行审查后进行 findings 汇总、去重、分类和 gate 处理
- R12. `ae:plan-review` 必须提供独立入口，但其能力边界、审查深度与行为标准需要完全参考 CE 的文档/计划审查思路，而不是降级成单次静态检查
- R13. `ae:review` 必须实现 CE 风格的代码审查机制：包含 always-on reviewer、conditional reviewer、并行子代理、结构化 findings、汇总去重、分级路由和 gate 处理
- R14. 三类审查能力都不能退化为“单个 reviewer 给出建议”的形式；一期必须严格交付多 reviewer 并行审查体系
- R15. 审查机制整体参考 CE，reviewer 选择与编排机制保持 CE 风格，但 reviewer catalog 一期按当前项目技术栈和真实命中场景裁剪，不要求机械迁移所有非相关语言或平台 reviewer
- R16. 审查模式集合参考 CE：文档/计划审查需要支持 CE 风格的交互与 headless 自动修文路径；代码审查需要支持 interactive、report-only、headless、autofix 等完整 CE 模式集
- R33. 一期必须明确三类审查的最小 reviewer 集、最小命中条件和最小模式契约，避免“完整参考 CE”在当前仓库中变成无上限实现
- R36. `ae:document-review` 与 `ae:plan-review` 一期最小 reviewer 契约需要在需求阶段锁定：`coherence-reviewer`、`feasibility-reviewer` 为 always-on；`product-lens-reviewer`、`scope-guardian-reviewer`、`adversarial-document-reviewer` 为核心 conditional reviewer；`design-lens-reviewer`、`security-lens-reviewer` 按文档内容命中时启用
- R37. `ae:review` 一期最小 reviewer 契约需要在需求阶段锁定：`correctness-reviewer`、`testing-reviewer`、`maintainability-reviewer`、`project-standards-reviewer` 为 always-on；`security-reviewer`、`performance-reviewer`、`api-contract-reviewer`、`reliability-reviewer`、`cli-readiness-reviewer`、`kieran-typescript-reviewer`、`adversarial-reviewer` 作为当前栈优先的核心 conditional reviewer；其他 reviewer 后续按命中场景再扩展

**Agent 迁移与汉化**

- R39. 必须完整审计 CE 插件当前 `agents/` 目录中的 agent，逐个归类到“一期必需迁入”“一期允许适当镀金迁入”“暂不首发但保留清单”三类，禁止遗漏任何一个已有 agent
- R40. 一期必需迁入并优先汉化的 CE agents 至少包括：`coherence-reviewer`、`feasibility-reviewer`、`product-lens-reviewer`、`scope-guardian-reviewer`、`adversarial-document-reviewer`、`design-lens-reviewer`、`security-lens-reviewer`、`repo-research-analyst`、`learnings-researcher`、`framework-docs-researcher`、`best-practices-researcher`、`spec-flow-analyzer`、`correctness-reviewer`、`testing-reviewer`、`maintainability-reviewer`、`project-standards-reviewer`、`agent-native-reviewer`、`security-reviewer`、`performance-reviewer`、`api-contract-reviewer`、`reliability-reviewer`、`adversarial-reviewer`、`cli-readiness-reviewer`、`previous-comments-reviewer`、`kieran-typescript-reviewer`
- R41. 一期允许适当镀金提前迁入、但不应影响主链路交付的高价值 CE agents 包括：`architecture-strategist`、`code-simplicity-reviewer`、`pattern-recognition-specialist`、`performance-oracle`、`security-sentinel`、`cli-agent-readiness-reviewer`、`session-historian`、`git-history-analyzer`、`issue-intelligence-analyst`、`web-researcher`、`slack-researcher`、`design-implementation-reviewer`、`design-iterator`、`figma-design-sync`
- R42. 当前一期暂不首发、但必须显式保留清单与后续迁入理由的 CE agents 包括：`pr-comment-resolver`、`schema-drift-detector`、`data-migrations-reviewer`、`deployment-verification-agent`、`data-integrity-guardian`、`data-migration-expert`、`dhh-rails-reviewer`、`kieran-rails-reviewer`、`kieran-python-reviewer`、`julik-frontend-races-reviewer`、`ankane-readme-writer`
- R43. 一期迁入的 CE agents 必须尽可能汉化：至少包括描述、提示词、输出说明、用户可见帮助文案和 README 对应说明。若为兼容性保留英文稳定标识，也必须同时提供清晰的中文角色说明，避免只把英文 agent 名直接暴露给用户

**计划与执行形态**

- R17. `ae:plan` 产出的计划文档必须是 CE 式 living plan，而不是一次性静态任务清单；该文档需要支持后续执行、回写进度、再次审查和跨会话继续
- R18. `ae:work` 必须强调小任务拆分。单个子任务应尽可能小，避免占用过大的会话上下文
- R19. `ae:work` 的主编排器本身应主要负责拆分、派发、汇总、验证与阶段推进；真正改代码的叶子任务尽量交给子代理执行
- R20. 互不依赖的子任务允许并行子代理执行；存在明确顺序依赖的任务必须串行执行
- R21. 执行阶段需要支持像 CE 一样的精细控制：阶段可暂停、可修改、可继续、可重跑，而不是只能从头重新执行整条链路

**跨会话持续性**

- R22. 一期的恢复方式必须以文件产物为事实来源，整体参考 CE：需求文档、计划文档和审查运行产物需要支撑跨会话继续
- R23. 新会话需要能够基于 `docs/brainstorms/` 中的需求文档继续规划，基于 `docs/plans/` 中的计划继续执行，并基于 `.context/...` 中的运行产物继续审查或问题处理
- R24. 一期不要求额外引入一套复杂的工作流状态机作为恢复前提；跨会话恢复应以 CE 风格的文档与产物驱动方式为主
- R34. 文件驱动恢复必须覆盖异常情况，至少定义：找不到产物、空产物、损坏或过期产物、多个候选产物、需求与计划不一致时的处理方式

**文档与 README**

- R25. 一期必须更新 `README.md`，且 README 需要作为完整使用手册存在，而不是只有安装说明或概览说明
- R26. README 必须以表格形式详细记录一期交付的所有公开入口，包括技能、命令、功能、触发场景、输入方式、输出产物、支持模式、是否支持跨会话继续、典型使用方式
- R27. README 除入口说明外，还需要用结构化表格记录阶段流转关系、审查模式、典型产物路径以及跨会话恢复方式，确保用户无需阅读源码即可理解如何使用这套 AE 流程
- R47. README 中必须为每个公开技能和命令提供参数表，至少说明：参数名或 token 形式、是否必填、含义、默认行为、冲突规则、以及与 CE 对应能力的关系

**测试与质量基线**

- R28. 一期测试边界参考 CE，不能只停留在单元测试
- R29. 一期必须覆盖关键集成链路的自动测试，至少包括：动态技能注册、命令发现与 `/` 提示可触发、需求/计划/代码审查编排主链路、以及基于文档和产物的跨会话恢复能力
- R30. 一期交付质量应按“可实际使用的工程工作流”来衡量，而不是按“主要流程看起来能跑一次”来衡量
- R35. 动态技能注册与 `/` 命令可发现性必须先经过最小技术验证；若当前平台能力与 CE 或参考项目存在差异，需要在规划阶段显式定义降级方案，而不是在实现阶段隐式放弃要求
- R38. 动态技能注册与 `/` 命令可发现性的验证失败处理必须被明确约束：若不能同时满足两者，一期不得在不改写成功标准的情况下被判定为完成；规划阶段必须显式选择满足要求的插件形态、组合插件方案或生成式命令资产方案，而不能静默降级

## Delivery Priorities

- P0. 先锁定一期最核心闭环：动态技能注册可行性、`/ae-*` 命令可发现性、`已有需求文档 -> 计划 -> 执行 -> 代码审查 -> 跨会话继续` 这一首要用户旅程、三类审查的最小可用多 reviewer 机制、文件驱动恢复
- P1. 在不削弱 P0 的前提下补齐 README 完整手册化输出、命令/技能帮助一致性以及关键集成测试
- P2. reviewer catalog 在当前栈最小集合稳定后再扩展到更多条件分支和更细的命中规则，但不得影响一期主链路成立
- P2. 允许提前迁入的镀金 agents 只能在不拖慢 P0/P1 的前提下带入；任何镀金迁入都不能替代一期必需 agents 的交付

## Success Criteria

- 用户可以通过 `ae:*` 技能和 `/ae-*` 命令两套入口使用一期能力，且命令能真实出现在 `/` 命令提示中并触发
- 新用户可以优先通过 `/ae-*` 发现入口，进阶用户可以直接使用 `ae:*`；两套入口的帮助语义和恢复说明保持一致
- 用户可以从需求开始进入 `ae:brainstorm -> ae:document-review -> ae:plan -> ae:plan-review -> ae:work -> ae:review` 的主链路
- `ae:lfg` / `/ae-lfg` 可以作为总入口启动可重入主链路，并在需要人工决策、产物缺失或上游失败时给出明确停留点与继续方式
- 用户可以跳过不需要的前置阶段，例如直接对既有需求文档做计划，或直接对既有计划继续执行
- 文档审查、计划审查、代码审查都能启动多类型 reviewer 并行审查，而不是单代理审查
- `ae:plan` 生成的计划文档可以在后续会话中继续执行、更新与复审
- `ae:work` 执行时能够把任务拆小，并把真正的代码改动尽量下发给子代理；互不依赖任务可以并行
- 流程中断后，新会话无需重新复述完整背景，只需提供既有需求文档、计划文档或审查产物即可继续推进
- `README.md` 可以作为一期完整使用手册，表格化说明所有入口与使用方式
- 自动测试能够证明动态技能注册、命令发现与提示、关键审查编排、以及跨会话恢复这些能力真实存在

## Scope Boundaries

- 一期不是为了复制 CE 全部生态能力；重点是交付 AE 的主工程链路与其所依赖的核心机制
- 一期不构建通用 DAG/状态机式工作流平台
- 一期不要求迁移所有与当前项目无关的 reviewer persona、语言栈 reviewer 或外围技能
- 一期不要求把 proof、todo 全家桶、Slack、图像生成等 CE 扩展能力全部纳入公开目标，除非主链路明确依赖
- 一期不以“单会话一键跑完所有事情”为主要目标；重点是可精细控制、可重复修改、可跨会话继续

## Key Decisions

- **以 CE 为默认参照物**：其他不明确的地方一律参考 CE，包括流程形态、细粒度控制方式、跨会话继续方式和测试边界
- **技能优先，命令补齐触发体验**：能力真源在 `ae:*` 技能，命令负责让用户通过 `/` 命令提示直接发现与触发
- **命令是默认发现入口**：新用户默认从 `/ae-*` 进入，技能名保留给需要显式调用或组合编排的场景
- **命令触发体验优先参考 superpowers**：对用户而言，目标是达到 `superpowers` 那种可发现、可触发的命令体验，而不是要求当前就锁死内部插件分层细节
- **动态注册而非静态搬运**：技能注册必须借鉴 `superpowers` 的动态技能注册方式，避免手工安装心智负担
- **审查机制不做降级版**：一期直接交付 CE 风格完整审查链路，而不是先用单 reviewer 占位
- **reviewer catalog 按当前栈裁剪**：保留 CE 的机制和质量标准，但避免一期无意义迁移不命中的 reviewer
- **AE 在入口与 reviewer 范围上有意区别于 CE**：默认发现入口优先命令，reviewer 先围绕当前栈和主链路收敛，再逐步扩展到更广目录
- **Agent 迁移要求完整盘点且优先汉化**：一期不是随意挑几类 reviewer 使用，而是要对 CE agents 做完整分桶，首发必需项优先汉化落地，可选高价值项允许适当镀金迁入
- **执行器以调度为主**：主编排器负责拆分与验证，叶子执行尽量交给子代理，以控制单任务上下文体积
- **文件驱动恢复**：跨会话继续以文档和运行产物为依据，而不是依赖额外状态机或会话记忆
- **先验证平台可行性，再承诺完整体验**：动态技能注册和 `/` 命令可发现性属于一期前置验证门，不允许实现阶段再临时弱化
- **README 是一期交付物的一部分**：不是收尾时顺手补文档，而是能力说明和使用方式的正式交付件

## Dependencies / Assumptions

- 参考实现主要来自 `superpowers`、`oh-my-openagent`、`compound-engineering-plugin`
- 当前项目的一期实现允许在 CE 的结构基础上汉化并结合本仓库需求做调整，而不是要求逐字照搬
- 命令发现与动态技能注册能力需要在规划起点先做最小技术验证，验证结果将决定是否需要定义显式降级方案

## Outstanding Questions

### Deferred to Planning

- [Affects R3-R5][Technical] 在当前仓库中，动态技能注册与命令可发现性分别应如何落到插件 hook、目录布局与配置注入上，才能同时满足 `superpowers` 风格动态注册和 `/` 命令提示触发要求？
- [Affects R11-R16][Technical] 一期按当前栈裁剪时，文档审查、计划审查、代码审查分别最小需要迁移哪些 reviewer persona 与条件选择规则，才能保持 CE 级别质量门槛？
- [Affects R17-R24][Technical] `docs/brainstorms/`、`docs/plans/` 与 `.context/...` 的具体产物命名、目录约定和恢复约定在当前仓库中应如何设计，才能既参考 CE 又适配本项目？
- [Affects R16][Technical] 文档/计划/代码审查的 headless、autofix、report-only 等模式在当前项目中应如何组织成共享机制与独立入口，以兼顾 CE 一致性与本项目可维护性？
- [Affects R29][Technical] 哪些测试应该做成单元测试，哪些关键链路应做成集成测试，才能既满足 CE 级别质量要求又避免一期测试范围失控？

## Next Steps

-> 进入规划阶段，为一期 AE 插件能力输出结构化实现计划，并优先验证动态技能注册与 `/` 命令可发现性的可行性
