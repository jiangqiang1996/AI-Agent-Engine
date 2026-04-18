# AE Document Review Contract

- 文档审查默认作为 gate 使用
- 先用 `ae-review-contract` 获取 reviewer team
- 再并行执行 reviewers
- 对重复 findings 去重合并
- 当存在 P0/P1 问题时，优先停留在文档修订阶段
