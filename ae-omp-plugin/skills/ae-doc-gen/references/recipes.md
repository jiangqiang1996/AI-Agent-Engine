# 复杂格式配方速查（可运行代码骨架）

所有骨架在 eval Python kernel 内运行（依赖：`python-docx`、`openpyxl`、`python-pptx`、`reportlab`、`pypdf`、`formulas`）。骨架中的路径、数据、颜色为占位值，按当次风格方案替换。生成后一律 omp read 回读验证（见主 SKILL.md）。

## docx（python-docx）

### 基础 + 中文字体（eastAsia）

```python
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.oxml.ns import qn

doc = Document()

def set_font(run, name="微软雅黑", size=11, bold=False, color=None):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)  # "2C3E50"
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)  # 中文字体必须设 eastAsia

h = doc.add_heading(level=1).add_run("一级标题")
set_font(h, size=18, bold=True, color="2C3E50")
p = doc.add_paragraph().add_run("正文内容，支持粗体/斜体/彩色/高亮。")
set_font(p, size=11)
```

### 合并单元格 + 表头底纹白字

```python
from docx.oxml import OxmlElement

def shade_cell(cell, hexcolor):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hexcolor)          # 6 位 HEX，不带 #
    cell._tc.get_or_add_tcPr().append(shd)

table = doc.add_table(rows=3, cols=3)
table.style = "Table Grid"
# 横向合并（第 1 行 3 列并 1）+ 纵向合并（第 2、3 行首列并 1）
table.cell(0, 0).merge(table.cell(0, 2))
table.cell(1, 0).merge(table.cell(2, 0))
# 表头底纹 + 白字
head = table.cell(0, 0)
shade_cell(head, "2C3E50")
r = head.paragraphs[0].add_run("合并表头")
set_font(r, bold=True, color="FFFFFF")
```

### TOC 目录域（fldSimple）

```python
def add_toc(doc):
    p = doc.add_paragraph()
    fld = OxmlElement("w:fldSimple")
    fld.set(qn("w:instr"), r'TOC \o "1-3" \h \z \u')
    r = OxmlElement("w:r"); t = OxmlElement("w:t")
    t.text = "（打开文档后右键更新目录域）"
    r.append(t); fld.append(r); p._p.append(fld)

add_toc(doc)  # 目录条目由 Word 打开时刷新域生成
```

### 页眉 + 页脚 PAGE 域

```python
def add_field(paragraph, instr):
    r1 = paragraph.add_run()
    f1 = OxmlElement("w:fldChar"); f1.set(qn("w:fldCharType"), "begin"); r1._r.append(f1)
    r2 = paragraph.add_run()
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = instr; r2._r.append(it)
    r3 = paragraph.add_run()
    f2 = OxmlElement("w:fldChar"); f2.set(qn("w:fldCharType"), "end"); r3._r.append(f2)

section = doc.sections[0]
section.header.paragraphs[0].add_run("文档标题 · 页眉")
footer_p = section.footer.paragraphs[0]
footer_p.add_run("第 ")
add_field(footer_p, " PAGE ")
footer_p.add_run(" 页")
```

### 横向 landscape 新节

```python
from docx.enum.section import WD_SECTION, WD_ORIENT

s = doc.add_section(WD_SECTION.NEW_PAGE)
s.orientation = WD_ORIENT.LANDSCAPE
s.page_width, s.page_height = s.page_height, s.page_width  # 宽高必须互换
# 后续大宽表格加在本节；再下一节可同法恢复纵向
```

### 真超链接（relationship）

```python
def add_hyperlink(paragraph, url, text):
    part = paragraph.part
    r_id = part.relate_to(
        url,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hl = OxmlElement("w:hyperlink"); hl.set(qn("r:id"), r_id)
    r = OxmlElement("w:r"); rPr = OxmlElement("w:rPr")
    c = OxmlElement("w:color"); c.set(qn("w:val"), "0563C1"); rPr.append(c)
    u = OxmlElement("w:u"); u.set(qn("w:val"), "single"); rPr.append(u)
    r.append(rPr)
    t = OxmlElement("w:t"); t.text = text; r.append(t)
    hl.append(r); paragraph._p.append(hl)

add_hyperlink(doc.add_paragraph(), "https://example.com", "示例链接")
```

### 图片居中

```python
from docx.enum.text import WD_ALIGN_PARAGRAPH

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.add_run().add_picture("chart.png", width=Cm(14))
```

## xlsx（openpyxl）

### 样式 + 合并单元格 + 冻结/筛选/定义名称

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.workbook.defined_name import DefinedName

wb = Workbook(); ws = wb.active; ws.title = "数据"
thin = Side(style="thin", color="B0B0B0")
border = Border(left=thin, right=thin, top=thin, bottom=thin)

ws.merge_cells("A1:E1")                       # 合并单元格
ws["A1"] = "季度报表"
ws["A1"].font = Font(name="微软雅黑", size=14, bold=True, color="FFFFFF")
ws["A1"].fill = PatternFill("solid", fgColor="2C3E50")   # 表头底纹白字
ws["A1"].alignment = Alignment(horizontal="center", vertical="center")

for row in ws["A2:E10"]:
    for cell in row:
        cell.border = border                  # 全表边框

ws["F2"].number_format = "0.00%"              # 百分比格式（如占比列）
ws.freeze_panes = "A2"                        # 冻结窗格
ws.auto_filter.ref = "A2:E10"                 # 自动筛选
wb.defined_names.add(DefinedName("mapping", attr_text="映射表!$A$1:$B$5"))
wb.save("out.xlsx")
```

### 公式（SUM/VLOOKUP/IF）+ formulas 实算

```python
ws["F2"] = "=SUM(B2:E2)"
ws["B20"] = '=VLOOKUP(A20, mapping, 2, FALSE)'
ws["B21"] = '=IF(F2>=500, "达标", "未达标")'
wb.save("out.xlsx")

# 硬约束②：openpyxl 只写公式串，回读为空；实算用 formulas 库
import formulas
xl_model = formulas.ExcelModel().loads("out.xlsx").finish()
solution = xl_model.calculate()
for key, val in solution.items():             # key 形如 "'[OUT.XLSX]数据'!F2"
    if key.endswith("!F2"):
        print(key, val.value)                 # 得到实算值
# 需要让下游直接读到数值时：把实算值写回对应单元格另存一份
```

### 条件格式（色阶 + 规则）

```python
from openpyxl.formatting.rule import ColorScaleRule, CellIsRule

ws.conditional_formatting.add(
    "B2:E10",
    ColorScaleRule(start_type="min", start_color="63BE7B",
                   end_type="max", end_color="F8696B"),
)
ws.conditional_formatting.add(
    "B2:B10",
    CellIsRule(operator="lessThan", formula=["60"],
               fill=PatternFill("solid", fgColor="FFC7CE"),
               font=Font(color="9C0006")),
)
```

### 数据验证下拉

```python
from openpyxl.worksheet.datavalidation import DataValidation

dv = DataValidation(type="list", formula1='"是,否"', allow_blank=True)
ws.add_data_validation(dv)
dv.add("H2:H10")
```

### 柱状图 + 饼图（硬约束③：生成侧自检）

```python
from openpyxl.chart import BarChart, PieChart, Reference

data = Reference(ws, min_col=2, max_col=3, min_row=1, max_row=8)   # 含表头
cats = Reference(ws, min_col=1, min_row=2, max_row=8)

bar = BarChart(); bar.title = "季度对比"
bar.add_data(data, titles_from_data=True); bar.set_categories(cats)
ws.add_chart(bar, "J2")

pie = PieChart(); pie.title = "占比"
pie.add_data(Reference(ws, min_col=2, min_row=1, max_row=8), titles_from_data=True)
pie.set_categories(cats)
ws.add_chart(pie, "J18")

# 生成侧数据自检（图表无法回读验证）
series_values = [ws.cell(row=r, column=2).value for r in range(2, 9)]
assert len(series_values) == 7 and all(v is not None for v in series_values), "图表数据不完整"
wb.save("out.xlsx")
```

## pptx（python-pptx）

### 多级要点 + 彩色 run + 文本框

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

prs = Presentation()
slide = prs.slides.add_slide(prs.slide_layouts[1])   # 标题+内容版式
slide.shapes.title.text = "页面标题"

tf = slide.placeholders[1].text_frame
tf.text = "一级要点"
p = tf.add_paragraph(); p.text = "二级要点"; p.level = 1
run = p.runs[0]
run.font.size = Pt(20); run.font.bold = True
run.font.color.rgb = RGBColor(0x2C, 0x3E, 0x50)

box = slide.shapes.add_textbox(Inches(1), Inches(5.5), Inches(8), Inches(1))
r = box.text_frame.add_paragraph().add_run(); r.text = "自定义文本框"
r.font.size = Pt(24); r.font.color.rgb = RGBColor(0x1F, 0x6F, 0xB2)
```

### 表格 + 双系列柱状图

```python
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE

tbl = slide.shapes.add_table(3, 4, Inches(1), Inches(2), Inches(8), Inches(2)).table
tbl.cell(0, 0).text = "指标"                        # 首行表头，逐格填充

cd = CategoryChartData()
cd.categories = ["Q1", "Q2", "Q3", "Q4"]
cd.add_series("2025", (120, 132, 101, 134))
cd.add_series("2026", (230, 210, 190, 250))
slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED,
                       Inches(1), Inches(4.2), Inches(8), Inches(3), cd)
# 硬约束③：add_chart 前对 categories/series 数值做断言自检
```

### 演讲者备注 + 图片

```python
slide.notes_slide.notes_text_frame.text = "本页讲解要点：……"   # 回读时以 ### Notes: 呈现
slide.shapes.add_picture("chart.png", Inches(7.5), Inches(0.5), height=Inches(2))
prs.save("out.pptx")
```

## pdf（reportlab，中文必须嵌入 TTF）

### 注册中文字体 + platypus 多页文档

```python
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib import colors

# 硬约束①：中文必须 TTFont 嵌入系统 TTF；禁用 UnicodeCIDFont('STSong-Light')
pdfmetrics.registerFont(TTFont("SimHei", "C:/Windows/Fonts/simhei.ttf"))
# 备选系统字体：simsun.ttc（宋体）、simkai.ttf（楷体）、msyh.ttc（微软雅黑）

body = ParagraphStyle("body", fontName="SimHei", fontSize=11, leading=18)
h1 = ParagraphStyle("h1", parent=body, fontSize=18, spaceAfter=12)

def footer(canvas, doc_):                            # 页脚自动页码
    canvas.save_state()
    canvas.setFont("SimHei", 9)
    canvas.drawCentredString(A4[0] / 2, 24, f"第 {doc_.page} 页")
    canvas.restore_state()

doc = SimpleDocTemplate("out.pdf", pagesize=A4,
                        title="报告标题", author="AE")   # 元数据
zebra = TableStyle([
    ("FONTNAME", (0, 0), (-1, -1), "SimHei"),
    ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#B0B0B0")),
    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2C3E50")),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F2F6FA")]),
])
story = [Paragraph("中文标题", h1), Spacer(1, 8),
         Paragraph("中文正文段落。", body), Spacer(1, 8)]
t = Table([["指标", "数值"], ["营收", "1,234"], ["成本", "567"]])
t.setStyle(zebra)                                    # 网格+斑马纹表格
story.append(t)
doc.build(story, onFirstPage=footer, onLaterPages=footer)
# 生成后 read out.pdf 回读：不得出现 Text extraction is incomplete
```

### pypdf：合并 / 拆分 / 表单

```python
from pypdf import PdfReader, PdfWriter

# 合并
w = PdfWriter()
for f in ["a.pdf", "b.pdf"]:
    w.append(PdfReader(f))
w.write("merged.pdf")

# 拆分（抽取第 1-2 页）
r = PdfReader("merged.pdf")
w2 = PdfWriter()
for i in range(0, 2):
    w2.add_page(r.pages[i])
w2.write("part.pdf")

# 表单字段读取
fields = PdfReader("form.pdf").get_fields()
```

JS 侧备选（eval JS kernel，项目内顺手时用）：先安装 `pdf-lib`（如 `npm i pdf-lib`），再 `const { PDFDocument } = await import("pdf-lib")`；`PDFDocument.load(bytes)` → `copyPages`/`removePage` 实现合并拆分，`getForm().getField(name).setText(value)` 填表单，最后 `Bun.write` 落盘 `await out.save()`。

## 离线降级：stdlib zipfile 最小 OOXML

网络不可用（pip/npm 均失败）时手写最小文档包。docx 示例（xlsx/pptx 同构：替换 content-type 与主体 part 路径）：

```python
import zipfile

CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>'''

RELS = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

def paragraph(text):
    return f'<w:p><w:r><w:t xml:space="preserve">{text}</w:t></w:r></w:p>'

DOCUMENT = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body>' + paragraph("最小 docx：离线降级产物") + '</w:body></w:document>')

with zipfile.ZipFile("minimal.docx", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", CONTENT_TYPES)
    z.writestr("_rels/.rels", RELS)
    z.writestr("word/document.xml", DOCUMENT)
# 生成后同样必须 omp read 回读验证
```
