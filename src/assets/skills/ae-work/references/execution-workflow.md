# 执行工作流

本文件定义 `ae:work` 阶段 2。

## 执行前验证

修改任何项目文件之前，必须确认以下清单全部满足。任一项未满足时，停止执行并返回启动与 worktree 工作流补齐。

- 阶段 1 的 worktree 决策已完成：用户已确认 worktree 模式和分支策略，或 B worktree 交接文件验证通过并已记录 `worktree_decision: created`。
- 已实际运行 `git status --short`、`git branch --show-current` 并记录输出。
- 用户已确认在当前分支/工作区执行，或已创建新 worktree，或 B worktree 交接文件验证通过且当前目录匹配目标 B worktree。
- `worktree_decision` 值已确定：`created` / `rejected` / `transferred` / `cancelled` / `not_applicable`。

## design 契约一致性核验准备

修改项目文件前，检测是否存在 design 契约。存在时将契约维度作为实现对照依据，无 design 时降级为现状行为。

**检测：** 检查 `ae/designs/` 下是否存在与当前任务匹配的 design 目录。匹配规则：设计路径或交接文件中引用了 design 目录，或按设计标题/需求描述名在 `ae/designs/` 下找到对应目录。

**契约读取：** 读取 `design.md` 及其 Split Manifest 引用的各维度子文件。Split Manifest `status: unified` 时从 `design.md` 内联章节读取；`status: split` 时按 Split Manifest 引用的子文件路径读取；当维度子文件的 `sub_split: true` 时，进一步读取其 `sub_files` 中的二级子文件获取实际内容。

**对照依据准备：** 将以下维度作为实现对照依据，按 Split Manifest 声明的维度清单确定哪些维度存在：
- `ui-ux`：布局家族、组件契约、token、状态机
- `api`：端点、Schema、错误码
- `database`：schema、约束、索引
- `architecture`：模块边界、依赖方向
- `security`、`observability`、`non-functional`：对应约束

对照依据传递给执行循环中的开发域代理，要求实现时对照核验一致性。核验结果在 `references/verification-workflow.md` 中完成最终对照检查。

## 执行循环

按任务分析阶段选定的策略和 `parallel_groups` 构造 `DomainCallRequest`，并通过 Task 工具委托 `@development-domain` 执行。

### 串行执行

将有依赖的任务单元、执行顺序和设计中的 Execution note 写入 `DomainCallRequest.domainContext`，由开发域代理按顺序协调执行。

### 并行执行

按 `ae-task-analyzer` 输出的 `parallel_groups` 构造开发域调用上下文：

- 同一并行组（`is_parallel_safe=true`）作为可并发任务集合传给开发域代理。
- 若宿主未提供 Task 派发能力，开发域代理或主代理降级为按同一任务列表串行执行，并保留冲突检查、真实 Git diff/status 汇总与统一验证步骤。
- 不同并行组按 `execution_order` 顺序传递给开发域代理。
- `DomainCallRequest` 必须包含：任务 ID、允许文件、禁止文件、禁止命令、验证命令、冲突上报要求。

传给开发域代理的验证命令必须先过滤为专精执行安全命令。若验证需要全量测试、E2E、集成测试或共享资源，开发域代理必须在 `DomainExecutionResult` 中报告由主代理执行。

`DomainCallRequest` 必须要求开发域代理约束内部专精代理只处理分配给自己的文件和任务；不得暂存、提交、运行全量测试套件；不得修改共享配置、锁文件、迁移文件或未分配文件；不得启动服务、浏览器测试、E2E、集成测试，或任何会占用端口、数据库、缓存、固定临时目录等共享资源的命令。遇到跨任务依赖、文件冲突、共享资源需求或需要共享中间产物时，开发域代理必须停止并在 `DomainExecutionResult` 中报告。

## 失败处理

开发域代理返回 `failed` 或 `partial` 时：

- 已完成的域执行结果和 artifacts 保留。
- 失败的任务标记为需要串行重试。
- 先运行 Git diff/status 识别真实修改。
- 发现越权或污染修改时停止并请求用户决策，不得直接串行重试，不得自动覆盖或回滚。
- 在下一轮中单独执行失败任务。
- 如果重试仍失败，报告失败原因并询问用户。

## 测试与进度

变更前查找已有测试文件。新行为添加新测试、变更行为修改测试、删除行为移除测试。

编写测试前检查设计的测试场景是否覆盖正常路径、边界情况、错误/失败路径和集成场景。任务完成前检查回调/中间件、集成测试覆盖、失败时的孤立状态、跨接口一致性和错误策略。

每次重要变更后运行相关测试。每 2-3 个单元后审查简化机会。保持任务列表更新，记录阻碍和发现。

## 主代理汇总职责

开发域代理完成后，主代理必须：

1. 收集开发域代理返回的 `DomainExecutionResult`。
2. 检查 result 中的冲突、越权或 partial/failed 证据。
3. 独立运行 Git diff/status 检查真实修改文件，不只依赖域代理自报的 artifacts。
4. 将真实修改文件与每个任务的允许文件比对，确保无跨任务文件冲突或越权修改。
5. 修复集成问题。
6. 运行统一验证命令。
7. 更新最终任务状态。
8. 在验证和交付阶段执行最终检查，记录验证、审查和 Git 操作状态。

## Git 写操作

仅当用户已明确要求提交时，逻辑单元完成且测试通过后创建提交。不使用 WIP 消息。使用约定式格式。未获授权时只保留工作区变更并汇报建议提交点。

执行 `git add`、`git commit`、创建分支或 worktree 等 Git 写操作前，必须取得用户对目标仓库、目标分支、工作区、完整命令参数和授权来源的明确授权。

## 输出契约

本阶段必须输出执行状态、失败处理结果和需要验证阶段核验的变更证据要求。域代理自报不作为真实修改证据，主代理必须在验证阶段独立核验 Git diff/status。
