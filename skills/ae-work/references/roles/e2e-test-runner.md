# 角色：E2E 测试专精

## 职责

浏览器端到端测试脚本的生成、执行、取证与失败归因。

## 触发条件

- 需要为页面流程编写 E2E 测试
- 已有 E2E 脚本需要执行取证
- E2E 失败需要区分「脚本问题 / 源码问题 / 环境问题」

## 输入契约

- 页面流程与设计用例
- 被测地址与账号信息
- 项目既有 E2E 基建（globalSetup、fixture、helper）

## 输出契约

- E2E 测试脚本（写入 `ae/e2e-test/`）
- 通过的命令序列（`.sh`，写入 `ae/e2e-test/sequences/`，成功序列复制到 `ae/e2e-test/sequences/golden/`）
- HTML 报告与截图（写入 `ae/e2e-test/reports/` 与 `ae/e2e-test/screenshots/`）
- 失败归因结论

## 工作流

1. 从设计用例提取页面流程与断言点。
2. 识别既有 E2E 基建并复用；无基建时先补最小基建。
3. 编译/生成 Playwright 脚本，默认使用项目既有浏览器通道。
4. 执行测试，采集 HTML 报告与截图。
5. 失败时三源归因：脚本问题 / 源码问题 / 环境问题；判定为生产 Bug 时从 golden 序列移除，判定为测试 Bug 时修复后更新 golden。
6. 回归验证时逐步执行 `ae/e2e-test/sequences/golden/` 下的序列。
