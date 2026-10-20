---
name: ae-e2e-test
description: 浏览器端到端测试：支持"仅执行既有脚本"与"编译生成 Playwright 脚本后执行"两种模式，自动检测分辨率默认 2K，失败时做三源归因与分诊。Use when the user needs browser end-to-end tests, Playwright spec generation, E2E evidence collection or failure triage.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 与 Playwright（npx playwright test --reporter=json）；浏览器内核需另行安装
metadata:
  author: ae-skills
  version: "1.0.0"
  ae-group: 测试
---

# 浏览器端到端测试

基于**标准 Playwright**（`npx playwright test`）执行浏览器端到端测试。

## 角色

浏览器端到端测试执行器。支持两种模式：

- **仅执行模式**（`mode=test-only`）：执行项目**已有**的 E2E 脚本并取证，不新增脚本
- **编写脚本模式**（`mode=script`）：从设计用例或页面描述编译生成 `.spec.ts` 后执行

自动检测项目类型并设置分辨率，默认 2K（2560×1440）。

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

- `references/roles/e2e-test-runner.md` — E2E 测试执行者：脚本生成、执行、取证与失败归因
- `references/roles/test-triage.md` — 测试失败根因分诊者：真源对齐语义判断

## 适用场景

- 用户要求对指定 URL 或功能进行 E2E 测试
- 用户要求只执行既有脚本、不新增脚本（`mode=test-only`）
- 用户要求编写测试脚本并运行（`mode=script`）
- 用户提供了设计用例路径，需要从用例规格编译 Playwright 骨架
- 用户要求执行已有 E2E 测试并收集取证
- 用户要求修复失败的 E2E 测试（triage 判定为 test bug 时）

## 不适用场景

- 后端单元测试 → 使用 `ae-unit-test`
- 接口级测试 → 使用 `ae-api-test`
- 纯前端修复 → 使用 `ae-frontend-fix`
- 从零搭建项目的完整 E2E 测试工程（分层勘察、基建搭建、套件组织、覆盖率体系）→ 使用 `ae-playwright-verify`

## 模式选择

通过 `mode` 参数指定执行模式，缺省时询问用户选择。

| 参数 | 模式 | 说明 |
|------|------|------|
| `mode=test-only` | 仅执行模式 | 执行项目已有的 `.spec.ts`，只取证不新增脚本 |
| `mode=script` | 编写脚本模式 | 编译或生成 `.spec.ts` 后执行 |

## 分辨率自动检测

按四级优先级检测项目类型并设置分辨率，默认 2K（2560×1440）。
详见 [分辨率自动检测](references/resolution-detection.md)。

视口通过标准 Playwright 设备设置实现：桌面端用 `page.setViewportSize({ width, height })`，
移动端用 `devices['iPhone 15']` 等设备描述符。

## 执行流程

两种模式的详细执行流程见 [测试模式执行流程](references/test-modes.md)。

### 仅执行模式（mode=test-only）概要

解析输入 → 检测分辨率 → 定位项目已有 `.spec.ts` → `npx playwright test` 执行（JSON reporter 取证）→ 收集通过/失败/截图/DOM 快照 → 报告落 `ae/e2e-test/reports/` → 失败的构建 TestFailureBundle 走 triage

### 编写脚本模式（mode=script）概要

解析输入 → 检测分辨率 → 编译骨架（设计用例或页面描述）→ 生成 `.spec.ts` → `npx playwright test` 执行（配置 HTML reporter + `doNotInlineAssets`）→ 分离式 HTML 报告落 `ae/e2e-test/reports/` → 失败的构建 TestFailureBundle 走 triage

## 脚本存储、golden 生命周期与失败处理

脚本存储路径、golden（已通过并固化的回归资产）生命周期管理、测试失败处理和自修复
详见 [golden 生命周期与失败处理](references/golden-lifecycle.md)。

## 测试报告生成

script 模式运行后生成分离式 HTML 测试报告。详见 [测试报告生成](references/report-generation.md)。

## 角色卡调度

角色卡是纯 Markdown，位于 `references/roles/`，不绑定任何宿主：

| 角色卡 | 职责 | 调度时机 |
|--------|------|----------|
| `references/roles/e2e-test-runner.md` | E2E 脚本生成、执行、取证与失败归因 | 按 `mode` 参数分流执行对应流程 |
| `references/roles/test-triage.md` | 测试失败根因分诊（真源对齐语义判断） | `scripts/triage.mjs` 返回 `needs_agent_diagnosis: true` 时 |

**并行派发**：若宿主支持子代理派发能力，将下列角色卡**并行**分派，每卡一份独立上下文；
若不支持，则在当前会话内**顺序**执行同一批角色卡，产出格式不变。

## 运行方式

统一使用标准 Playwright 命令行：

```bash
# 执行全部 E2E 并产出 JSON 取证
npx playwright test --reporter=json

# 执行指定 spec
npx playwright test path/to/spec.ts --reporter=json

# 录制交互生成脚本（编写脚本模式下的辅助手段）
npx playwright codegen <url>
```

不要引入额外的浏览器驱动 CLI 工具；标准 Playwright 已覆盖录制、执行与取证。

## 安全边界

- 不修改产品代码（只生成和修改测试代码）
- 不执行 Git 操作
- 需要本地开发服务器已启动
- 不上传覆盖率数据或取证产物到外部服务

## 完成标准

### 仅执行模式

- 已有 E2E 脚本已执行并输出结果
- 取证（报告、失败截图、DOM 快照）已落盘到 `ae/e2e-test/reports/`
- 如有失败，所有失败已构建 TestFailureBundle 并触发 triage 流程

### 编写脚本模式

- `.spec.ts` 测试脚本已生成
- 测试已执行并输出结果
- 分离式 HTML 报告已生成到 `ae/e2e-test/reports/`（HTML/CSS/JS/Data 独立文件）
- 通过的脚本已固化为 golden 回归资产
- 如有失败，所有失败已构建 TestFailureBundle 并触发 triage 流程

## 参考文档

- [分辨率自动检测](references/resolution-detection.md) — 四级优先级检测逻辑和信号清单
- [测试模式执行流程](references/test-modes.md) — 两种模式的详细步骤
- [golden 生命周期与失败处理](references/golden-lifecycle.md) — 脚本存储、golden 管理、失败处理和自修复
- [测试报告生成](references/report-generation.md) — 分离式 HTML 报告生成规范
