type LifecycleCatalogStageId = 'ideate' | 'prd' | 'plan' | 'refactor-plan' | 'work' | 'outcome-review'

const LIFECYCLE_CATALOG_DESCRIPTIONS: Record<LifecycleCatalogStageId, string> = {
  ideate: '构思阶段：生成候选方向并比较价值、成本、风险和落地条件',
  prd: '探索阶段：澄清目标、边界、约束、成功标准和待定问题，并产出需求文档',
  plan: '渐进计划阶段：把目标拆成步骤、依赖、验证方式和产物结构',
  'refactor-plan': '重构计划阶段：为已有方案、结构、流程或产物制定彻底替换和清债计划',
  work: '实施阶段：执行计划或直接任务，产出代码、文档、测试用例、设计、报告或其他交付物',
  'outcome-review': '审查阶段：检查任意产物或变更的质量、一致性、风险、遗漏和可验证性',
}

/** 返回面向帮助目录的阶段描述，避免 catalog 与生命周期文案各自维护阶段摘要。 */
export function getLifecycleCatalogDescription(stageId: LifecycleCatalogStageId): string {
  return LIFECYCLE_CATALOG_DESCRIPTIONS[stageId]
}
