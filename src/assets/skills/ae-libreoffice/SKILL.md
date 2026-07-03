---
name: ae:libreoffice
description: LibreOffice 运行时管理：检测、下载、配置和管理 LibreOffice（ae.jsonc 配置、系统安装或便携版），供 ae:pptx、ae:docx、ae:pdf 技能进行文档视觉验证时调用
argument-hint: "[action=check|install|config|set-path]"
---

# LibreOffice 运行时管理

## 角色

LibreOffice 运行时管理者：检测和确保 LibreOffice 可用，供文档技能进行高保真视觉验证。ae:libreoffice 是 LibreOffice 运行时的唯一管理入口，上层技能不应直接调用 ae-libreoffice 工具。

## 适用场景

- ae:pptx、ae:docx、ae:pdf 技能需要视觉验证时，先通过 ae:libreoffice 确认 LibreOffice 就绪
- 下载或管理便携版 LibreOffice
- 指定自定义 LibreOffice 安装路径（如非默认安装目录），通过 ae.jsonc 配置管理

## 不适用场景

- 不直接执行文档转换，只管理 LibreOffice 运行时可用性
- 不替代 ae:pptx、ae:docx、ae:pdf 的文档操作能力

## 执行流程

1. 解析 `$ARGUMENTS`，判断操作类型（check / install / config / set-path）
2. **check**：调用 ae-libreoffice 工具 action=check，按优先级检测 LibreOffice 可用性
   - 如果可用：返回 soffice 路径和来源，其他技能可继续视觉验证流程
   - 如果不可用：提示用户安装、下载便携版或配置自定义路径
3. **install**：调用 ae-libreoffice 工具 action=install，从阿里云镜像下载便携版 LibreOffice 到 `~/.config/opencode/libreoffice/`
   - 如果已就绪：直接返回路径
   - Windows 下载便携版（.paf.exe，约 300MB），Linux 下载 RPM 压缩包（.tar.gz），macOS 下载 DMG
   - 下载后永久缓存复用
   - 下载失败时提示用户手动安装
4. **config**：调用 ae-libreoffice 工具 action=config，读取当前 ae.jsonc 中 libreofficePath 配置
   - 显示配置值、来源（项目级或全局）和配置文件路径
   - 未配置时提示可用配置文件路径和设置方法
5. **set-path**：调用 ae-libreoffice 工具 action=set-path，将 soffice 路径写入 ae.jsonc
   - 必须提供 sofficePath 参数（soffice 可执行文件绝对路径）
   - 可选 configScope 参数指定写入项目级（project）或全局（global）配置，默认 global
   - 写入后后续 check 操作优先使用该配置路径

## LibreOffice 检测优先级

1. ae.jsonc 中的 `libreofficePath` 配置（项目级 > 全局级，优先使用）
2. 系统已安装的 LibreOffice
3. `~/.config/opencode/libreoffice/` 中的便携版 LibreOffice
4. 以上均无 → 需要下载便携版、手动安装或配置自定义路径

## ae.jsonc 配置格式

在项目级 `.opencode/ae.jsonc` 或全局 `~/.config/opencode/ae.jsonc` 中添加：

```jsonc
{
  "libreofficePath": "/path/to/soffice"
}
```

项目级配置优先于全局配置。

## 边界

- 只管理 LibreOffice 运行时，不执行文档操作
- 其他技能需要视觉验证时必须先调用 ae:libreoffice 确认就绪
- 便携版下载需要用户确认（约 300MB），从阿里云镜像下载绿色便携版本
- set-path 写入 ae.jsonc 时不会破坏已有配置，仅添加或更新 libreofficePath 字段

## 输出要求

- check 操作返回可用性状态、来源和 soffice 路径
- install 操作返回安装结果和 soffice 路径
- config 操作返回当前配置值、来源和配置文件路径
- set-path 操作返回写入结果和目标配置文件路径
