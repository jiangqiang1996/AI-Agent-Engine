---
name: ae:lsm-test
description: 生成 Living Spec Mesh 测试用例，并追踪需求、设计与实现映射
argument-hint: "[spec 路径] [design 路径|测试输入]"
---

# LSM 测试用例

## 角色

基于 spec 和 design 生成测试用例文档，建立 `TC-*` 追踪，覆盖 `R-*` 与 `U-*` 的追溯关系。

## 适用场景

- 用户明确要求 LSM 链路、`ae:lsm-test` 或测试用例文档
- 需要基于需求和设计生成可执行的测试用例
- 需要建立需求、设计与测试的追溯关系

## 不适用场景

- 没有 spec/design 且用户未选择 LSM
- 没有设计文档，应先执行 `ae:lsm-design`
- 没有需求文档，应先执行 `ae:lsm-spec`
- 需要执行测试脚本，应使用 `ae:lsm-verify`

## 输入处理

1. 用户显式传入 spec 路径和 design 路径时，以显式路径为准
2. 无显式输入时，根据当前会话讨论的主题，在工作区 `ae/lsm/spec/` 和 `ae/lsm/design/` 下搜索最符合的产物
3. spec 路径必须能推测到，否则明确拒绝执行并提示用户先执行 `ae:lsm-spec`
4. design 路径必须能推测到，否则明确拒绝执行并提示用户先执行 `ae:lsm-design`
5. 不接受 `ae:lsm-build` 的产物作为输入

## 执行流程

1. 读取 spec、design 和需求追溯表
2. 生成测试场景，覆盖正常路径、边界条件、异常路径和集成场景
3. 固化 `TC-*` 测试用例映射，每条映射到对应的 `R-*` 和 `U-*`
4. 生成测试用例文档
5. 调用 `ae:review domain=document scenes=test-case` 对 test 产物进行审查
6. 审查通过后，向用户推荐下一步技能

## 产物要求

- 产物路径：`ae/lsm/test/`
- 使用 `references/test-template.md` 作为结构参考
- 包含上游路径、输入 ID、输出 ID、追溯表、验证证据、未验证项和下一步入口
- 覆盖 `R-*` 与 `U-*` 的追溯关系
- 测试用例需覆盖正常路径、边界条件和异常路径

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
