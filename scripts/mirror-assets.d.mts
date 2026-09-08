/**
 * scripts/mirror-assets.mjs 的类型声明
 *
 * 该模块是纯 JS 构建脚本，未开启 allowJs，声明文件仅供 tests/ 下的 TypeScript 类型检查使用。
 */

/**
 * 把 sourceDir 的内容镜像同步到 targetDir。
 *
 * @param sourceDir 源资产目录
 * @param targetDir 目标资产目录，允许尚不存在
 * @param excludes 目标端保留、既不复制也不剪枝的顶层相对路径（如 node_modules）
 * @returns 未能清理的陈旧条目描述列表，为空表示完全同步
 */
export declare function mirrorAssets(sourceDir: string, targetDir: string, excludes?: Iterable<string>): Promise<string[]>
