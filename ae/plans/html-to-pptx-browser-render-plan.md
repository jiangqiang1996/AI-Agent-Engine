# 计划：ae:html-to-pptx 浏览器渲染高保真重构

## 目标

将 `ae:html-to-pptx` 从"正则文本提取器"重构为"浏览器渲染高保真转换器"，通过 chrome-devtools-mcp 获取精确元素位置和计算样式，生成可编辑的高保真 PPTX。

## 背景

当前实现用正则解析 HTML，`<style>` 前置剥离导致所有 CSS 丢失，`currentY` 垂直堆叠导致图片无法定位/并排，`<div>` 不识别导致布局容器全丢。参考 awesome-claude-skills/pptx 的 html2pptx.js，采用浏览器渲染范式可根本解决。

## 约束

- chrome-devtools-mcp 支持 `chrome-devtools_evaluate_script`（Runtime.evaluate），可在页面执行任意 JS
- 复用 html2pptx.js 的 `extractSlideData` 核心逻辑（getComputedStyle + getBoundingClientRect）
- 不引入 Playwright/puppeteer 作为项目依赖，改用项目已有的 chrome-devtools-mcp
- 整页渲染后 JS 内部按 section/hr/h1 切分为多个 slideData
- 保留当前正则实现作为浏览器不可用时的降级路径
- 坐标转换常量：PT_PER_PX=0.75, PX_PER_IN=96, EMU_PER_IN=914400

## 实现单元

### U1: 新建 `src/services/browser-pptx-renderer.ts` — 浏览器渲染提取服务

**文件**: `src/services/browser-pptx-renderer.ts`（新建）

**职责**: 通过 chrome-devtools-mcp 工具在浏览器中执行 JS，提取结构化 slideData

**要点**:
- 定义 `BrowserSlideData` 接口：`{ background: { type: 'color' | 'image'; value?: string; path?: string }; elements: BrowserPptxElement[]; errors: string[] }`
- 定义 `BrowserPptxElement` 类型：image / shape / line / list / text，每个含 position(x,y,w,h in inches) 和 style
- 导出 `extractSlideDataViaBrowser(htmlFilePath: string, worktree: string, slideSeparator: string): Promise<BrowserSlideData[]>`
- 内部流程：
  1. 将 htmlFilePath 转为 `file://` URL
  2. 调用 `chrome-devtools_navigate_page` 导航到该 URL
  3. 调用 `chrome-devtools_evaluate_script` 执行注入的 JS 函数（见 U2）
  4. 解析返回的 JSON，按 slideSeparator 分页返回 `BrowserSlideData[]`
- 注入的 JS 函数适配自 html2pptx.js 的 `extractSlideData`：
  - `pxToInch(px) => px / 96`
  - `pxToPoints(pxStr) => parseFloat(pxStr) * 0.75`
  - `rgbToHex(rgbStr)` — rgba/rgb → HEX
  - `extractAlpha(rgbStr)` — 提取透明度
  - `parseInlineFormatting(element, baseOptions, runs)` — 解析内联格式化标签为 text runs
  - 遍历 `document.querySelectorAll('*')`，按 IMG/DIV(有bg/border)/UL/OL/P/H1-H6 分类提取
  - 用 `getBoundingClientRect()` 获取位置，`getComputedStyle()` 获取样式
  - body 背景提取（color 或 image）
- chrome-devtools-mcp 工具调用方式：这些是 MCP 工具，在服务层不能直接调用。需要通过 ctx 的 MCP 调用机制，或通过 SKILL.md 指示 LLM 执行
- **关键架构决策**：服务层不直接调用 MCP 工具。改为导出纯函数 `buildExtractionScript(slideSeparator: string): string`，返回完整的 JS 字符串。由工具层通过 ctx 调用 MCP 工具执行该脚本

**验证**: 单元测试 `buildExtractionScript` 返回有效 JS 字符串

### U2: 注入 JS 提取脚本生成器

**文件**: `src/services/browser-pptx-renderer.ts`（同文件）

**职责**: 生成在浏览器中执行的 JS 字符串

**要点**:
- 导出 `buildExtractionScript(slideSeparator: 'section' | 'hr' | 'h1' | 'auto'): string`
- 返回的 JS 字符串是一个 IIFE，执行后返回 `{ slides: BrowserSlideData[]; bodyDimensions: {...}; errors: string[] }`
- JS 内部逻辑：
  1. 获取 body 尺寸和背景
  2. 按 slideSeparator 将 body 内容切分为多个"虚拟 section"：
     - section: 按 `<section>` 标签切分
     - hr: 按 `<hr>` 切分
     - h1: 按 `<h1>` 切分
     - auto: 依次尝试 section → hr → h1 → 整体
  3. 对每个 section 独立执行元素提取（复用 html2pptx.js 的 extractSlideData 逻辑）
  4. 每个 section 生成一个 slideData（含 background、elements、errors）
- 脚本中使用 `window.getComputedStyle` 和 `element.getBoundingClientRect()`
- 脚本中定义所有辅助函数（rgbToHex, pxToInch, parseInlineFormatting 等）
- 脚本返回值序列化为 JSON 可序列化对象

**验证**: 生成的脚本可在浏览器 console 中执行并返回结构化数据

### U3: 重写 `src/services/html-to-pptx-service.ts` — 双路径调度

**文件**: `src/services/html-to-pptx-service.ts`（重写）

**职责**: 调度浏览器渲染路径和正则降级路径

**要点**:
- 保留现有正则解析函数（`splitIntoSlides`, `parseSlideContent` 等）重命名为 `*Legacy` 后缀
- 新增 `convertHtmlToPptxViaBrowser(options, mcpExecutor)` — 浏览器渲染路径
- 新增 `convertHtmlToPptxViaRegex(options)` — 正则降级路径（调用 Legacy 函数）
- 修改 `convertHtmlToPptx` 主入口：
  - 接受新参数 `mcpExecutor?: (script: string) => Promise<string>` — MCP 脚本执行器回调
  - 如果 `mcpExecutor` 可用 → 走浏览器路径
  - 如果 `mcpExecutor` 不可用或执行失败 → 降级到正则路径
- 浏览器路径流程：
  1. `buildExtractionScript(slideSeparator)` 生成 JS 脚本
  2. `mcpExecutor(script)` 执行脚本，返回 JSON 字符串
  3. `JSON.parse` 解析为 `BrowserSlideData[]`
  4. 映射 `BrowserSlideData[]` → `PptxSlideContent[]`（复用 `pptx-service.ts` 的类型）
  5. 调用 `processPptx` 生成 PPTX
- `BrowserSlideData` → `PptxSlideContent` 映射规则：
  - background.color → slide.background.color
  - background.image(path) → slide.background.path
  - element.type='image' → PptxInputElement type='image' + position
  - element.type='shape' → PptxInputElement type='shape' + fill/line/rectRadius
  - element.type='text' → PptxInputElement type='text' + textRuns + style
  - element.type='list' → PptxInputElement type='text' + items(textRuns with bullet)
  - element.type='line' → PptxInputElement type='shape' + shape='line'

**验证**: 集成测试 mock mcpExecutor 返回有效 JSON，验证 PptxSlideContent 映射正确

### U4: 更新 `src/tools/ae-html-to-pptx.tool.ts` — MCP 执行器注入

**文件**: `src/tools/ae-html-to-pptx.tool.ts`（修改）

**职责**: 在工具层桥接 chrome-devtools-mcp

**要点**:
- 工具的 `execute` 函数中，通过 `ctx` 访问 MCP 工具调用能力
- opencode 插件 ToolContext 提供了 `ctx.session` 或类似机制调用 MCP 工具
- 创建 `mcpExecutor` 回调：
  ```typescript
  const mcpExecutor = async (script: string): Promise<string> => {
    // 先导航到 file:// URL
    await ctx.mcp?.callTool('chrome-devtools', 'navigate_page', { url: fileUrl })
    // 执行脚本
    const result = await ctx.mcp?.callTool('chrome-devtools', 'evaluate_script', { script })
    return result.content[0].text
  }
  ```
- 需要研究 opencode 插件 API 中如何调用 MCP 工具（查 SDK 文档或现有代码）
- 如果 ctx 不直接支持 MCP 调用，降级方案：工具返回提示信息，指示 LLM 先调用 `ae:chrome-devtools` 技能注册 MCP，再调用 `chrome-devtools_navigate_page` 和 `chrome-devtools_evaluate_script`
- 更新工具描述：移除"不保留 CSS 样式"，改为"通过浏览器渲染保留视觉布局和样式"

**验证**: 手动测试工具执行，验证 MCP 调用链路

### U5: 更新 `src/assets/skills/ae-html-to-pptx/SKILL.md` — 技能文档

**文件**: `src/assets/skills/ae-html-to-pptx/SKILL.md`（修改）

**职责**: 更新技能说明以反映浏览器渲染能力

**要点**:
- 角色与目标：从"只提取结构化内容"改为"通过浏览器渲染高保真转换"
- 适用场景：增加"需要保留 CSS 布局和视觉样式"
- 不适用场景：移除"不保留 CSS 样式"；保留"不支持远程 URL"
- 执行流程：增加"先通过 ae:chrome-devtools 注册浏览器 MCP"步骤
- 元素映射规则表：增加 DIV→形状、背景色→shape fill、边框→shape line
- 安全边界：增加 chrome-devtools MCP 门禁要求

**验证**: 文档审查，确认与代码行为一致

### U6: 测试

**文件**: `tests/services/browser-pptx-renderer.test.ts`（新建）, `tests/services/html-to-pptx-service.test.ts`（新建）

**要点**:
- `browser-pptx-renderer.test.ts`：
  - 测试 `buildExtractionScript` 返回包含关键函数的 JS 字符串
  - 测试不同 slideSeparator 生成不同切分逻辑
- `html-to-pptx-service.test.ts`：
  - 测试浏览器路径：mock mcpExecutor 返回预设 BrowserSlideData JSON，验证 PptxSlideContent 映射
  - 测试降级路径：mcpExecutor 为 null 时走正则路径
  - 测试错误处理：mcpExecutor 抛异常时降级到正则路径

**验证**: `npx vitest run tests/services/browser-pptx-renderer.test.ts tests/services/html-to-pptx-service.test.ts`

## 验证命令

```bash
# 类型检查
npm run typecheck

# 相关测试
npx vitest run tests/services/browser-pptx-renderer.test.ts tests/services/html-to-pptx-service.test.ts

# 构建
npm run build
```

## 风险

1. **MCP 调用方式不确定** — opencode 插件 ToolContext 是否直接支持 `ctx.mcp.callTool`。需要查 SDK 文档。如果不支持，工具层改为返回提示，由 LLM 编排 MCP 调用
2. **chrome-devtools-mcp 依赖用户环境** — 需要用户已安装浏览器。降级路径兜底
3. **JS 注入脚本体积** — extractSlideData 逻辑约 400 行，作为字符串注入可能较大。需确认 evaluate_script 的体积限制
4. **图片路径处理** — 浏览器中 img.src 可能是绝对路径或 data URI，需正确映射到 PPTX 的 path/imageData
