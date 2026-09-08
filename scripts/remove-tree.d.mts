/**
 * scripts/remove-tree.mjs 的类型声明
 *
 * 该模块是纯 JS 脚本，未开启 allowJs，声明文件仅供 tests/ 下的 TypeScript 类型检查使用。
 */

/**
 * 删除目录树，单条目失败不中断。
 *
 * @param targetPath 要删除的目录，必须已存在
 * @returns 未能删除的条目描述列表，为空表示已彻底删除
 */
export declare function removeTreeTolerant(targetPath: string): Promise<string[]>
