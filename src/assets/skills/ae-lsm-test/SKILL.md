---
name: ae:lsm-test
description: 生成 Living Spec Mesh 测试用例，并追踪需求、设计与实现映射
argument-hint: "[spec 路径|design 路径|需求路径|测试输入]"
---

# LSM 测试

## 角色

把规格和设计转成可执行的测试用例，建立 `TC-*` 追踪。

## 适用场景

- 用户明确要求完整 LSM 链路、Living Spec Mesh 或 `ae:lsm-test`
- 需要先补测试再进入实现
- 需要把需求和设计映射成验证步骤

## 不适用场景

- 普通测试修复或已有测试失败排查
- 没有显式 spec/design 且用户未选择 LSM
- 仅需要代码实现阶段的临时验证命令

## 输入处理

- 优先读取 spec 和 design 路径
- 若缺少上游路径，先询问，不要猜测
- 只接受用户显式路径或当前会话交接路径

## 执行流程

1. 读取 spec、设计和需求追溯表
2. 生成测试场景、边界条件和失败路径
3. 固化 `TC-*` 映射和验证证据要求
4. 输出供实现与验收复用的测试资产
5. 调用 `ae:review domain=document kind=document targets=document` 对 test 产物进行审查
6. 审查通过后，向用户推荐下一步技能

## 产物要求

- 使用 `references/test-template.md` 作为结构参考
- 包含上游路径、输入 ID、输出 ID、追溯表、跳过理由、验证证据、未验证项和下一步入口

## 安全边界

- 不默认从历史目录挑选测试模板
- 不新增远程 GitHub 写操作流程
- 不替代最终验收证据

## 完成标准

- 产物包含 `TC-*` 测试用例
- 覆盖 `R-*` 与 `U-*` 的追溯关系
- test 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步入口：审查通过后推荐 `ae:lsm-build`（执行实现并汇总构建报告）
