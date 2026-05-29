# 交付工作流

本文件包含交付工作流（阶段 3-4）。仅在所有阶段 2 任务完成时加载。

## 阶段 3：质量检查

1. **运行核心质量检查**

   提交前运行完整测试套件和 lint。

2. **代码审查（必需）**

   每项变更都要审查。深度随变更风险调整。

   **层级 2：完整审查（默认）** — 调用 `ae:review domain:code mode:autofix`，审查当前实现产生的 Git diff 或会话变更，并传递 `plan:<path>` 作为实现意图上下文。`plan:<path>` 不得作为文档审查目标，不得触发需求、设计或计划文档审查、深化或转换。

   **层级 1：内联自审** — 仅在以下全部四条为真时：
   - 纯增量（仅新文件）
   - 单一关注点
   - 遵循模式（无新颖逻辑）
   - 忠实于计划

3. **最终验证**
   - 已消费 `references/verification-workflow.md` 输出的 `verification_result` 和实际 `validation_commands`
   - 所有任务已完成
   - 测试覆盖——新增/变更行为有对应测试
   - Lint 通过
   - 代码遵循已有模式
   - 无控制台错误或警告
   - 需求追溯完整
   - B worktree 交接继续执行场景已记录执行基线声明；若实现中出现阻断性需求/设计/计划歧义，已记录用户对具体实现决策的确认
   - 推迟问题已在执行中解决

4. **AE 门禁证明（必需，最终写操作之后执行）**
    - 调用 `ae-gate workflow:work checkpoint:final`
    - 传入 `verification_result` 中记录的实际运行 `validation_commands`
    - 传入与 `validation_commands` 一一对应的 `validation_results`，每条包含 `command`、`exit_code`、`output`、`executed_at`；用于通过门禁的 `exit_code` 必须为 0
    - 传入 `review_status`；正式代码交付必须为 `passed`，除非本轮无代码变更或审查工具不可用且最终回复明确标记为无法完成交付
    - 未审查时必须通过 `review_evidence: { type: 'not_run_reason' }` 说明原因，且不得把该状态作为正式代码交付已完成的依据
    - `review_status: passed` 或 `failed` 必须附带可验证 `review_evidence`，绑定当前可观察 worktree、branch、HEAD 和状态摘要
    - 传入 `git_operations`，没有 Git 写操作时传空数组
    - 传入 `worktree_decision`，正式功能交付 gate 仅允许记录创建、未创建新 worktree 并留在当前工作区或不适用；`transferred` / `cancelled` 只作为提前终止状态，不进入最终功能交付 gate
    - B worktree 继续执行且无 `plan_path` 时，必须传入 `handoff_path` 指向交接文件；`notes` 只能补充执行基线说明，不得把 A→B 继续执行写成"任务无需计划"
    - 若有 Git 写操作，优先传入 `git_operation_args` 和 `git_authorization_evidence`；`user_authorized_git_write` 只是声明证据，不能放行 Git 写操作
    - 若门禁阻断，先补齐阻断项再进入交付

最小 gate 场景：
- 无 Git 写操作：`git_operations: []`，记录 `worktree_decision`
- 非 Git 项目或 `git worktree` 不可用：显式 `worktree` 模式必须停止或请求降级确认，不得静默记录 `not_applicable` 后继续；`current-worktree` 可继续当前目录但必须说明风险；`auto` 降级当前目录时记录 `worktree_decision: not_applicable`
- 单独使用 `ae:work` 且未显式传入 `worktree`、`current-worktree`、`auto`：必须按任务大小给出推荐并询问是否创建新的 worktree；小任务推荐当前工作区，大任务推荐创建新 worktree；不得默认采用 `auto`
- 不创建新 worktree 并直接在当前分支执行、`current-worktree` 模式、`auto` 推荐当前工作区，或 `ae:lfg` / `ae:task-loop` 固定当前工作区执行：记录 `worktree_decision: rejected`，表示未创建新 worktree 并留在当前 `ctx.worktree` 或可观察 worktree；产物、验证、审查和最终门禁均归属于当前可观察 worktree。若当前会话是 A→B 后在目标 B worktree 中执行，则 B 会话最终交付优先记录 `worktree_decision: created`
- `ae:lfg` 或 `ae:task-loop` 调用 `ae:work` 时，必须固定当前工作区执行，禁止询问 worktree 模式，禁止创建 worktree，禁止把未显式传入的模式补齐或透传为 `auto`；`--no-worktree` 仅作为兼容输入映射到 `current-worktree`，不再作为默认策略中心
- 普通 Git 写操作：同时记录 `git_operation_args` 和覆盖相同参数数组的 `git_authorization_evidence`
- A→B 启动证明：授权证据区分 `operation_worktree` 与 `target_worktree`，`target_worktree` 必须是 A 项目根目录同级的 `../worktrees/<name>` 直接子目录，B 中最终 gate 的当前 worktree 必须匹配 `target_worktree`
- A→B 产物迁移：创建 B 后，A 会话只允许把当前任务已确定执行基线中真实存在的具体需求/计划/设计文件、`ae/graphs/` 和 `.opencode/ae.jsonc` 迁移到 B，并在交接文件中逐一显式引用实际迁移的文件或目录；迁移源路径和 B 中目标路径的存在性判断必须使用文件系统视角，即使路径被 `.gitignore` 忽略也必须按真实文件系统存在性迁移，不得用 `git status`、`git ls-files`、Git diff 或图谱结果判断这些文件不存在；其中 `.opencode/ae.jsonc` 只能作为已确定的 AE 项目配置上下文迁移并在交接文件中显式记录；禁止按 glob 批量复制未进入执行基线的需求/计划/设计文件；若存在多个候选需求/计划/设计文件，必须先选择唯一基线文件集；未迁移的需求/计划/设计、图谱或 AE 项目配置产物不在交接文件中出现，不得声称已复制；若设计已由计划承载，交接文件必须明确说明；不迁移 gate/review 运行时产物，不修改 B 中代码、测试或其他项目文件
- A→B 交接文件：创建 B 后，A 会话不得再写入 A worktree 的任何文件；交接文件必须通过 `ae-worktree-handoff` 工具生成，写入 `ae/handoffs/<timestamp>-worktree-handoff.md`；禁止自行拼接交接 Markdown
- B worktree 继续执行门禁基线：对 B worktree 继续执行来说只有交接文件是必需输入；若最终 gate 无 `plan_path`，应传入 `handoff_path`，并把交接文件作为 B worktree 继续执行基线；不得写成无需计划。`notes` 只能作为执行基线的声明型补充，不能替代可观察的交接文件证据
- A→B 最终交付：A 会话的 `worktree_decision: transferred` 只表示执行已转移；若当前可观察 worktree 匹配 A→B 交接文件或启动证明中的目标 B worktree，B 会话最终功能交付使用 `worktree_decision: created` 表示已在独立 worktree 中执行并交付，并覆盖普通当前工作区场景的 `rejected`；`transferred` 和 `cancelled` 不得通过最终功能交付 gate
- 未运行审查：`review_status: not_run` 搭配 `review_evidence.type: not_run_reason`，仅用于无代码变更、审查工具不可用或非正式交付说明；正式代码交付不得用该状态放行
- 已通过审查：`review_status: passed` 优先搭配已存在的 `report_path` 证据及当前工作区指纹；同一会话中来自真实 `ae:review` 或审查子代理的 `tool_output` 也可放行最终门禁；普通 task 正文、手写摘要或 `ae-review-proof` 工具返回本身不能独立放行

## 最终交付模板

正式代码或功能交付统一使用以下分区。当前 worktree 已执行完毕时，提示词必须尽可能简洁，只报告结果和证据；不要追加“下一步”“后续操作”“建议用户提交/部署/继续处理”等额外描述，除非存在阻断、未验证项或用户明确要求。

```md
## 已完成
- 事实性完成项，最多 3 条

## 已验证
- 实际运行的验证命令与结果，最多 3 条

## 未验证 / 无法验证
- 无；或未运行/无法运行项及原因，最多 2 条

## Git 操作状态
- 无；或本次执行的 Git 写操作与授权证据
- worktree decision、当前分支和 HEAD

## 门禁结果
- `ae-gate` 状态
- `proofPath` 或关键 blocker / warning

## 剩余风险
- 无；或仍需用户知道的真实风险，最多 2 条
```

使用规则：

- "已验证"只能写入可观察工作区状态、工具输出或可引用执行结果支撑的事实。
- 仅来自用户口头确认、工具参数或代理自述的内容，必须放入"未验证 / 无法验证"或"Git 操作状态"。
- 当前 worktree 已完成执行后，不输出独立的"下一步"或"后续操作"章节；若需要用户动作，只能在对应分区用一句话说明必要动作。
- A 会话执行 `git worktree add`、按需迁移真实存在且已确定的需求/计划/设计、图谱目录和 AE 项目配置可选上下文，并调用 `ae-worktree-handoff` 工具生成交接 Markdown 成功后，终止状态是"执行已转移 / 等待用户在 B 重启"，不是"功能交付完成"；A 不运行最终门禁来宣称功能交付。
- A 的终止提示必须包含目标 B 路径、交接 Markdown 路径，并逐字使用 `ae-worktree-handoff` 工具返回的简短交接提示。B worktree 通过 `ae:work <交接文件>` 读取结构化交接文件并继续，`/ae-work-continue` 只是查找交接文件后调用 `ae:work` 的便捷包装。对 B worktree 继续执行来说只有交接文件是必需输入，需求/计划/设计文档、图谱目录和 AE 项目配置只是可选上下文。
- 问答和只读审查可使用更轻量的对应输出，不强制套用整份模板。

## 阶段 4：交付

1. **准备证据上下文** — 识别可观察行为（UI、CLI、API）

2. **更新计划状态** — 仅在用户明确要求，或计划/交接文件声明需要状态回写时，将 `status: active` 更新为 `status: completed`。这只是交付状态记录，不得改写需求、设计、实现方案或验收标准；若当前是 B worktree 交接继续执行场景，默认不修改需求、设计或计划文档。若此步骤会改变工作区，必须发生在最终 `ae-gate` 之前；若已运行最终 `ae-gate` 后又发生变更，必须重新运行最终 `ae-gate`。

3. **提交（仅在用户明确要求时）**

   执行 `git add` 或 `git commit` 前，必须取得用户对目标仓库、目标分支、工作区、完整命令参数和授权来源的明确授权。未授权时必须停止提交步骤。

   ```bash
   git add <相关文件>
   git commit -m "feat(scope): 完整变更描述"
   ```

    只有在用户明确授权提交时，才执行提交步骤。若提交发生在最终 `ae-gate` 之后，必须重新运行最终 `ae-gate`，确保证明覆盖最新 HEAD 和 Git 写操作状态。交付时输出变更摘要、测试说明和证据上下文。

4. **通知用户** — 只按最终交付模板输出简洁结果，不追加后续工作说明

## 质量检查清单

交付前验证：

- [ ] 所有任务已完成
- [ ] 测试覆盖通过
- [ ] Lint 通过
- [ ] 代码遵循已有模式
- [ ] 提交消息遵循约定式格式
- [ ] 代码审查已完成
- [ ] 交付摘要包含摘要、测试说明和证据上下文
- [ ] `ae-gate` 最终门禁已通过并生成证明
