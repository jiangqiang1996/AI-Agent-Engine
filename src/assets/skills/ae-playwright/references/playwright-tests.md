# 运行 Playwright 测试

运行 Playwright 测试时，使用 `npx playwright test` 命令或包管理器脚本。为避免打开交互式 HTML 报告，使用 `PLAYWRIGHT_HTML_OPEN=never` 环境变量。

```bash
# 运行所有测试
PLAYWRIGHT_HTML_OPEN=never npx playwright test

# 通过自定义 npm 脚本运行所有测试
PLAYWRIGHT_HTML_OPEN=never npm run special-test-command
```

# 调试 Playwright 测试

调试失败的 Playwright 测试时，使用 `--debug=cli` 选项运行。该命令会在测试开始处暂停并打印调试说明。

**重要**：在后台运行该命令并检查输出，直到打印出"Debugging Instructions"。完成后务必停止命令。

打印出包含会话名称的说明后，使用 `playwright-cli` 连接该会话并探索页面。

```bash
# 运行测试
PLAYWRIGHT_HTML_OPEN=never npx playwright test --debug=cli
# ...
# ... "tw-abcdef" 会话的调试说明 ...
# ...

# 连接到测试
playwright-cli attach tw-abcdef
```

在后台保持测试运行，同时探索并寻找修复方案。
测试在开始处暂停，因此应逐步执行或在问题最可能发生的位置暂停。

使用 `playwright-cli` 执行的每个操作都会生成对应的 Playwright TypeScript 代码。
该代码出现在输出中，可直接复制到测试里。大多数情况下需要更新特定的定位器或断言，但也可能是应用本身的 bug。请自行判断。

修复测试后，停止后台测试运行。重新运行以确认测试通过。
