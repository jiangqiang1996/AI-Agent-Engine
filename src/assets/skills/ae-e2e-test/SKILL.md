---
name: ae:e2e-test
description: "浏览器自动化测试，支持仅测试和编写脚本两种模式，自动检测分辨率默认 2K，底层依赖 ae:playwright"
argument-hint: "[url|功能描述] [mode=test-only|script(可选)] [设计用例路径(可选)]"
---

# ae:e2e-test

## 角色

浏览器端到端测试执行器。支持两种模式：仅测试模式直接调用 `ae:playwright` 交互测试并保存通过的命令序列；编写脚本模式生成 Playwright `.spec.ts` 测试文件后运行。有设计用例时从用例规格编译骨架；无则从页面描述生成。自动检测项目类型并设置分辨率，默认 2K（2560×1440）。

## 适用场景

- 用户要求对指定 URL 或功能进行 E2E 测试
- 用户要求仅交互测试不生成脚本（mode=test-only）
- 用户要求编写测试脚本并运行（mode=script）
- 用户提供了设计用例路径，需要从用例规格编译 Playwright 骨架
- 用户要求执行已有 E2E 测试
- 用户要求修复失败的 E2E 测试（triage 判定为 test bug 时）

## 不适用场景

- 后端单元测试 → 使用 `ae:unit-test`
- 接口级测试 → 使用 `ae:api-test`
- 纯前端修复 → 使用 `ae:frontend-fix`

## 模式选择

通过 `mode` 参数指定执行模式，缺省时询问用户选择。

| 参数 | 模式 | 说明 |
|------|------|------|
| `mode=test-only` | 仅测试模式 | 直接调用 `ae:playwright` 逐步交互测试，通过的命令序列保存为 `.sh` 文件 |
| `mode=script` | 编写脚本模式 | 先编写 Playwright `.spec.ts` 测试脚本，可调用 `ae:playwright` 辅助编写，最终运行脚本 |

## 分辨率自动检测

按四级优先级检测项目类型并设置分辨率，默认 2K（2560×1440）。详见 [分辨率自动检测](references/resolution-detection.md)。

## 执行流程

两种模式的详细执行流程见 [测试模式执行流程](references/test-modes.md)。

### 仅测试模式（mode=test-only）概要

解析输入 → 检测分辨率 → 确定测试场景 → `ae:playwright` 交互测试 → 记录命令序列 → 通过的序列写入 `.sh` 到 `ae/tests/e2e/sequences/` → 复制到 `sequences/golden/`

### 编写脚本模式（mode=script）概要

解析输入 → 检测分辨率 → 编译骨架 → `ae:playwright` 辅助编写 → 生成 `.spec.ts` 到 `ae/tests/e2e/` → `npx playwright test` 运行 → 通过的脚本复制到 `golden/`

## `.sh` 序列文件格式

仅测试模式下通过的命令序列以 `.sh` 文件保存。格式规范见 [序列文件格式](references/sequence-format.md)。

## 脚本存储、golden 生命周期与失败处理

脚本存储路径、golden 生命周期管理、测试失败处理和自修复详见 [golden 生命周期与失败处理](references/golden-lifecycle.md)。

## 调度代理

使用 `@e2e-test-runner` 代理执行测试生成和执行。代理根据 `mode` 参数分流执行对应流程。

## 底层依赖

浏览器操作一律通过 `ae:playwright` 技能完成，不绕过该技能直接调用底层命令。

## 安全边界

- 不修改产品代码（只生成和修改测试代码）
- 不执行 Git 操作
- 需要本地开发服务器已启动

## 完成标准

### test-only 模式

- `.sh` 序列文件已生成到 `ae/tests/e2e/sequences/`（如有通过的场景）
- 测试已执行并输出结果
- 成功序列已复制到 `ae/tests/e2e/sequences/golden/`（如有）
- 如全部失败，所有失败已构建 TestFailureBundle 并触发 triage 流程

### script 模式

- `.spec.ts` 测试脚本已生成到 `ae/tests/e2e/`
- 测试已执行并输出结果
- 成功脚本已复制到 `ae/tests/e2e/golden/`（如有）
- 如全部失败，所有失败已构建 TestFailureBundle 并触发 triage 流程

## 参考文档

- [分辨率自动检测](references/resolution-detection.md) — 四级优先级检测逻辑和信号清单
- [测试模式执行流程](references/test-modes.md) — test-only 和 script 两种模式详细步骤
- [序列文件格式](references/sequence-format.md) — `.sh` 序列文件格式规范
- [golden 生命周期与失败处理](references/golden-lifecycle.md) — 脚本存储、golden 管理、失败处理和自修复
