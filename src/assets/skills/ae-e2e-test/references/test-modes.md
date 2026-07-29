# 测试模式执行流程

## 仅测试模式（mode=test-only）

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 检测分辨率（按 [分辨率自动检测](resolution-detection.md) 四级优先级）
3. 确定测试场景：
   - 有设计用例 → 从 design overview.md 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格提取页面操作步骤和断言点
   - 无设计用例 → 从页面描述推断测试场景
4. 通过 `ae:playwright` 启动浏览器并设置分辨率
5. 逐步交互测试：按场景步骤执行 `goto`/`snapshot`/`click`/`fill`/`eval` 等命令，用 `eval` 或 `snapshot` 验证预期结果
6. 记录每条执行的 `playwright-cli` 命令（含分辨率设置命令）
7. 收集结果：通过/失败/截图/DOM 快照（在关闭浏览器前收集失败所需的快照数据）
8. 关闭浏览器
9. 通过的命令序列写入 `.sh` 文件到 `ae/tests/e2e/sequences/`（每个场景独立一个 `.sh` 文件，仅包含全部通过的命令）
10. 复制到 `ae/tests/e2e/sequences/golden/` 作为回归资产（覆盖同名旧脚本）
11. 如有失败，构建 TestFailureBundle 并进入测试失败处理流程

## 编写脚本模式（mode=script）

1. 解析输入：URL 或功能描述 + 可选设计用例路径
2. 检测分辨率（按 [分辨率自动检测](resolution-detection.md) 四级优先级）
3. 编译测试骨架：
   - 有设计用例 → 从 design overview.md 定位 `modules/<NN>-<m>/test-cases.md`，从用例规格编译 Playwright 骨架
   - 无设计用例 → 从页面描述生成测试场景
4. 通过 `ae:playwright` 启动浏览器并设置分辨率
5. 辅助编写脚本：用 `ae:playwright` 探索页面结构、`generate-locator` 生成定位器、`eval` 捕获期望值、收集输出中的生成代码
6. 生成 `.spec.ts` 文件到 `ae/tests/e2e/`，在测试中设置视口（如 `page.setViewportSize({ width: 2560, height: 1440 })` 或通过 fixture 设置；移动端项目使用 `devices['iPhone 15']` 配置 fixture）
7. 关闭浏览器
8. 通过 `npx playwright test` 执行测试
9. 收集结果：通过/失败/截图/DOM 快照
10. 成功的测试脚本复制到 `ae/tests/e2e/golden/` 作为回归资产（覆盖同名旧脚本）
11. 如有失败，构建 TestFailureBundle 并进入测试失败处理流程

## 设计用例入口

有设计用例时，从 design `overview.md` 获取模块清单和导航，定位 `modules/<NN>-<m>/test-cases.md` 读取用例规格。
