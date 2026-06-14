---
name: ae:lsm-acceptance
description: 汇总 Living Spec Mesh 验收证据、未验证项与残余风险，并交给通用审查入口
argument-hint: "[构建报告路径|上游路径|验收证据]"
---

# LSM 验收

## 角色

汇总 `V-*` 验收证据，整理未验证项和残余风险，最后交给通用审查入口。

## 适用场景

- 用户明确要求完整 LSM 链路、Living Spec Mesh 或 `ae:lsm-acceptance`
- 构建完成后，需要形成可复核验收材料
- 需要把命令输出、截图、接口响应或人工确认整理成证据

## 不适用场景

- 普通代码 diff 审查，应使用 `ae:review`
- 浏览器端到端验收本身，应使用 `ae:test-browser`
- 接口测试本身，应使用 `ae:api-tester`

## 输入处理

- 优先读取构建报告和验收证据
- 只接受用户显式路径或当前会话交接路径
- 若缺少上游路径，先询问，不要猜测
- 浏览器流程必须先完成 `ae:chrome-devtools` 门禁

## 执行流程

1. 读取构建报告、上游路径和证据
2. 汇总 `V-*` 证据、未验证项和风险
3. 标明是否需要通用审查再确认
4. 输出验收材料供 `ae:review` 复核

## 产物要求

- 使用 `references/acceptance-template.md` 作为结构参考
- 记录 `V-*` 验收证据、证据来源、验证时间、未验证项和残余风险

## 安全边界

- 不新增 LSM 专属审查者
- 不绕过通用 `ae:review`
- 不直接调用 chrome-devtools MCP 工具

## 完成标准

- 验收材料包含 `V-*` 或明确未验证项
- 残余风险可审查
- 下一步入口指向 `ae:review`
