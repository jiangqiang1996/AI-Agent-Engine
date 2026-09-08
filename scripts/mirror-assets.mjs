/**
 * 资产目录镜像同步
 *
 * 替代「先 rm -rf 整个目录再 cp」的做法。原因：Windows 下 DLL（如 @napi-rs/canvas
 * 的 skia.win32-x64-msvc.node）一旦被运行中的进程映射就无法 unlink，整目录删除必然
 * 失败，且失败时目录已处于半删状态、后续 cp 不会执行，比不删更糟。
 *
 * 本模块改为：先合并覆盖复制（不触碰排除项），再增量剪枝目标中源已不存在的陈旧条目。
 * 单个文件删除失败只降级为警告，不影响整体更新结果，陈旧文件最晚在下次同步时清理。
 */

import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

/**
 * 判断相对路径是否命中排除集。排除项自身及其所有子路径都视为排除。
 */
function makeExcluded(excludes) {
  const list = [...excludes]
  return (rel) => list.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))
}

/**
 * 递归收集目录树，返回统一使用正斜杠的相对路径。
 * 命中排除集的目录不再向下递归，避免遍历 node_modules 这类大目录。
 */
async function collectTree(rootDir, excludes) {
  const excluded = makeExcluded(excludes)
  const files = []
  const dirs = []

  async function walk(dir, prefix) {
    if (!existsSync(dir)) {
      return
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (excluded(rel)) {
        continue
      }
      if (entry.isDirectory()) {
        dirs.push(rel)
        await walk(join(dir, entry.name), rel)
      } else {
        files.push(rel)
      }
    }
  }

  await walk(rootDir, '')
  return { files, dirs }
}

/**
 * 把 sourceDir 的内容镜像同步到 targetDir。
 *
 * @param {string} sourceDir 源资产目录（如 src/assets 或构建产物目录）
 * @param {string} targetDir 目标资产目录，允许尚不存在
 * @param {Iterable<string>} [excludes] 目标端保留、不参与剪枝的顶层相对路径（如 node_modules）
 * @returns {Promise<string[]>} 未能清理的陈旧条目描述列表，为空表示完全同步
 */
export async function mirrorAssets(sourceDir, targetDir, excludes = []) {
  const excludeSet = new Set(excludes)
  const excluded = makeExcluded(excludeSet)

  await mkdir(targetDir, { recursive: true })
  // cp 是合并覆盖语义：同名文件被覆盖，targetDir 中多余的文件保持不动。
  // filter 同时保证排除项既不写入也不被读取，避免覆盖目标端已被进程映射的原生模块。
  await cp(sourceDir, targetDir, {
    recursive: true,
    force: true,
    filter: (src) => {
      const rel = relative(sourceDir, src).split(sep).join('/')
      return rel === '' || !excluded(rel)
    },
  })

  const source = await collectTree(sourceDir, excludeSet)
  const sourcePaths = new Set([...source.files, ...source.dirs])
  const target = await collectTree(targetDir, excludeSet)

  const staleDirs = []
  const staleFiles = []
  for (const rel of target.files) {
    if (!sourcePaths.has(rel)) {
      staleFiles.push(rel)
    }
  }
  for (const rel of target.dirs) {
    if (!sourcePaths.has(rel)) {
      staleDirs.push(rel)
    }
  }
  // 目录按路径深度降序，保证先删子目录再删父目录
  staleDirs.sort((a, b) => b.split('/').length - a.split('/').length)

  const failed = []
  for (const rel of staleFiles) {
    try {
      await rm(join(targetDir, rel), { force: true })
    } catch (error) {
      failed.push(`${rel} (${error.code || error.message})`)
    }
  }
  for (const rel of staleDirs) {
    try {
      await rm(join(targetDir, rel), { recursive: true, force: true })
    } catch (error) {
      failed.push(`${rel} (${error.code || error.message})`)
    }
  }

  return failed
}
