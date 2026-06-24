import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'ae-xlsx-tool-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

async function callTool(
  root: string,
  args: Record<string, unknown>,
): Promise<{ output: string; metadata?: Record<string, unknown> }> {
  const { aeXlsxTool: tool } = await import('../../src/tools/ae-xlsx.tool.js')
  const definition = tool as unknown as {
    execute: (
      args: Record<string, unknown>,
      ctx: Record<string, unknown>,
    ) => Promise<string | { output: string; metadata?: Record<string, unknown> }>
  }
  const result = await definition.execute(args, {
    metadata: vi.fn(),
    worktree: root,
    directory: root,
    sessionID: 'test-session',
    abort: new AbortController().signal,
  })
  return typeof result === 'string' ? { output: result } : result
}

describe('ae-xlsx 工具', () => {
  it('create 应生成 XLSX 并返回 outputPath', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
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

    expect(result.output).toContain('已创建')
    expect(result.output).toContain('1 个工作表')
    const outputPath = result.metadata!.outputPath as string
    expect(outputPath).toContain(join('ae', 'documents', 'xlsx') + sep)
    expect(existsSync(outputPath)).toBe(true)
  })

  it('ae/documents/xlsx 目录不存在时应自动创建', async () => {
    const root = createRoot()
    await callTool(root, {
      operation: 'create',
      sheets: [{ name: 'Sheet1' }],
    })

    expect(existsSync(join(root, 'ae', 'documents', 'xlsx'))).toBe(true)
  })

  it('create 应支持公式单元格', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '公式表',
          cells: [
            { address: 'A1', value: 10 },
            { address: 'A2', value: 20 },
            { address: 'A3', value: { formula: 'SUM(A1:A2)' } },
          ],
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持完整单元格样式', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '样式表',
          cells: [
            {
              address: 'A1',
              value: '样式',
              style: {
                font: { name: 'Arial', size: 12, bold: true, italic: true, color: { argb: 'FFFF0000' } },
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
          ],
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持合并单元格', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '合并表',
          cells: [{ address: 'A1', value: '合并' }],
          merges: ['A1:B2', 'C1:D1'],
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持冻结窗格', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '冻结表',
          freeze: { xSplit: 1, ySplit: 1, topLeftCell: 'B2' },
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持自动筛选', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '筛选表',
          autoFilter: 'A1:D10',
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持条件格式', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '条件格式表',
          conditionalFormatting: [
            {
              ref: 'B2:B10',
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

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持数据验证', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
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

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持工作簿属性', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      workbookProps: {
        creator: 'AE 测试',
        title: '测试工作簿',
        company: 'AE 公司',
      },
      sheets: [{ name: 'Sheet1' }],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持工作表属性', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '属性表',
          properties: {
            tabColor: { argb: 'FF0066CC' },
            showGridLines: false,
          },
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('create 应支持行高', async () => {
    const root = createRoot()
    const result = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '行高表',
          rowHeights: [{ row: 1, height: 30 }],
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('analyze 应返回工作表信息', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '分析表',
          columns: [{ header: '列A', key: 'a' }],
          rows: [{ a: '值1' }],
        },
      ],
    })

    const result = await callTool(root, {
      operation: 'analyze',
      file: created.metadata!.outputPath,
    })

    expect(result.output).toContain('分析表')
    expect(result.output).toContain('列A')
  })

  it('analyze 应返回合并单元格和冻结窗格信息', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '完整表',
          cells: [{ address: 'A1', value: '测试' }],
          merges: ['A1:B2'],
          freeze: { ySplit: 1 },
        },
      ],
    })

    const result = await callTool(root, {
      operation: 'analyze',
      file: created.metadata!.outputPath,
    })

    expect(result.output).toContain('合并单元格')
    expect(result.output).toContain('A1:B2')
    expect(result.output).toContain('冻结窗格')
  })

  it('edit 应修改指定单元格', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [
        {
          name: '编辑表',
          columns: [{ header: '值', key: 'val' }],
          rows: [{ val: '原始值' }],
        },
      ],
    })

    const result = await callTool(root, {
      operation: 'edit',
      file: created.metadata!.outputPath,
      sheetName: '编辑表',
      cells: [{ address: 'A2', value: '修改后值' }],
    })

    expect(result.output).toContain('1 个单元格')
    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('edit 应支持完整样式编辑', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [{ name: '样式编辑表' }],
    })

    const result = await callTool(root, {
      operation: 'edit',
      file: created.metadata!.outputPath,
      sheetName: '样式编辑表',
      cells: [
        {
          address: 'A1',
          value: '带样式',
          style: {
            font: { bold: true, color: { argb: 'FF0000FF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFCC' } },
            border: { top: { style: 'thin' }, bottom: { style: 'thin' } },
          },
        },
      ],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('edit 应支持合并单元格操作', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [{ name: '合并编辑表' }],
    })

    const result = await callTool(root, {
      operation: 'edit',
      file: created.metadata!.outputPath,
      sheetName: '合并编辑表',
      cells: [{ address: 'A1', value: '合并' }],
      merges: ['A1:B2'],
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('edit 应支持冻结窗格操作', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [{ name: '冻结编辑表' }],
    })

    const result = await callTool(root, {
      operation: 'edit',
      file: created.metadata!.outputPath,
      sheetName: '冻结编辑表',
      cells: [{ address: 'A1', value: '冻结' }],
      freeze: { ySplit: 1 },
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('edit 应支持自动筛选操作', async () => {
    const root = createRoot()
    const created = await callTool(root, {
      operation: 'create',
      sheets: [{ name: '筛选编辑表' }],
    })

    const result = await callTool(root, {
      operation: 'edit',
      file: created.metadata!.outputPath,
      sheetName: '筛选编辑表',
      cells: [{ address: 'A1', value: '筛选' }],
      autoFilter: 'A1:A5',
    })

    expect(existsSync(result.metadata!.outputPath as string)).toBe(true)
  })

  it('缺少必填参数时应返回可恢复的中文错误', async () => {
    const root = createRoot()
    const result = await callTool(root, { operation: 'create' })

    expect(result.output).toContain('XLSX 处理失败')
    expect(result.output).toContain('sheets')
  })
})
