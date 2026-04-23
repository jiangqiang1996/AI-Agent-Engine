# AE Plan Review Notes

- `ae:plan-review` 复用 document-review 审查角色
- 它额外关注实现顺序、测试场景、恢复规则和阶段交接
- 当计划未通过审查时，优先回到 `ae:plan` 修订，而不是直接进入 `ae:work`

## 计划审查专属代理

以下代理仅在 `documentType === 'plan'` 时被 `review-selector` 调度，不参与需求文档审查：

- **step-granularity-reviewer** — 审查计划步骤是否拆解至最小不可再分单元，确保每个步骤具有明确且唯一的产出物，步骤间不共享可变中间状态
- **batch-operation-reviewer** — 审查多文件操作步骤是否可脚本化批量执行，优先推荐脚本化方案并给出具体建议；当条件依赖或文件数 ≤ 2 时允许逐个操作
