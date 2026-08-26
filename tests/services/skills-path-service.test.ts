import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { orderSkillPaths } from '../../src/services/skills-path-service.js'

describe('skills-path-service', () => {
  it('应该合并已有路径和动态技能目录并去重', () => {
    const dynamic = '/plugin/assets/skills'
    const existing = ['/user/skills', '/plugin/assets/skills']

    const paths = orderSkillPaths(existing, dynamic)

    expect(paths).toEqual(['/user/skills', '/plugin/assets/skills'])
  })

  it('应该在无已有路径时只返回动态技能目录', () => {
    const dynamic = '/plugin/assets/skills'

    const paths = orderSkillPaths([], dynamic)

    expect(paths).toEqual(['/plugin/assets/skills'])
  })

  it('应该对大小写和路径分隔符差异做去重', () => {
    const dynamic = '/plugin/assets/skills'
    const existing = ['/PLUGIN/ASSETS/SKILLS']

    const paths = orderSkillPaths(existing, dynamic)

    expect(paths).toHaveLength(1)
  })
})
