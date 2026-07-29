# 测试报告生成

script 模式运行测试后生成分离式 HTML 测试报告，避免单文件过大。

## 原理

使用 Playwright 内置 HTML reporter，配置 `doNotInlineAssets: true` 选项，使 JS、CSS 和数据文件独立写入而非内联到单个 `index.html`。

## 配置方式

### 方式一：playwright.config.ts 配置

在项目的 `playwright.config.ts` 中配置 reporter：

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  reporter: [
    ['html', {
      outputFolder: 'ae/tests/e2e/reports',
      open: 'never',
      doNotInlineAssets: true,
    }],
  ],
})
```

### 方式二：环境变量

无需修改配置文件，通过环境变量控制：

```bash
# Unix (bash/zsh)
PLAYWRIGHT_HTML_OUTPUT_DIR=ae/tests/e2e/reports \
PLAYWRIGHT_HTML_OPEN=never \
PLAYWRIGHT_HTML_DO_NOT_INLINE_ASSETS=1 \
npx playwright test
```

```powershell
# Windows (PowerShell)
$env:PLAYWRIGHT_HTML_OUTPUT_DIR="ae/tests/e2e/reports"
$env:PLAYWRIGHT_HTML_OPEN="never"
$env:PLAYWRIGHT_HTML_DO_NOT_INLINE_ASSETS="1"
npx playwright test
```

若项目已有 `playwright.config.ts` 但未配置 HTML reporter，可追加 `--reporter=html` 命令行参数启用 reporter，`doNotInlineAssets` 和 `outputFolder` 仍需通过上述环境变量或配置文件设置。

## 输出结构

配置 `doNotInlineAssets: true` 后，报告目录结构如下（具体文件名以实际生成为准）：

```
ae/tests/e2e/reports/
├── index.html          # HTML 骨架（小文件，引用外部 CSS/JS）
├── assets/             # 独立样式和脚本
│   ├── *.css           # 样式文件
│   └── *.js            # 渲染脚本
└── data/               # 独立数据文件
    └── *.json          # 测试结果和附件数据
```

与默认内联模式（所有内容嵌入单个 `index.html`，可达数百 KB）不同，分离模式下各文件独立，单文件体积小。

## 优先级

1. 检查项目 `playwright.config.ts` 是否已配置 HTML reporter
2. 检查是否已启用 `doNotInlineAssets: true`
3. 两者均已配置 → 直接运行 `npx playwright test`
4. 任一未配置 → 通过环境变量补全：`PLAYWRIGHT_HTML_DO_NOT_INLINE_ASSETS=1`、`PLAYWRIGHT_HTML_OUTPUT_DIR=ae/tests/e2e/reports`、`PLAYWRIGHT_HTML_OPEN=never`
5. 运行后检查 `ae/tests/e2e/reports/index.html` 是否存在，确认报告生成成功

## 报告查看

- 直接在浏览器中打开 `ae/tests/e2e/reports/index.html`
- 或通过 `npx playwright show-report ae/tests/e2e/reports` 启动本地服务器查看

## test-only 模式

test-only 模式不生成 HTML 报告，仅输出 `.sh` 序列文件和命令行结果摘要。
