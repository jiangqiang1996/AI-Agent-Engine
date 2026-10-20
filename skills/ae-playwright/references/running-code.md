# 运行自定义 Playwright 代码

使用 `run-code` 执行任意 Playwright 代码，用于处理 CLI 命令未覆盖的高级场景。

## 语法

```bash
playwright-cli run-code "async page => {
  // 你的 Playwright 代码
  // 通过 page.context() 访问浏览器上下文操作
}"
```

也可以从文件加载函数：

```bash
playwright-cli run-code --filename=./my-script.js
```


代码必须是单个函数表达式，会被包裹在 `(...)` 中求值。
不支持 import/export/require 语法。

## 地理位置

```bash
# 授予地理位置权限并设置位置
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 37.7749, longitude: -122.4194 });
}"

# 设置位置为伦敦
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 51.5074, longitude: -0.1278 });
}"

# 清除地理位置覆盖
playwright-cli run-code "async page => {
  await page.context().clearPermissions();
}"
```

## 权限

```bash
# 授予多个权限
playwright-cli run-code "async page => {
  await page.context().grantPermissions([
    'geolocation',
    'notifications',
    'camera',
    'microphone'
  ]);
}"

# 为特定来源授予权限
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['clipboard-read'], {
    origin: 'https://example.com'
  });
}"
```

## 媒体模拟

```bash
# 模拟深色配色方案
playwright-cli run-code "async page => {
  await page.emulateMedia({ colorScheme: 'dark' });
}"

# 模拟浅色配色方案
playwright-cli run-code "async page => {
  await page.emulateMedia({ colorScheme: 'light' });
}"

# 模拟减少动画
playwright-cli run-code "async page => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}"

# 模拟打印媒体
playwright-cli run-code "async page => {
  await page.emulateMedia({ media: 'print' });
}"
```

## 等待策略

```bash
# 等待网络空闲
playwright-cli run-code "async page => {
  await page.waitForLoadState('networkidle');
}"

# 等待特定元素
playwright-cli run-code "async page => {
  await page.locator('.loading').waitFor({ state: 'hidden' });
}"

# 等待函数返回 true
playwright-cli run-code "async page => {
  await page.waitForFunction(() => window.appReady === true);
}"

# 带超时等待
playwright-cli run-code "async page => {
  await page.locator('.result').waitFor({ timeout: 10000 });
}"
```

## 框架和 iframe

```bash
# 操作 iframe
playwright-cli run-code "async page => {
  const frame = page.locator('iframe#my-iframe').contentFrame();
  await frame.locator('button').click();
}"

# 获取所有框架
playwright-cli run-code "async page => {
  const frames = page.frames();
  return frames.map(f => f.url());
}"
```

## 文件下载

```bash
# 处理文件下载
playwright-cli run-code "async page => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const download = await downloadPromise;
  await download.saveAs('./downloaded-file.pdf');
  return download.suggestedFilename();
}"
```

## 剪贴板

```bash
# 读取剪贴板（需要权限）
playwright-cli run-code "async page => {
  await page.context().grantPermissions(['clipboard-read']);
  return await page.evaluate(() => navigator.clipboard.readText());
}"

# 写入剪贴板
playwright-cli run-code "async page => {
  await page.evaluate(text => navigator.clipboard.writeText(text), 'Hello clipboard!');
}"
```

## 页面信息

```bash
# 获取页面标题
playwright-cli run-code "async page => {
  return await page.title();
}"

# 获取当前 URL
playwright-cli run-code "async page => {
  return page.url();
}"

# 获取页面内容
playwright-cli run-code "async page => {
  return await page.content();
}"

# 获取视口大小
playwright-cli run-code "async page => {
  return page.viewportSize();
}"
```

## JavaScript 执行

```bash
# 执行 JavaScript 并返回结果
playwright-cli run-code "async page => {
  return await page.evaluate(() => {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled
    };
  });
}"

# 向 evaluate 传递参数
playwright-cli run-code "async page => {
  const multiplier = 5;
  return await page.evaluate(m => document.querySelectorAll('li').length * m, multiplier);
}"
```

## 错误处理

```bash
# run-code 中的 try-catch
playwright-cli run-code "async page => {
  try {
    await page.getByRole('button', { name: 'Submit' }).click({ timeout: 1000 });
    return 'clicked';
  } catch (e) {
    return 'element not found';
  }
}"
```

## 复杂工作流

```bash
# 登录并保存状态
playwright-cli run-code "async page => {
  await page.goto('https://example.com/login');
  await page.getByRole('textbox', { name: 'Email' }).fill('user@example.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: 'auth.json' });
  return 'Login successful';
}"

# 从多个页面抓取数据
playwright-cli run-code "async page => {
  const results = [];
  for (let i = 1; i <= 3; i++) {
    await page.goto(\`https://example.com/page/\${i}\`);
    const items = await page.locator('.item').allTextContents();
    results.push(...items);
  }
  return results;
}"
```
