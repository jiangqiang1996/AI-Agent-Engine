/**
 * 容错删除目录树
 *
 * 直接用 rm(dir, { recursive: true }) 在 Windows 下遇到被进程映射的原生模块
 * （如 node_modules 内 @napi-rs/canvas 的 skia.win32-x64-msvc.node）会整体抛错，
 * 导致目录处于半删状态、流程中断。
 *
 * 改为逐项删除：先删文件，再删目录（按深度降序，保证先删子目录再删父目录），
 * 单个条目失败只记录不中断，把无法清理的项如实返回给调用方决定退出码与提示。
 *
 * 目录删除保留 recursive：Node 对目录不带 recursive 会直接抛 ERR_FS_EISDIR。
 * 因为文件与子目录已在前面的步骤逐项处理过，走到目录这一步时目录通常已空；
 * 若目录内仍残留删不掉的锁文件，Windows 下递归 rmdir 同样会失败并被如实记录，
 * 不会被静默吞掉。
 */

import { readdir, rm } from 'node:fs/promises'
import { join, sep } from 'node:path'

/**
 * 删除目录树，单条目失败不中断。
 *
 * @param {string} targetPath 要删除的目录，必须已存在
 * @returns {Promise<string[]>} 未能删除的条目描述列表，为空表示已彻底删除
 */
export async function removeTreeTolerant(targetPath) {
  const files = []
  const dirs = []

  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name)
      if (entry.isDirectory()) {
        dirs.push(abs)
        await walk(abs)
      } else {
        files.push(abs)
      }
    }
  }

  await walk(targetPath)
  dirs.sort((a, b) => b.split(sep).length - a.split(sep).length)

  const failed = []
  const tryRemove = async (path, options) => {
    try {
      await rm(path, options)
    } catch (error) {
      failed.push(`${path} (${error.code || error.message})`)
    }
  }

  for (const file of files) {
    await tryRemove(file, { force: true })
  }
  for (const dir of dirs) {
    await tryRemove(dir, { recursive: true, force: true })
  }
  await tryRemove(targetPath, { recursive: true, force: true })

  return failed
}
