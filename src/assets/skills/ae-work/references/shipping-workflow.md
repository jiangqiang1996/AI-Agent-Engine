# 交付工作流

本文件包含交付工作流（阶段 3-4）。仅在所有阶段 2 任务完成时加载。

## 阶段 3：质量检查

1. **运行核心质量检查**

   提交前运行完整测试套件和 lint。

2. **代码审查（必需）**

   每项变更都要审查。深度随变更风险调整。

   **层级 2：完整审查（默认）** — 调用 `ae:review mode:autofix`，传递 `plan:<path>`。

   **层级 1：内联自审** — 仅在以下全部四条为真时：
   - 纯增量（仅新文件）
   - 单一关注点
   - 遵循模式（无新颖逻辑）
   - 忠实于计划

3. **最终验证**
   - 所有任务已完成
   - 测试覆盖——新增/变更行为有对应测试
   - Lint 通过
   - 代码遵循已有模式
   - 无控制台错误或警告
   - 需求追溯完整
   - 推迟问题已在执行中解决

4. **AE 门禁证明（必需）**
    - 调用 `ae-gate workflow:work checkpoint:final`
    - 传入实际运行的 `validation_commands`
    - 传入 `review_status`，未审查时必须通过 `review_evidence: { type: 'not_run_reason' }` 说明原因
    - `review_status: passed` 或 `failed` 必须附带可验证 `review_evidence`，绑定当前 `ctx.worktree`、branch、HEAD 和状态摘要
    - 传入 `git_operations`，没有 Git 写操作时传空数组
    - 传入 `worktree_decision`，记录创建、未创建新 worktree 并留在当前工作区、转移、取消或不适用
    - 若有 Git 写操作，优先传入 `git_operation_args` 和 `git_authorization_evidence`；`user_authorized_git_write` 只是声明证据，不能放行 Git 写操作
    - 若门禁阻断，先补齐阻断项再进入交付

最小 gate 场景：
- 无 Git 写操作：`git_operations: []`，记录 `worktree_decision`
- 非 Git 项目或 `git worktree` 不可用：显式 `worktree` 模式必须停止或请求降级确认，不得静默记录 `not_applicable` 后继续；`current-worktree` 可继续当前目录但必须说明风险；`auto` 降级当前目录时记录 `worktree_decision: not_applicable`
- 单独使用 `ae:work` 且未显式传入 `worktree`、`current-worktree`、`auto`：必须明确询问是否创建新的 worktree，不得默认采用 `auto`
- 不创建新 worktree 并直接在当前分支执行、`current-worktree` 模式、或 `auto` 推荐当前工作区：记录 `worktree_decision: rejected`，表示未创建新 worktree 并留在当前 `ctx.worktree`；产物、验证、审查和最终门禁均归属于当前 `ctx.worktree`。若当前会话是 A→B 后在目标 B worktree 中执行，则 B 会话最终交付优先记录 `worktree_decision: created`
- `ae:lfg` 或 `ae:task-loop` 调用 `ae:work` 时，调用方未显式传入 `worktree`、`current-worktree`、`auto` 的情况下必须补齐并透传 `auto`；`--no-worktree` 仅作为兼容输入映射到 `current-worktree`，不再作为默认策略中心
- 普通 Git 写操作：同时记录 `git_operation_args` 和覆盖相同参数数组的 `git_authorization_evidence`
- A→B 启动证明：授权证据区分 `operation_worktree` 与 `target_worktree`，`target_worktree` 必须是 A 项目根目录同级的 `../worktrees/<name>` 直接子目录，B 中最终 gate 的当前 worktree 必须匹配 `target_worktree`
- A→B 产物迁移：创建 B 后，A 会话只允许把当前任务已确定的需求/计划产物迁移到 B，包含 A 中未跟踪的 `docs/ae/brainstorms/*-requirements.md` 和 `docs/ae/plans/*-plan.md`；不迁移 gate/review 运行时产物，不修改 B 中代码、配置、测试或其他项目文件
- A→B 交接文件：创建 B 后，A 会话只允许在 B 写入 `docs/ae/handoffs/<timestamp>-worktree-handoff.md` 或等价明确路径，记录当前会话核心上下文；A 的结束提示必须包含在 B 新会话读取该文件继续的提示词
- A→B 最终交付：A 会话的 `worktree_decision: transferred` 只表示执行已转移；若当前 `ctx.worktree` 匹配 A→B 交接文件或启动证明中的目标 B worktree，B 会话最终功能交付使用 `worktree_decision: created` 表示已在独立 worktree 中执行并交付，并覆盖普通当前工作区场景的 `rejected`；`transferred` 和 `cancelled` 不得通过最终功能交付 gate
- 未运行审查：`review_status: not_run` 搭配 `review_evidence.type: not_run_reason`
- 已通过审查：`review_status: passed` 搭配已存在的 `report_path` 证据及当前工作区指纹；`tool_output` 只能作为声明记录，不能独立放行最终门禁

## 最终交付模板

正式代码或功能交付统一使用以下分区：

```md
## 已完成
- 事实性完成项

## 已验证
- 实际运行的验证命令与结果
- 可引用的审查或工具输出

## 未验证 / 无法验证
- 未运行、无法运行或只有声明证据的项目
- 原因

## Git 操作状态
- 本次是否执行 Git 写操作
- 若无，明确写“无”
- 若有，说明用户授权范围、可引用证据、结构化命令参数与结果
- 当前 `ctx.worktree`、`git rev-parse --show-toplevel`、当前分支、HEAD、worktree decision，以及是否与目标执行 worktree 一致

## 门禁结果
- `ae-gate` 状态
- `proofPath` 或关键 blocker / warning

## 剩余风险
- 尚未覆盖的边界、环境限制、后续观察点
```

使用规则：

- “已验证”只能写入可观察工作区状态、工具输出或可引用执行结果支撑的事实。
- 仅来自用户口头确认、工具参数或代理自述的内容，必须放入“未验证 / 无法验证”或“Git 操作状态”。
- A 会话执行 `git worktree add`、迁移当前任务需求/计划产物并写入交接 Markdown 成功后，终止状态是“执行已转移 / 等待用户在 B 重启”，不是“功能交付完成”；A 不运行最终门禁来宣称功能交付。
- A 的终止提示必须包含目标 B 路径、交接 Markdown 路径，以及类似“请在 B 目录打开 opencode，先读取 `<handoff-path>`、需求文档和计划文档，然后从待办事项继续执行”的可复制提示词。
- 问答和只读审查可使用更轻量的对应输出，不强制套用整份模板。

5. **准备运维验证计划（必需）**
   - 在交付摘要中添加 `## 部署后监控与验证` 章节
   - 包含：日志查询、指标/仪表板、健康信号、失败信号和回滚触发条件、验证窗口
   - 无生产影响时仍包含该章节，说明原因

## 阶段 4：交付

1. **准备证据上下文** — 识别可观察行为（UI、CLI、API）

2. **更新计划状态** — `status: active` → `status: completed`

3. **提交（仅在用户明确要求时）**

   执行 `git add` 或 `git commit` 前，必须取得用户对目标仓库、目标分支、工作区、完整命令参数和授权来源的明确授权。未授权时必须停止提交步骤。

   ```bash
   git add <相关文件>
   git commit -m "feat(scope): 完整变更描述"
   ```

    只有在用户明确授权提交时，才执行提交步骤。交付时输出变更摘要、测试说明、证据上下文和部署后监控与验证内容。

4. **通知用户** — 总结完成的工作、注明后续工作

## 质量检查清单

交付前验证：

- [ ] 所有任务已完成
- [ ] 测试覆盖通过
- [ ] Lint 通过
- [ ] 代码遵循已有模式
- [ ] 提交消息遵循约定式格式
- [ ] 代码审查已完成
- [ ] 交付摘要包含摘要、测试说明和部署后监控与验证章节
- [ ] `ae-gate` 最终门禁已通过并生成证明
