import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { processXlsx } from '../../src/services/xlsx-service.js'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-xlsx-service-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('xlsx-service', () => {
  it('create 应根据工作表数据生成 XLSX 文件', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '数据表',
          columns: [
            { header: '姓名', key: 'name', width: 20 },
            { header: '年龄', key: 'age' },
          ],
          rows: [
            { name: '张三', age: 25 },
            { name: '李四', age: 30 },
          ],
        },
      ],
    })

    expect(result.outputPath).toBeTruthy()
    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('1 个工作表')
  })

  it('create 缺少 sheets 应抛出错误', async () => {
    const root = createRoot()
    await expect(
      processXlsx({ operation: 'create', worktree: root }),
    ).rejects.toThrow('sheets')
  })

  it('create 应支持公式和单元格样式', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '公式表',
          cells: [
            { address: 'A1', value: 10 },
            { address: 'A2', value: 20 },
            { address: 'A3', value: { formula: 'SUM(A1:A2)' } },
            { address: 'A1', bold: true },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持完整单元格样式（font/fill/border/alignment）', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '样式表',
          cells: [
            {
              address: 'A1',
              value: '样式测试',
              style: {
                font: { name: '微软雅黑', size: 14, bold: true, italic: true, color: { argb: 'FFFF0000' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } },
                border: {
                  top: { style: 'thin', color: { argb: 'FF000000' } },
                  bottom: { style: 'medium', color: { argb: 'FF000000' } },
                  left: { style: 'dashed', color: { argb: 'FF000000' } },
                  right: { style: 'dotted', color: { argb: 'FF000000' } },
                },
                alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
                numFmt: '@',
              },
            },
            {
              address: 'B1',
              value: 1234.56,
              style: {
                font: { underline: 'double', strike: true },
                fill: { type: 'pattern', pattern: 'lightGrid', fgColor: { argb: 'FF00FF00' } },
                alignment: { textRotation: 45, indent: 2 },
                numFmt: '#,##0.00',
              },
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持合并单元格', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '合并表',
          cells: [
            { address: 'A1', value: '合并标题' },
          ],
          merges: ['A1:B2', 'C1:D1'],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)

    // 验证 analyze 能提取合并信息
    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('合并单元格')
    expect(analyzed.content).toContain('A1:B2')
  })

  it('create 应支持冻结窗格', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '冻结表',
          columns: [
            { header: 'A', key: 'a' },
            { header: 'B', key: 'b' },
          ],
          rows: [{ a: 1, b: 2 }],
          freeze: { xSplit: 1, ySplit: 1, topLeftCell: 'B2' },
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)

    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('冻结窗格')
    expect(analyzed.content).toContain('B2')
  })

  it('create 应支持自动筛选', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '筛选表',
          columns: [
            { header: '名称', key: 'name' },
            { header: '值', key: 'val' },
          ],
          rows: [
            { name: 'A', val: 10 },
            { name: 'B', val: 20 },
          ],
          autoFilter: 'A1:B3',
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持条件格式', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '条件格式表',
          cells: [
            { address: 'B2', value: 50 },
            { address: 'B3', value: 150 },
            { address: 'B4', value: 200 },
          ],
          conditionalFormatting: [
            {
              ref: 'B2:B4',
              rule: {
                type: 'cellIs',
                operator: 'greaterThan',
                formula: ['100'],
                priority: 1,
              },
              style: {
                font: { bold: true, color: { argb: 'FFFF0000' } },
                fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } },
              },
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)

    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('条件格式')
  })

  it('create 应支持数据验证', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '数据验证表',
          dataValidation: [
            {
              type: 'list',
              formula: '"高,中,低"',
              ranges: ['C2:C10'],
              allowBlank: true,
              showErrorMessage: true,
              error: '请选择有效值',
              errorTitle: '输入错误',
            },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)

    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('数据验证')
  })

  it('create 应支持工作簿属性', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      workbookProps: {
        creator: 'AE 测试',
        title: '测试工作簿',
        subject: '主题',
        description: '描述内容',
        keywords: '测试,XLSX',
        category: '测试',
        company: 'AE 公司',
      },
      sheets: [{ name: 'Sheet1' }],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持工作表属性（tabColor/hidden/showGridLines）', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '属性表',
          properties: {
            tabColor: { argb: 'FF0066CC' },
            showGridLines: false,
          },
        },
        {
          name: '隐藏表',
          properties: { hidden: true },
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持行高', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '行高表',
          rowHeights: [
            { row: 1, height: 30 },
            { row: 2, height: 50 },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持列样式', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '列样式表',
          columns: [
            {
              header: '金额',
              key: 'amount',
              width: 20,
              style: {
                numFmt: '#,##0.00',
                font: { bold: true },
                alignment: { horizontal: 'right' },
              },
            },
          ],
          rows: [{ amount: 1234.56 }],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('create 应支持 formula 和 hyperlink', async () => {
    const root = createRoot()
    const result = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '公式链接表',
          cells: [
            { address: 'A1', value: 10 },
            { address: 'B1', value: 20 },
            { address: 'C1', value: { formula: '=A1+B1' } },
            { address: 'D1', value: { hyperlink: 'https://example.com', text: '链接' } },
          ],
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('analyze 应提取工作表信息', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '分析表',
          columns: [{ header: '列A', key: 'a' }],
          rows: [{ a: '值1' }, { a: '值2' }],
        },
      ],
    })

    const result = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: created.outputPath!,
    })

    expect(result.summary).toContain('1 个工作表')
    expect(result.content).toContain('分析表')
    expect(result.content).toContain('列A')
  })

  it('edit 应修改指定工作表的单元格', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [
        {
          name: '编辑表',
          columns: [{ header: '值', key: 'val' }],
          rows: [{ val: '原始值' }],
        },
      ],
    })

    const result = await processXlsx({
      operation: 'edit',
      worktree: root,
      file: created.outputPath!,
      sheetName: '编辑表',
      cells: [{ address: 'A2', value: '修改后值' }],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
    expect(result.summary).toContain('1 个单元格')

    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('修改后值')
  })

  it('edit 应支持完整样式编辑', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [{ name: '样式编辑表' }],
    })

    const result = await processXlsx({
      operation: 'edit',
      worktree: root,
      file: created.outputPath!,
      sheetName: '样式编辑表',
      cells: [
        {
          address: 'A1',
          value: '带样式',
          style: {
            font: { bold: true, color: { argb: 'FF0000FF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' } },
            alignment: { horizontal: 'center' },
          },
        },
      ],
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('edit 应支持合并单元格操作', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [{ name: '合并编辑表' }],
    })

    const result = await processXlsx({
      operation: 'edit',
      worktree: root,
      file: created.outputPath!,
      sheetName: '合并编辑表',
      cells: [{ address: 'A1', value: '合并' }],
      merges: ['A1:B2'],
    })

    expect(existsSync(result.outputPath!)).toBe(true)

    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('合并单元格')
    expect(analyzed.content).toContain('A1:B2')
  })

  it('edit 应支持冻结窗格操作', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [{ name: '冻结编辑表' }],
    })

    const result = await processXlsx({
      operation: 'edit',
      worktree: root,
      file: created.outputPath!,
      sheetName: '冻结编辑表',
      cells: [{ address: 'A1', value: '冻结' }],
      freeze: { ySplit: 1 },
    })

    expect(existsSync(result.outputPath!)).toBe(true)

    const analyzed = await processXlsx({
      operation: 'analyze',
      worktree: root,
      file: result.outputPath!,
    })
    expect(analyzed.content).toContain('冻结窗格')
  })

  it('edit 应支持自动筛选操作', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [{ name: '筛选编辑表' }],
    })

    const result = await processXlsx({
      operation: 'edit',
      worktree: root,
      file: created.outputPath!,
      sheetName: '筛选编辑表',
      cells: [{ address: 'A1', value: '筛选' }],
      autoFilter: 'A1:A5',
    })

    expect(existsSync(result.outputPath!)).toBe(true)
  })

  it('edit 缺少 file 应抛出错误', async () => {
    const root = createRoot()
    await expect(
      processXlsx({
        operation: 'edit',
        worktree: root,
        sheetName: 'Sheet1',
        cells: [{ address: 'A1', value: 'test' }],
      }),
    ).rejects.toThrow('file')
  })

  it('edit 缺少 sheetName 应抛出错误', async () => {
    const root = createRoot()
    await expect(
      processXlsx({
        operation: 'edit',
        worktree: root,
        file: 'fake.xlsx',
        cells: [{ address: 'A1', value: 'test' }],
      }),
    ).rejects.toThrow('sheetName')
  })

  it('edit 工作表不存在应抛出错误', async () => {
    const root = createRoot()
    const created = await processXlsx({
      operation: 'create',
      worktree: root,
      sheets: [{ name: '存在表' }],
    })

    await expect(
      processXlsx({
        operation: 'edit',
        worktree: root,
        file: created.outputPath!,
        sheetName: '不存在表',
        cells: [{ address: 'A1', value: 'test' }],
      }),
    ).rejects.toThrow('不存在')
  })

  it('analyze 缺少 file 应抛出错误', async () => {
    const root = createRoot()
    await expect(
      processXlsx({ operation: 'analyze', worktree: root }),
    ).rejects.toThrow('file')
  })
})
