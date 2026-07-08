# 辅助脚本

所有辅助脚本通过 `chrome-devtools_evaluate_script` 执行。脚本中的选择器和文本模式可能需要根据目标网站微调，LLM 应在首次执行时根据页面快照调整配置，后续课程复用调整后的版本。

## 检查视频状态

```
(function(){const v=document.querySelector('video');return v?{paused:v.paused,duration:v.duration,currentTime:v.currentTime,ended:v.ended,playbackRate:v.playbackRate}:{error:'no video element'}})()
```

返回字段含义：
- `paused`：是否暂停
- `duration`：总时长（秒），可能为 NaN
- `currentTime`：当前播放进度（秒）
- `ended`：是否播放结束
- `playbackRate`：当前倍速
- `error`：页面上未找到 video 元素

## 提取课程列表

从课程列表页面提取所有课程项的结构化数据。LLM 首次执行时应根据页面快照调整选择器和文本模式（如课程项的 class 名、类型标签文本、操作按钮文本等），后续课程复用调整后的版本。

```
(function(){
  // ====== 选择器配置（根据目标网站调整）======
  const itemSelector = '.item, .course-item, .study-item, [class*="course-item"], [class*="study-item"]';
  const nameSelector = '.name, .title, .course-name, [class*="title"], [class*="name"]';
  const btnSelector = '.operation, [class*="operation"], [class*="btn"], a, button';
  const typeSelector = '.label, .tag, [class*="label"], [class*="tag"]';
  // ====== 文本模式配置（根据目标网站语言和文案调整）======
  // 分类标题行跳过规则：匹配分类标题行的正则，不匹配则留空字符串
  const skipRowPattern = /^[-—=]{3,}|^分类|^Category/i;
  // 类型标签关键词 → 类型的映射
  const typeKeywords = {
    exam: ['考试', 'exam', 'quiz', 'test'],
    url:  ['URL', '外链', '链接', 'external', 'link'],
    course: ['课程', 'course', 'lesson']
  };
  // 操作按钮关键词 → 状态的映射（键为按钮文本包含的子串，值为状态）
  const statusKeywords = {
    in_progress: ['继续', 'continue', 'resume'],
    completed: ['重新', 're-', 'redo', 'retry']
  };
  // ==========================================

  const items = document.querySelectorAll(itemSelector);
  const courses = [];
  for (let item of items) {
    const nameEl = item.querySelector(nameSelector) || item;
    const btnEl = item.querySelector(btnSelector);
    const typeEl = item.querySelector(typeSelector);
    const name = nameEl ? nameEl.textContent.trim() : '';
    const btnText = btnEl ? btnEl.textContent.trim() : '';
    const typeText = typeEl ? typeEl.textContent.trim() : '';

    if (!name || skipRowPattern.test(name) || !btnText) continue;

    let type = 'unknown';
    const combined = (typeText + ' ' + btnText).toLowerCase();
    for (const [t, keywords] of Object.entries(typeKeywords)) {
      if (keywords.some(kw => combined.includes(kw.toLowerCase()))) { type = t; break; }
    }

    let status = 'not_started';
    for (const [s, keywords] of Object.entries(statusKeywords)) {
      if (keywords.some(kw => btnText.toLowerCase().includes(kw.toLowerCase()))) { status = s; break; }
    }

    courses.push({
      name: name,
      type: type,
      btnText: btnText,
      status: status,
      index: courses.length,
      html: item.outerHTML.substring(0, 200)
    });
  }
  return { total: courses.length, courses: courses };
})()
```

返回字段含义：
- `total`：识别到的课程总数
- `courses`：课程数组，每项包含：
  - `name`：课程名称
  - `type`：课程类型（`course`/`exam`/`url`/`unknown`）
  - `btnText`：操作按钮文本
  - `status`：学习状态（`not_started`/`in_progress`/`completed`，依据 `statusKeywords` 配置推断）
  - `index`：在列表中的序号（0-based）
  - `html`：行容器 HTML 片段（前 200 字符，用于调试选择器）

**使用要求**：
- 首次执行后如果 `total=0` 或课程名称不正确，必须根据 `chrome-devtools_take_snapshot` 的结果调整选择器和文本模式配置，重新执行。
- 配置调整后，同一网站后续课程遍历复用该配置，不需要重复调整。
- 如果课程列表分页，先提取当前页，处理完当前页课程后再翻页提取下一页。

## 通用点击辅助脚本

当 `chrome-devtools_click` 失败或目标元素是非语义化 `div`（无 `role="button"`、无 `<a>`/`<button>` 标签、无 `onclick` 属性）时，使用此脚本完成点击。该脚本实现多级降级策略，按顺序尝试直到成功。

```
(function(target){
  // target 可以是：课程名称字符串、元素 uid 字符串、或 {name: "课程名"} 对象
  // 返回 {success: boolean, method: string, message: string}

  // ====== 按钮文本模式配置（根据目标网站调整）======
  // 操作按钮可能包含的文本关键词，用于在行内定位操作按钮
  const actionKeywords = ['开始', '继续', '重新', 'start', 'continue', 'resume', 'begin', 'go'];
  // ================================================

  // ------ 第 0 步：定位目标元素 ------
  let btn = null;
  let itemName = '';

  if (typeof target === 'string') {
    itemName = target;
  } else if (target && target.name) {
    itemName = target.name;
  } else {
    return {success: false, method: 'locate', message: '无法定位目标：未提供课程名称'};
  }

  // 策略 A：通过课程名称定位行，再在行内查找操作按钮
  const allText = document.querySelectorAll('*');
  let rowEl = null;
  for (let el of allText) {
    if (el.children.length === 0 && el.textContent.trim() === itemName) {
      let p = el.parentElement;
      for (let i = 0; i < 8 && p; i++) {
        const btnCandidates = p.querySelectorAll('[class*="operation"], [class*="btn"], a, button');
        if (btnCandidates.length > 0) {
          rowEl = p;
          for (let bc of btnCandidates) {
            const t = bc.textContent.trim().toLowerCase();
            if (actionKeywords.some(kw => t.includes(kw.toLowerCase()))) {
              btn = bc;
              break;
            }
          }
          if (btn) break;
        }
        p = p.parentElement;
      }
      if (btn) break;
    }
  }

  if (!btn) {
    return {success: false, method: 'locate', message: '未找到课程"' + itemName + '"的操作按钮'};
  }

  btn.scrollIntoView({behavior: 'auto', block: 'center', inline: 'center'});

  // ------ 第 1 步：尝试原生 click() ------
  try {
    btn.click();
    return {success: true, method: 'native-click', message: '通过原生 click() 点击成功'};
  } catch(e) {}

  // ------ 第 2 步：模拟完整鼠标事件序列 ------
  try {
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = {bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX: cx, clientY: cy};
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => {
      const E = window[t.startsWith('pointer') ? 'PointerEvent' : 'MouseEvent'];
      btn.dispatchEvent(new E(t, opts));
    });
    return {success: true, method: 'mouse-events', message: '通过鼠标事件序列点击成功'};
  } catch(e) {}

  // ------ 第 3 步：向上查找可点击的祖先元素 ------
  let parent = btn.parentElement;
  for (let i = 0; i < 5 && parent; i++) {
    if (parent.tagName === 'A' || parent.tagName === 'BUTTON' || parent.onclick) {
      try {
        parent.click();
        return {success: true, method: 'parent-click', message: '通过父元素 click() 点击成功'};
      } catch(e) {}
      try {
        const rect = parent.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const opts = {bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX: cx, clientY: cy};
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => {
          const E = window[t.startsWith('pointer') ? 'PointerEvent' : 'MouseEvent'];
          parent.dispatchEvent(new E(t, opts));
        });
        return {success: true, method: 'parent-mouse-events', message: '通过父元素鼠标事件点击成功'};
      } catch(e) {}
    }
    parent = parent.parentElement;
  }

  return {success: false, method: 'exhausted', message: '所有点击策略均失败'};
})(arguments[0])
```

**使用方式**：通过 `chrome-devtools_evaluate_script` 执行，`args` 参数传入课程名称或按钮文本。脚本会自动定位课程行、查找操作按钮并尝试多级降级点击。

**何时使用**：
- `chrome-devtools_click` 报错 "element did not become interactive" 时
- 目标元素是 `div` 而非 `<a>`/`<button>` 时
- 目标元素的 `href` 是 `javascript:;` 时
- 任何点击后页面未发生导航的情况（作为重试手段）

## 导航验证脚本

点击课程链接后，验证页面是否实际发生了导航或内容变化。

```
(function(beforeState){
  // beforeState 是点击前调用此脚本返回的页面状态快照
  // 返回 {navigated: boolean, currentUrl: string, title: string, changes: string[]}
  const currentUrl = window.location.href;
  const title = document.title;
  const changes = [];

  if (beforeState.url !== currentUrl) {
    changes.push('url_changed: ' + beforeState.url + ' -> ' + currentUrl);
  }
  if (beforeState.title !== title) {
    changes.push('title_changed');
  }
  const bodyHash = document.body.innerHTML.length;
  if (Math.abs(bodyHash - beforeState.bodyLength) > 100) {
    changes.push('body_content_changed');
  }

  return {
    navigated: changes.length > 0,
    currentUrl: currentUrl,
    title: title,
    changes: changes
  };
})(arguments[0])
```

**使用方式**：
1. 点击前先执行 `({url: window.location.href, title: document.title, bodyLength: document.body.innerHTML.length})` 获取点击前状态。
2. 点击后执行本脚本，传入步骤 1 返回的对象作为 `args` 参数。
3. 如果 `navigated=false`，说明点击未生效，应使用通用点击辅助脚本重试。
