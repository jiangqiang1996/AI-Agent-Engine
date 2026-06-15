---
name: ae:lsm-prototype
description: 在需要 UI 或交互时生成 Living Spec Mesh 原型资产，并记录跳过理由
argument-hint: "[设计路径|需求路径|原型输入|跳过理由]"
---

# LSM 原型

## 角色

只在确实需要界面、交互或可视化说明时补充原型资产。

## 适用场景

- 用户明确要求完整 LSM 链路、Living Spec Mesh 或 `ae:lsm-prototype`
- 设计明确要求 UI、流程图或交互草图
- 需要把原型映射回 `TC-*` / `V-*`

## 不适用场景

- 非 UI、非交互任务
- 普通前端初版设计任务，应使用 `ae:frontend-design`
- 浏览器验收任务，应使用 `ae:test-browser`

## 输入处理

- 优先读取设计路径和明确的 UI 需求
- 只接受用户显式路径或当前会话交接路径
- 若任务没有 UI 或交互，不强制生成原型，但必须记录跳过理由
- 浏览器相关验证必须先通过 `ae:chrome-devtools`

## 执行流程

1. 读取设计与 UI 约束
2. 生成原型草图、状态说明和跳过理由
3. 固化受影响的测试与验收 ID
4. 输出供 `ae:lsm-test` 和 `ae:lsm-build` 使用的原型资产
5. 调用 `ae:review domain=document kind=document targets=document` 对 prototype 产物进行审查
6. 审查通过后，向用户推荐下一步技能

## 产物要求

- 使用 `references/prototype-template.md` 作为结构参考
- 包含原型资产、跳过理由、影响到的 `TC-*`/`V-*` ID 和未验证项

## 安全边界

- 不绕过 `ae:chrome-devtools` 门禁
- 不直接调用 chrome-devtools MCP 工具
- 不把 `vision` 模型场景写成浏览器门禁替代条件

## 完成标准

- UI 任务有原型资产或明确跳过理由
- prototype 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 浏览器验证未执行时记录未验证项和残余风险
- 下一步入口：审查通过后推荐 `ae:lsm-test`（生成测试用例）；若原型被跳过，直接推荐 `ae:lsm-test` 和 `ae:lsm-build`
