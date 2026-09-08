/**
 * scripts/uninstall.js 的类型声明
 *
 * 该模块是纯 JS 脚本（package.json 声明 type: module，故 .js 即 ESM，对应 .d.ts）。
 * 未开启 allowJs，声明文件仅供 tests/ 下的 TypeScript 类型检查使用。
 */

/**
 * 执行卸载流程。
 *
 * @param targetDir 卸载目标目录
 * @param repoDirArg 源码仓库目录，null 表示按 targetDir 推断
 * @param confirmFn 授权确认回调，返回是否继续
 * @param keepRepo 是否保留仓库目录
 * @returns 退出码：0=彻底删除，2=插件已注销但有占用残留，1=入口删除失败卸载未生效
 */
export declare function uninstall(
  targetDir: string,
  repoDirArg: string | null,
  confirmFn: (message: string) => Promise<boolean>,
  keepRepo: boolean,
): Promise<number>
