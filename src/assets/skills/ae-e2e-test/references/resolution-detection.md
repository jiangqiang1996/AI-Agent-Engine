# 分辨率自动检测

按以下四级优先级检测项目类型并设置分辨率，检测结果告知用户后再执行测试。

## 优先级 1：用户显式指定（最高）

用户传入 `resolution=<WxH>`、`--mobile` 或 `--device=...` 参数时，直接使用指定值，跳过自动检测。

## 优先级 2：设计/需求产物

搜索 `ae/prds/` 下的 `design-vision.md`，读取响应式声明字段：

| design-vision.md 响应式声明 | 检测结果 | 分辨率策略 |
|---------------------------|----------|-----------|
| 是-需适配多端（PC/平板/手机） | 响应式项目 | 2K（2560×1440）为主；可选附加移动端断点验证 |
| 否-固定布局（仅 PC） | 桌面项目 | 2K（2560×1440） |
| 否-仅移动端 | 移动端项目 | `--mobile` 或 `--device="iPhone 15"`，不 resize |

## 优先级 3：项目结构自动检测

无设计产物时，检查项目文件和依赖：

| 检测信号 | 检测结果 | 分辨率策略 |
|---------|----------|-----------|
| `package.json` 含 `react-native`/`expo`/`@capacitor/core`/`@ionic/react`/`cordova`/`nativescript` | 移动端项目 | `--mobile`，不 resize |
| 存在 `android/`/`ios/`/`mobile/`/`native/` 目录或 `capacitor.config.*`/`app.json`(Expo) | 移动端项目 | `--mobile`，不 resize |
| CSS/SCSS 含 `@media` 查询 / `tailwind.config.*` 含 `screens` / Bootstrap 依赖 / HTML 含 `viewport` meta | 响应式项目 | 2K 为主；可选附加断点验证 |
| 以上均不匹配 | 普通桌面项目 | 2K（2560×1440） |

## 优先级 4：默认（兜底）

无任何信号时默认 2K（2560×1440）。

## 检测流程

1. 检查用户是否显式指定分辨率参数 → 有则用指定值，结束
2. 搜索 `ae/prds/` 下的 `design-vision.md`，读取响应式声明 → 有则按声明决定，结束
3. 检查 `package.json` 依赖和项目结构（目录、配置文件）→ 命中移动端信号则用移动端模式
4. 检查 CSS/HTML 响应式信号 → 命中则标记响应式项目
5. 均未命中 → 默认 2K
6. 检测结果告知用户后再执行测试

## 分辨率设置方式

- **桌面端/响应式项目**：浏览器启动后执行 `playwright-cli resize 2560 1440`
- **移动端项目**：使用 `playwright-cli open --mobile` 或 `--device="iPhone 15"`，不执行 resize
- **用户指定分辨率**：`playwright-cli resize <width> <height>`
