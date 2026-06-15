---
name: ae:lsm-build
description: 执行 Living Spec Mesh 构建流程，汇总实现、验证与 Git 状态证据
argument-hint: "[实现范围|上游路径|验证要求]"
---

# LSM 构建

## 角色

执行实现并产出构建报告，保留变更、验证和 Git 证据。

## 适用场景

- 用户明确要求完整 LSM 链路、Living Spec Mesh 或 `ae:lsm-build`
- 已有 spec、设计和测试输入，需要真正落地实现
- 需要把实现结果整理成构建报告

## 不适用场景

- 普通 `ae:work` 实现任务
- 探索性调试或环境修复，应使用 `ae:task-loop`
- 缺少上游 LSM 产物且用户未选择 LSM

## 输入处理

- 优先读取上游路径和验证要求
- 只接受用户显式路径或当前会话交接路径
- 若缺少上游输入，先提示补全
- 浏览器、接口或图谱工具仅按需要使用，不作为默认门禁

## 执行流程

1. 读取实现范围、上游路径和验证要求
2. 必须调用 `ae:work` 执行代码或文件修改，本技能只传递 LSM 上游约束并汇总报告
3. 记录变更文件、验证命令和 Git 状态
4. 输出构建报告，包含 `V-*` 验收证据和残余风险
5. 调用 `ae:review domain=document kind=document targets=document` 对 build 产物进行审查
6. 审查通过后，向用户推荐下一步技能

## 产物要求

- 使用 `references/build-report-template.md` 作为结构参考
- 记录执行范围、变更文件、验证命令、结果、未完成项和 Git 操作状态

## 安全边界

- 不隐藏未验证项
- 不绕过 `ae:work` 的 Git 状态、worktree 决策、验证和审查门禁
- 不新增远程 GitHub 写操作流程
- 不替代通用 `ae:review`

## 完成标准

- 构建报告包含验证命令和结果
- Git 操作状态可复核
- build 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步入口：审查通过后推荐 `ae:review domain=general kind=general mode=interactive`（确认整个 LSM 链路完整性）
