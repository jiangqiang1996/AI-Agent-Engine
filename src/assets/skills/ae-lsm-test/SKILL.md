---
name: ae:lsm-test
description: 生成 Living Spec Mesh 测试用例，并追踪需求、设计与实现映射
argument-hint: "[目标描述|spec 路径] [design 路径|测试输入]"
---

# LSM 测试用例

## 角色

基于 spec 和 design 生成测试用例文档，建立 `TC-*` 追踪，覆盖 `R-*` 与 `U-*` 的追溯关系。

## 适用场景

- 用户明确要求 LSM 链路、`ae:lsm-test` 或测试用例文档
- 需要基于需求和设计生成可执行的测试用例
- 用户通过目标描述直接启动测试用例生成，无需上游 spec/design 文件
- 需要建立需求、设计与测试的追溯关系

## 不适用场景

- 需要执行测试脚本，应使用 `ae:lsm-verify`

## 输入处理

1. 用户传入目标描述时，基于描述直接推导测试范围；目标描述是最基本的输入形式，无需任何上游文件
2. 用户显式传入 spec 路径和/或 design 路径时，以显式路径为准
3. 无显式输入时，根据当前会话讨论的主题，在工作区 `ae/lsm/spec/` 和 `ae/lsm/design/` 下搜索最符合的产物
4. 推测不到对应产物且无目标描述时，要求用户传入目标描述或路径
5. 不接受 `ae:lsm-build` 的产物作为输入

## 执行流程

1. 解析输入：目标描述 / spec 路径 / design 路径 / 会话推测
2. 若输入为目标描述（无上游文件）：根据描述推导测试范围、关键场景和约束，与用户确认后继续；此时 `R-*` 和 `U-*` ID 由本技能内联生成
3. 若输入为 spec/design 路径：读取 spec、design 和需求追溯表
4. 生成测试场景，覆盖正常路径、边界条件、异常路径和集成场景
5. 固化 `TC-*` 测试用例映射，每条映射到对应的 `R-*` 和 `U-*`
6. 生成测试用例文档，测试步骤使用结构化表格格式
7. 根据项目实际情况动态裁剪模板可选字段，裁剪标记使用 `<!-- trimmed: 原因 -->`
8. 调用 `ae:review domain=document scenes=test-case` 对 test 产物进行审查
9. 审查通过后，向用户推荐下一步技能

## 产物要求

- 产物路径：`ae/lsm/test/`
- 使用 `references/test-template.md` 作为结构参考，裁剪指引见 `references/lsm-trimming-guide.md`
- 元数据（上游路径、输入 ID、输出 ID、追溯表、验证证据、未验证项）全部由 frontmatter 承载，正文不含"元信息"章节
- 覆盖 `R-*` 与 `U-*` 的追溯关系
- 测试用例需覆盖正常路径、边界条件和异常路径；可选字段按模板 trimmingGuide 裁剪
- **800 行硬限制**：单个产物文件不得超过 800 行（含 frontmatter）；超过时必须拆分为文件夹结构，文件夹自包含
- 拆分后文件夹包含索引文件 `index.md` 和子文件；索引文件承载完整 frontmatter 元数据和子文件索引表（文件名、范围、作用），可直接理解每个子文件
- 拆分规范见 `references/lsm-splitting-guide.md`

## 安全边界

- 返工时仅修改本技能产物（test），不修改上游 spec/design 和下游产物
- 不新增远程写操作流程

## 完成标准

- 产物包含 `TC-*` 测试用例
- 覆盖 `R-*` 与 `U-*` 的追溯关系
- test 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步推荐：
  - 若 `ae:lsm-build` 已完成 → `ae:lsm-verify`
  - 若 `ae:lsm-build` 未完成 → `ae:lsm-build`
  - 或重新执行 `ae:lsm-test` 返工
