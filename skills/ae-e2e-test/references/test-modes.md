# 测试模式执行流程

两种模式都基于**标准 Playwright**（`npx playwright test`），不依赖额外的浏览器驱动 CLI。

---

## 仅执行模式（mode=test-only）

只执行项目**已有**的 E2E 脚本，不新增、不修改测试脚本。

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 检测分辨率（按 [分辨率自动检测](resolution-detection.md) 四级优先级）
3. 定位项目已有的 `.spec.ts`：
   - 优先使用项目既有测试目录（`tests/e2e/`、`e2e/`、`__tests__/` 等）
   - 无既有目录时，向用户说明没有可执行的脚本并停止
4. 执行测试：

   ```bash
   npx playwright test --reporter=json
   # 或指定范围
   npx playwright test path/to/spec.ts --reporter=json
   ```

5. 收集结果：通过/失败/截图/DOM 快照
6. 报告与取证落盘到 `ae/e2e-test/reports/`
7. 如有失败，构建 TestFailureBundle 并进入测试失败处理流程

> 本模式**不**修改任何测试脚本。若失败原因判定为 test bug，切换到 `mode=script` 或转交 `ae-frontend-fix` 修复。

---

## 编写脚本模式（mode=script）

编译或生成 `.spec.ts` 后执行。

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 检测分辨率（按 [分辨率自动检测](resolution-detection.md) 四级优先级）
3. 编译测试骨架：
   - 有设计用例 → 从 design `overview.md` 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译 Playwright 骨架
   - 无设计用例 → 从页面描述生成测试场景
4. 辅助探索页面结构（可选）：
   - 用 `npx playwright codegen <url>` 录制交互，直接产出可用的 `.spec.ts`
   - 或读取项目已有页面实现，推断稳定的元素定位器（优先 `data-testid`、role+name、可见文本，最后才用 CSS 层级）
5. 生成 `.spec.ts`：
   - 桌面端在测试中设置视口：`await page.setViewportSize({ width: 2560, height: 1440 })`
   - 移动端项目使用 `devices['iPhone 15']` 之类的设备描述符
   - 定位器优先用语义定位（`getByRole` / `getByLabel` / `getByTestId`），避免脆弱的 CSS 层级
6. 执行测试，配置 HTML reporter 并启用 `doNotInlineAssets: true`（详见 [测试报告生成](report-generation.md)），报告输出到 `ae/e2e-test/reports/`

   ```bash
   npx playwright test --reporter=html
   ```

7. 收集结果：通过/失败/截图/DOM 快照
8. 成功的测试脚本固化为 golden 回归资产（见 [golden 生命周期与失败处理](golden-lifecycle.md)）
9. 如有失败，构建 TestFailureBundle 并进入测试失败处理流程

---

## 设计用例入口

有设计用例时，从 design `overview.md` 获取模块清单和导航，定位 `modules/<NN>-<m>/test-cases.md` 读取用例规格。
