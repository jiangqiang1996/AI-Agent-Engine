# PPTX 内容可视化模式

将大纲内容类型映射为视觉元素，禁止用空格对齐模拟表格。

---

## 1. 彩色卡片色块 — 表格内容

**问题**：大纲中的表格直接用空格对齐，列对齐丢失，视觉混乱。

**做法**：每行一个彩色色块卡片，左侧色条 + 标题加粗 + 说明灰色。

**示例**：

```
卡片背景: fill=F0F4FF, x=50pt, y=75pt, w=860pt, h=55pt
左侧色条: fill=4472C4, x=50pt, y=75pt, w=5pt, h=55pt
标题: x=65pt, y=80pt, size=13pt, bold, color=4472C4
说明: x=320pt, y=83pt, size=11pt, color=555555
```

多行卡片依次向下排列，y 递增 65pt（卡片高 55pt + 间距 10pt），交替使用不同色系。

---

## 2. 编号步骤网格 — 工作流/流程

**问题**：编号列表平铺，缺乏视觉层次。

**做法**：每步一个彩色卡片，2-3 列网格，不同颜色，含步骤标题+描述。

**示例（2行3列）**：

```
卡片宽=270pt, 高=65pt, 间距=15pt
行1 y=75pt:  x=40pt, 345pt, 650pt
行2 y=160pt: x=40pt, 345pt, 650pt

每卡片:
  色块背景: fill=对应色浅色版
  标题: x=卡片x+15, y=卡片y+7, size=14pt, bold, color=对应色
  描述: x=卡片x+15, y=卡片y+30, size=11pt, color=555555
```

颜色循环：蓝 `4472C4` → 橙 `ED7D31` → 绿 `70AD47` → 红 `E94560` → 紫 `9C27B0` → 蓝 `5B9BD5`

---

## 3. 深色代码块 — 代码/配置

**问题**：代码用普通文本，无语法高亮，难以阅读。

**做法**：深色背景代码区 + Consolas 字体 + 关键词彩色。

**示例**：

```
代码块背景: fill=16213E, x=40pt, y=210pt, w=880pt, h=160pt
代码标题: x=60pt, y=220pt, size=14pt, bold, color=E94560
代码内容: x=60pt, y=245pt, font=Consolas, size=11pt
  关键词(quick/standard/deep/vision): color=对应色
  字符串: color=70AD47
  注释/标点: color=AAAAAA
```

---

## 4. 大数字统计块 — 数据/资产快照

**问题**：数字埋在文本中，不突出。

**做法**：大字号数字居中彩色卡片 + 标签下方。

**示例（4列大卡片 + 2列小卡片）**：

```
大卡片: w=200pt, h=120pt, 间距=20pt
  x: 50pt, 270pt, 490pt, 710pt
  y: 80pt
  数字: 居中, size=36pt, bold, color=FFFFFF
  标签: 居中, y=卡片y+65, size=13pt, color=浅色

小卡片: w=410pt, h=80pt, 间距=20pt
  x: 50pt, 500pt
  y: 220pt
  数字: 居中, size=28pt, bold, color=FFFFFF
  标签: 居中, y=卡片y+35, size=13pt, color=浅色
```

---

## 5. 双列对比 — 命令/映射表

**问题**：命令列表单列排列，浪费空间。

**做法**：左列命令（Consolas 蓝色）+ 右列说明（灰色），双列布局。

**示例**：

```
左列 x=60pt, w=180pt, font=Consolas, size=13pt, color=4472C4
右列 x=250pt, w=200pt, font=Calibri, size=12pt, color=555555
行高=30pt, 起始 y=80pt

右列第二组:
左列 x=520pt, color=ED7D31
右列 x=710pt
```

---

## 6. 树状结构 + 侧边流程图 — 架构/目录

**问题**：树状结构纯文本，缺少依赖方向可视化。

**做法**：左侧代码块（目录树）+ 右侧依赖方向流程图卡片。

**示例**：

```
左侧代码块:
  背景: fill=F8F9FA, x=40pt, y=70pt, w=450pt, h=250pt
  内容: font=Consolas, size=12pt, color=333333

右侧依赖方向卡片:
  背景: fill=F0F4FF, x=520pt, y=70pt, w=400pt, h=120pt
  色条: fill=4472C4, x=520pt, y=70pt, w=5pt, h=120pt
  标题: x=535pt, y=78pt, size=14pt, bold, color=4472C4
  流程:
    层名: font=Consolas, size=12pt
    箭头: size=14pt, color=4472C4, align=center

右侧约束卡片:
  背景: fill=FFF4E6, x=520pt, y=210pt, w=400pt, h=110pt
  色条: fill=ED7D31
  标题+列表
```

---

## 禁止事项

- 禁止用空格对齐模拟表格列
- 禁止纯文本堆叠不加任何视觉元素
- 禁止内容挤在顶部、底部大片留白
- 禁止文本框高度小于内容实际需要（导致溢出）
- 禁止混用不同设计模板的配色
