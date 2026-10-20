# 视频录制

将浏览器自动化会话录制为视频，用于调试、文档或验证。生成 WebM 格式（VP8/VP9 编码）。

## 基本录制

```bash
# 先打开浏览器
playwright-cli open

# 开始录制
playwright-cli video-start demo.webm

# 添加章节标记用于段落过渡
playwright-cli video-chapter "Getting Started" --description="Opening the homepage" --duration=2000

# 导航并执行操作
playwright-cli goto https://example.com
playwright-cli snapshot
playwright-cli click e1

# 添加另一个章节
playwright-cli video-chapter "Filling Form" --description="Entering test data" --duration=2000
playwright-cli fill e2 "test input"

# 停止并保存
playwright-cli video-stop
```

## 最佳实践

### 1. 使用描述性文件名

```bash
# 文件名中包含上下文信息
playwright-cli video-start recordings/login-flow-2024-01-15.webm
playwright-cli video-start recordings/checkout-test-run-42.webm
```

### 2. 录制完整的演示脚本

为用户录制视频或作为工作证明时，最好创建代码片段并用 run-code 执行。
这样可以在操作间插入适当的停顿并标注视频。Playwright 提供了新的 API 来实现这一点。

1) 使用 CLI 执行场景并记录所有定位器和操作。需要这些定位器来获取其边界框以进行高亮。
2) 创建包含目标视频脚本的文件（见下文）。使用 pressSequentially 配合 delay 实现优雅的逐字输入，添加合理的停顿。
3) 使用 playwright-cli run-code --filename your-script.js

**重要**：覆盖层设置了 `pointer-events: none` — 不会干扰页面交互。可以安全地在点击、填充或执行任何页面操作时保持粘性覆盖层可见。

```js
async page => {
  await page.screencast.start({ path: 'video.webm', size: { width: 1280, height: 800 } });
  await page.goto('https://demo.playwright.dev/todomvc');

  // 显示章节卡片 — 模糊页面并显示对话框。
  // 阻塞直到 duration 结束，然后自动移除。
  // 适用于简单场景，也可自行编写更精美的
  // 覆盖层，通过 await page.screencast.showOverlay()。
  await page.screencast.showChapter('Adding Todo Items', {
    description: 'We will add several items to the todo list.',
    duration: 2000,
  });

  // 执行操作
  await page.getByRole('textbox', { name: 'What needs to be done?' }).pressSequentially('Walk the dog', { delay: 60 });
  await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Enter');
  await page.waitForTimeout(1000);

  // 显示下一个章节
  await page.screencast.showChapter('Verifying Results', {
    description: 'Checking the item appeared in the list.',
    duration: 2000,
  });

  // 添加在执行操作时保持可见的粘性标注。
  // 覆盖层设置了 pointer-events: none，不会阻挡点击。
  const annotation = await page.screencast.showOverlay(`
    <div style="position: absolute; top: 8px; right: 8px;
      padding: 6px 12px; background: rgba(0,0,0,0.7);
      border-radius: 8px; font-size: 13px; color: white;">
      ✓ Item added successfully
    </div>
  `);

  // 在标注可见时执行更多操作
  await page.getByRole('textbox', { name: 'What needs to be done?' }).pressSequentially('Buy groceries', { delay: 60 });
  await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Enter');
  await page.waitForTimeout(1500);

  // 完成后移除标注
  await annotation.dispose();

  // 也可以高亮相关定位器并提供上下文标注。
  const bounds = await page.getByText('Walk the dog').boundingBox();
  await page.screencast.showOverlay(`
    <div style="position: absolute;
      top: ${bounds.y}px;
      left: ${bounds.x}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      border: 1px solid red;">
    </div>
    <div style="position: absolute;
      top: ${bounds.y + bounds.height + 5}px;
      left: ${bounds.x + bounds.width / 2}px;
      transform: translateX(-50%);
      padding: 6px;
      background: #808080;
      border-radius: 10px;
      font-size: 14px;
      color: white;">Check it out, it is right above this text
    </div>
  `, { duration: 2000 });

  await page.screencast.stop();
}
```

发挥创意，覆盖层功能强大。

### 覆盖层 API 摘要

| 方法 | 用途 |
|------|------|
| `page.screencast.showChapter(title, { description?, duration?, styleSheet? })` | 带模糊背景的全屏章节卡片 — 适合段落过渡 |
| `page.screencast.showOverlay(html, { duration? })` | 自定义 HTML 覆盖层 — 用于标注、标签、高亮 |
| `disposable.dispose()` | 移除未设置 duration 的粘性覆盖层 |
| `page.screencast.hideOverlays()` / `page.screencast.showOverlays()` | 临时隐藏/显示所有覆盖层 |

## 追踪 vs 视频

| 特性 | 视频 | 追踪 |
|------|------|------|
| 输出 | WebM 文件 | 追踪文件（可在 Trace Viewer 中查看） |
| 展示内容 | 视觉录制 | DOM 快照、网络、控制台、操作 |
| 适用场景 | 演示、文档 | 调试、分析 |
| 大小 | 较大 | 较小 |

## 限制

- 录制会给自动化增加轻微开销
- 大型录制会占用大量磁盘空间
