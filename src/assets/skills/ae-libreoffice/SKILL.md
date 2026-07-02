---
name: ae:libreoffice
description: LibreOffice 运行时管理：检测、下载和管理 LibreOffice（系统安装或便携版），供 ae:pptx、ae:docx、ae:pdf 技能进行文档视觉验证时调用
argument-hint: "[action=check|install]"
---

# LibreOffice 运行时管理

## 角色

LibreOffice 运行时管理者：检测和确保 LibreOffice 可用，供文档技能进行高保真视觉验证。ae:libreoffice 是 LibreOffice 运行时的唯一管理入口，上层技能不应直接调用 ae-libreoffice 工具。

## 适用场景

- ae:pptx、ae:docx、ae:pdf 技能需要视觉验证时，先通过 ae:libreoffice 确认 LibreOffice 就绪
- 下载或管理便携版 LibreOffice

## 不适用场景

- 不直接执行文档转换，只管理 LibreOffice 运行时可用性
- 不替代 ae:pptx、ae:docx、ae:pdf 的文档操作能力

## 执行流程

1. 解析 `$ARGUMENTS`，判断操作类型（check 或 install）
2. **check**：调用 ae-libreoffice 工具 action=check，检测 LibreOffice 可用性
   - 如果可用：返回 soffice 路径，其他技能可继续视觉验证流程
   - 如果不可用：提示用户安装或下载便携版
3. **install**：调用 ae-libreoffice 工具 action=install，下载便携版 LibreOffice 到 `~/.config/opencode/libreoffice/`
   - 如果已就绪：直接返回路径
   - 下载约 300MB，下载后永久缓存复用
   - 下载失败时提示用户手动安装

## LibreOffice 检测优先级

1. 系统已安装的 LibreOffice（优先使用）
2. `~/.config/opencode/libreoffice/` 中的便携版 LibreOffice
3. 以上均无 → 需要下载便携版或手动安装

## 边界

- 只管理 LibreOffice 运行时，不执行文档操作
- 其他技能需要视觉验证时必须先调用 ae:libreoffice 确认就绪
- 便携版下载需要用户确认（约 300MB）

## 输出要求

- check 操作返回可用性状态和 soffice 路径
- install 操作返回安装结果和 soffice 路径
