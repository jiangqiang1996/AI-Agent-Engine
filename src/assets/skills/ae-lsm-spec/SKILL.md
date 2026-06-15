---
name: ae:lsm-spec
description: 生成 Living Spec Mesh 规格，明确软件工程交付目标、需求 ID 与上游输入边界
argument-hint: "[目标描述|需求路径|上游交接路径]"
---

# LSM 规格

## 角色

生成完整软件工程交付链的规格起点，固定需求 ID、上游边界和后续阶段入口。

## 适用场景

- 用户明确要求完整 LSM 链路、Living Spec Mesh 或 `ae:lsm-spec`
- 需要把目标拆成可追溯的 `R-*` 需求和下游输入
- 需要从明确上游路径或交接文件继续，而不是盲扫历史目录

## 不适用场景

- 普通“修复 bug”“给功能写计划”“执行小改动”“审查代码 diff”
- 非软件任务或单阶段软件任务
- 仅需要通用 `ae:prd`、`ae:plan`、`ae:work`、`ae:lfg` 或 `ae:review`

## 输入处理

- 优先接受仓库相对路径或会话交接路径
- 如果缺少上游路径，先询问，不要猜测历史来源
- 只读取用户显式路径或当前会话交接路径

## 执行流程

1. 读取显式目标、需求路径或交接路径
2. 固化范围、成功标准、非目标和依赖
3. 生成 `R-*` 需求 ID 与上游追溯表
4. 输出供 `ae:lsm-design` 使用的 spec 资产
5. 调用 `ae:review domain=document kind=document targets=document` 对 spec 产物进行审查
6. 审查通过后，向用户推荐下一步技能

## 产物要求

- 使用 `references/spec-template.md` 作为结构参考
- 包含上游路径、输入 ID、输出 ID、追溯表、跳过理由、验证证据、未验证项和下一步入口

## 安全边界

- 不自动选择历史目录中的产物
- 不新增 GitHub Issue、Pull Request、Release 或推送远程分支流程
- 不把 LSM 写成普通项目默认流程

## 完成标准

- 产物包含 `R-*` 需求 ID
- spec 已通过 `ae:review` 审查，审查结论为 passed 或有明确的未阻断发现
- 下一步入口：审查通过后推荐 `ae:lsm-design`（将规格转为设计）
