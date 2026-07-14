# PPTX 设计模板

6 套内置设计模板，每套含完整配色、字体、布局参数。选定模板后全程遵循，不得混用。

---

## 1. dark-accent — 技术分享 / 产品介绍

| 维度 | 值 |
|------|-----|
| 主色（标题条/页脚） | `16213E` |
| 强调色（accent 竖条/装饰） | `E94560` |
| 背景色（封面/结束页） | `16213E` |
| 背景色（内容页） | `FFFFFF` |
| 标题文字色 | `FFFFFF`（色条上）/ `1A1A2E`（白底页） |
| 正文文字色 | `333333` |
| 辅助文字色 | `666666` |
| 浅色文字色 | `888899` |
| 侧栏色（封面/结束页） | `0F3460` |
| 卡片背景色 | `F0F4FF`（蓝）/ `FFF4E6`（橙）/ `E8F5E9`（绿）/ `FCE4EC`（红） |
| 卡片色条色 | `4472C4` / `ED7D31` / `70AD47` / `E94560` |
| 标题字体 | `Calibri Light` |
| 正文字体 | `Calibri` |
| 代码字体 | `Consolas` |
| 标题字号 | `22pt`（色条上）/ `32pt`（白底大标题） |
| 正文字号 | `13pt` |
| 辅助字号 | `11pt` |

### 封面页布局

```
背景: 16213E
左侧栏: x=0, y=0, w=120pt, h=540pt, fill=0F3460
红色装饰条: x=140pt, y=180pt, w=200pt, h=4pt, fill=E94560
主标题: x=140pt, y=200pt, w=600pt, h=60pt, size=44pt, bold, color=FFFFFF
副标题: x=140pt, y=270pt, w=600pt, h=30pt, size=20pt, color=E94560
描述文本: x=140pt, y=320pt, w=550pt, h=80pt, size=13pt, color=A0A0B8
仓库地址: x=140pt, y=480pt, w=400pt, h=20pt, size=11pt, color=707090
右下角标识: x=860pt, y=480pt, w=60pt, h=20pt, size=11pt, color=707090
```

### 内容页布局

```
顶部标题色条: x=0, y=0, w=960pt, h=50pt, fill=16213E
左侧 accent 竖条: x=0, y=0, w=6pt, h=50pt, fill=E94560
标题文本: x=30pt, y=12pt, w=700pt, h=30pt, size=22pt, bold, color=FFFFFF
页码: x=850pt, y=15pt, w=80pt, h=20pt, size=11pt, color=8888AA, align=right
内容区起始: y=70pt
底部页脚条: x=0, y=510pt, w=960pt, h=30pt, fill=16213E
页脚文本: x=280pt, y=515pt, w=400pt, h=20pt, size=10pt, color=8888AA, align=center
```

### 结束页布局

与封面页相同，主标题改为"谢谢"，增加工作流提示行。

---

## 2. light-card — 商务汇报 / 项目总结

| 维度 | 值 |
|------|-----|
| 主色 | `2C3E50` |
| 强调色 | `3498DB` |
| 背景色（全部页） | `FFFFFF` |
| 标题文字色 | `2C3E50` |
| 正文文字色 | `555555` |
| 辅助文字色 | `888888` |
| 卡片背景色 | `ECF0F1`（灰）/ `EBF5FB`（蓝）/ `FEF9E7`（黄）/ `FDEDEC`（红） |
| 卡片色条色 | `3498DB` / `E67E22` / `27AE60` / `E74C3C` |
| 标题字体 | `Calibri Light` |
| 正文字体 | `Calibri` |
| 标题字号 | `28pt` |
| 正文字号 | `14pt` |

### 内容页布局

```
顶部细线: x=0, y=0, w=960pt, h=4pt, fill=3498DB
标题: x=50pt, y=20pt, w=800pt, h=40pt, size=28pt, bold, color=2C3E50
副标题/分隔线: x=50pt, y=65pt, w=860pt, h=2pt, fill=ECF0F1
内容区起始: y=85pt
页码: x=880pt, y=515pt, w=60pt, h=20pt, size=10pt, color=AAAAAA
```

---

## 3. minimal — 学术 / 简约

| 维度 | 值 |
|------|-----|
| 主色 | `333333` |
| 强调色 | `007ACC` |
| 背景色 | `FFFFFF` |
| 标题文字色 | `333333` |
| 正文文字色 | `555555` |
| 辅助文字色 | `999999` |
| 标题字体 | `Calibri Light` |
| 正文字体 | `Calibri` |
| 标题字号 | `26pt` |
| 正文字号 | `14pt` |

### 内容页布局

```
标题: x=60pt, y=40pt, w=800pt, h=40pt, size=26pt, bold, color=333333
标题下细线: x=60pt, y=85pt, w=200pt, h=2pt, fill=007ACC
内容区起始: y=110pt
页码: x=880pt, y=515pt, w=60pt, h=20pt, size=10pt, color=CCCCCC
大量留白，不使用色块或卡片
```

---

## 4. bold-stat — 数据展示 / 成果汇报

| 维度 | 值 |
|------|-----|
| 主色 | `1A1A2E` |
| 强调色 | `E94560` |
| 背景色（内容页） | `FFFFFF` |
| 背景色（封面/结束页） | `1A1A2E` |
| 标题文字色 | `FFFFFF`（色条上） |
| 大数字色 | 各统计块用不同色：`4472C4` / `ED7D31` / `70AD47` / `E94560` / `5B9BD5` / `9C27B0` |
| 数字字号 | `36pt`（大卡片）/ `28pt`（小卡片） |
| 标签字号 | `13pt` |
| 标题字体 | `Calibri Light` |
| 正文字体 | `Calibri` |

### 统计卡片布局

```
大卡片（4 列）:
  卡片宽: 200pt, 高: 120pt
  间距: 20pt
  起始 x: 50pt, y: 80pt
  数字: 居中, size=36pt, bold, color=FFFFFF
  标签: 居中, size=13pt, color=浅色

小卡片（2 列）:
  卡片宽: 410pt, 高: 80pt
  间距: 20pt
  数字: 居中, size=28pt, bold, color=FFFFFF
  标签: 居中, size=13pt, color=浅色
```

---

## 5. tech-blue — 科技蓝

| 维度 | 值 |
|------|-----|
| 主色 | `0A1929` |
| 强调色 | `00B4FF` |
| 辅助强调色 | `64FFDA` |
| 背景色（封面/结束页） | `0A1929` |
| 背景色（内容页） | `FFFFFF` |
| 标题文字色 | `FFFFFF`（色条上）/ `0A1929`（白底页） |
| 正文文字色 | `333333` |
| 辅助文字色 | `666666` |
| 侧栏色 | `0D1B2A` |
| 卡片背景色 | `E1F5FE`（浅蓝）/ `E0F7FA`（青）/ `F1F8E9`（浅绿） |
| 卡片色条色 | `00B4FF` / `64FFDA` / `00E676` |
| 标题字体 | `Calibri Light` |
| 正文字体 | `Calibri` |
| 代码字体 | `Consolas` |
| 标题字号 | `22pt`（色条上） |
| 正文字号 | `13pt` |

### 封面页布局

```
背景: 0A1929
左侧栏: x=0, y=0, w=120pt, h=540pt, fill=0D1B2A
青色装饰条: x=140pt, y=180pt, w=200pt, h=4pt, fill=64FFDA
主标题: x=140pt, y=200pt, w=600pt, h=60pt, size=44pt, bold, color=FFFFFF
副标题: x=140pt, y=270pt, w=600pt, h=30pt, size=20pt, color=00B4FF
描述文本: x=140pt, y=320pt, w=550pt, h=80pt, size=13pt, color=8899AA
```

### 内容页布局

```
顶部标题色条: x=0, y=0, w=960pt, h=50pt, fill=0A1929
左侧 accent 竖条: x=0, y=0, w=6pt, h=50pt, fill=00B4FF
标题文本: x=30pt, y=12pt, w=700pt, h=30pt, size=22pt, bold, color=FFFFFF
页码: x=850pt, y=15pt, w=80pt, h=20pt, size=11pt, color=446677, align=right
内容区起始: y=70pt
底部页脚条: x=0, y=510pt, w=960pt, h=30pt, fill=0A1929
页脚文本: x=280pt, y=515pt, w=400pt, h=20pt, size=10pt, color=446677, align=center
```

---

## 6. party-red — 党建红

| 维度 | 值 |
|------|-----|
| 主色 | `8B0000` |
| 强调色 | `FFD700` |
| 辅助色 | `C62828` |
| 背景色（封面/结束页） | `8B0000` |
| 背景色（内容页） | `FFFFFF` |
| 标题文字色 | `FFFFFF`（色条上）/ `8B0000`（白底页标题） |
| 正文文字色 | `333333` |
| 辅助文字色 | `666666` |
| 侧栏色 | `6D0F0F` |
| 卡片背景色 | `FFF8E1`（金底）/ `FFEBEE`（红底）/ `FCE4EC`（粉底） |
| 卡片色条色 | `FFD700` / `C62828` / `8B0000` |
| 标题字体 | `Calibri Light` |
| 正文字体 | `Calibri` |
| 标题字号 | `22pt`（色条上） |
| 正文字号 | `14pt` |

### 封面页布局

```
背景: 8B0000
左侧栏: x=0, y=0, w=120pt, h=540pt, fill=6D0F0F
金色装饰条: x=140pt, y=180pt, w=200pt, h=4pt, fill=FFD700
主标题: x=140pt, y=200pt, w=600pt, h=60pt, size=44pt, bold, color=FFFFFF
副标题: x=140pt, y=270pt, w=600pt, h=30pt, size=20pt, color=FFD700
描述文本: x=140pt, y=320pt, w=550pt, h=80pt, size=14pt, color=FFCCCC
```

### 内容页布局

```
顶部标题色条: x=0, y=0, w=960pt, h=50pt, fill=8B0000
左侧 accent 竖条: x=0, y=0, w=6pt, h=50pt, fill=FFD700
标题文本: x=30pt, y=12pt, w=700pt, h=30pt, size=22pt, bold, color=FFFFFF
页码: x=850pt, y=15pt, w=80pt, h=20pt, size=11pt, color=DDAAAA, align=right
内容区起始: y=70pt
底部页脚条: x=0, y=510pt, w=960pt, h=30pt, fill=8B0000
页脚文本: x=280pt, y=515pt, w=400pt, h=20pt, size=10pt, color=DDAAAA, align=center
```
