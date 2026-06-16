---
name: ae:lsm-build
description: 执行 Living Spec Mesh 构建流程，汇总实现、验证与 Git 状态证据
argument-hint: "[design 路径|实现范围|上游路径]"
---

# LSM 构建

## 角色

基于设计文档内联编码实现，产出实现代码和构建报告，保留变更与 Git 证据。不调用 `ae:work`，所有变更由本技能直接执行。

## 适用场景

- 用户明确要求 LSM 链路、`ae:lsm-build` 或编码实现
- 已有设计文档，需要落地实现
- 需要把实现结果整理成构建报告

## 不适用场景

- 缺少设计文档且用户未选择 LSM，应先执行 `ae:lsm-design`
- 仅需要测试用例文档，应使用 `ae:lsm-test`

## 输入处理

1. 用户显式传入 design 路径时，以显式路径为准
2. 无显式输入时，根据当前会话讨论的主题，在工作区 `ae/lsm/design/` 下搜索最符合的 design 产物
3. 推测不到对应的 design 产物时，明确拒绝执行并提示用户传入 design 路径或先执行 `ae:lsm-design`
4. 不接受 `ae:lsm-test` 的产物作为输入

## 执行流程

1. 读取设计文档和需求追溯表
2. 分析实现范围、接口边界和约束
3. 内联编码实现：直接编辑文件、运行命令，所有变更由本技能执行
4. 记录变更文件、验证命令和 Git 状态
5. 生成构建报告，根据项目实际情况动态裁剪模板可选字段，裁剪标记使用 `<!-- trimmed: 原因 -->`
6. 调用 `ae:review domain=document scenes=code` 对 build 产物进行审查
7. 审查通过后，向用户推荐下一步技能

## 产物要求

- 产物路径：`ae/lsm/build/`
- 使用 `references/build-report-template.md` 作为结构参考，裁剪指引见 spec 的 `references/lsm-trimming-guide.md`
- 元数据（上游路径、输入 ID、追溯表、验证证据、未验证项）全部由 frontmatter 承载，正文不含"元信息"章节
- 记录执行范围、变更文件、验证命令、结果；可选字段按模板 trimmingGuide 裁剪

## 安全边界

- 不隐藏未验证项
- 不新增远程写操作流程
- 返工时仅修改本技能产物（build），不修改上游 design 和下游产物
- 编码实现时遵守项目已有代码风格和架构约定

## 完成标准

- 构建报告包含验证命令和结果
- Git 操作状态可复核
- build 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步推荐：
  - `ae:lsm-test`（生成测试用例）或 `ae:lsm-verify`（若 test 已完成）
  - 或重新执行 `ae:lsm-build` 返工
