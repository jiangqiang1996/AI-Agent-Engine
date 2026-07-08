# 点击降级策略与 SPA 指南

## 点击操作降级策略

在课程列表页面点击课程项进入课程详情时，必须按以下降级策略执行。该策略同样适用于课程内的其他点击操作（如"开始考试"按钮、提交按钮等），只需将目标文本替换为对应按钮文本。

### 降级步骤

1. **获取点击前状态**：执行 `({url: window.location.href, title: document.title, bodyLength: document.body.innerHTML.length})`，记录返回值。
2. **尝试 `chrome-devtools_click`**：从快照中找到目标元素的 uid，调用 `chrome-devtools_click`。
   - 如果成功：等待 2 秒，进入步骤 5 验证导航。
   - 如果失败（报错 "element did not become interactive" 或超时）：进入步骤 3。
3. **使用通用点击辅助脚本**：通过 `chrome-devtools_evaluate_script` 执行通用点击辅助脚本，`args` 传入课程名称或按钮文本。
   - 如果返回 `success=true`：等待 2 秒，进入步骤 5 验证导航。
   - 如果返回 `success=false`：进入步骤 4。
4. **直接导航（最后手段）**：如果课程项有可提取的 URL（检查 `href` 属性或 `data-url` 属性），使用 `chrome-devtools_navigate_page` 直接导航到该 URL。
   - 如果无法提取 URL：记录"无法进入课程 <课程名>，点击失败"，跳过该课程。
5. **验证导航**：执行**导航验证脚本**，传入步骤 1 获取的点击前状态。
   - 如果 `navigated=true`：导航成功，继续处理课程。
   - 如果 `navigated=false`：点击未生效，回到步骤 3 重试一次。如果仍然失败，记录"无法进入课程 <课程名>，导航未发生"，跳过该课程。

## SPA 网站注意事项

许多课程网站是 Vue/React 等 SPA（单页应用），常见特征：
- 链接 `href` 为 `javascript:;` 或 `#`
- 操作按钮是 `<div>` 而非 `<a>` 或 `<button>`
- 点击事件通过框架事件系统绑定，非标准 `onclick` 属性
- 页面导航通过 hash 路由（URL 中 `#/` 变化）或 pushState 实现

在 SPA 网站上，`chrome-devtools_click` 经常失败，应**直接从步骤 3 开始**使用通用点击辅助脚本。如果首次点击即通过辅助脚本成功，后续课程也直接使用辅助脚本，跳过步骤 2。
