type LifecycleCatalogStageId = 'prd' | 'design' | 'work' | 'outcome-review'

const LIFECYCLE_CATALOG_DESCRIPTIONS: Record<LifecycleCatalogStageId, string> = {
  prd: '探索阶段：澄清目标、边界、约束、成功标准和待定问题，并产出需求文档',
  design: '设计阶段：澄清设计决策并产出设计文档，含概览、架构、接口、数据模型、测试用例与验收标准，供实施和审查对齐。支持 dimensions 参数指定部分维度，支持 refactor=true 彻底重构',
  work: '实施阶段：执行设计或直接任务，产出代码、文档、测试用例、设计、报告或其他交付物',
  'outcome-review': '审查阶段：检查任意产物或变更的质量、一致性、风险、遗漏和可验证性',
}

/** 返回面向帮助目录的阶段描述，避免 catalog 与生命周期文案各自维护阶段摘要。 */
export function getLifecycleCatalogDescription(stageId: LifecycleCatalogStageId): string {
  return LIFECYCLE_CATALOG_DESCRIPTIONS[stageId]
}
