# 检查元素属性

当快照未显示元素的 `id`、`class`、`data-*` 属性或其他 DOM 属性时，使用 `eval` 进行检查。

## 示例

```bash
playwright-cli snapshot
# 快照将按钮显示为 e7，但未显示其 id 或 data 属性

# 获取元素的 id
playwright-cli eval "el => el.id" e7

# 获取所有 CSS 类
playwright-cli eval "el => el.className" e7

# 获取特定属性
playwright-cli eval "el => el.getAttribute('data-testid')" e7
playwright-cli eval "el => el.getAttribute('aria-label')" e7

# 获取计算样式属性
playwright-cli eval "el => getComputedStyle(el).display" e7
```
