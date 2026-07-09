import { describe, expect, it, beforeEach, vi } from 'vitest'

import {
  mimeToModality,
  getCapabilities,
  cacheSessionModel,
  getCapabilitiesBySession,
  resetCapabilityCacheForTesting,
} from '../../src/services/model-capability-cache.js'

import { setGlobalClient } from '../../src/services/client-holder.js'

const NONE_SUPPORTED = { image: false, audio: false, video: false, pdf: false }

function makeMockClient(providers: Array<{
  id: string
  models: Record<string, { modalities?: { input: string[] } }>
}>): unknown {
  return {
    provider: {
      list: vi.fn(async () => ({
        data: { all: providers, default: {}, connected: [] },
      })),
    },
  }
}

describe('mimeToModality', () => {
  it('image/* 返回 image', () => {
    expect(mimeToModality('image/png')).toBe('image')
    expect(mimeToModality('image/jpeg')).toBe('image')
    expect(mimeToModality('IMAGE/SVG+XML')).toBe('image')
  })

  it('audio/* 返回 audio', () => {
    expect(mimeToModality('audio/wav')).toBe('audio')
    expect(mimeToModality('audio/mpeg')).toBe('audio')
  })

  it('video/* 返回 video', () => {
    expect(mimeToModality('video/mp4')).toBe('video')
  })

  it('application/pdf 返回 pdf', () => {
    expect(mimeToModality('application/pdf')).toBe('pdf')
    expect(mimeToModality('APPLICATION/PDF')).toBe('pdf')
  })

  it('非媒体 MIME 返回 undefined', () => {
    expect(mimeToModality('application/zip')).toBeUndefined()
    expect(mimeToModality('text/plain')).toBeUndefined()
    expect(mimeToModality('application/json')).toBeUndefined()
    expect(mimeToModality('')).toBeUndefined()
  })
})

describe('getCapabilities', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('未知模型返回 FULL_CAPABILITY（保守策略）', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const caps = await getCapabilities('unknown/model')
    expect(caps).toEqual({ image: true, audio: true, video: true, pdf: true })
  })

  it('已缓存模型返回实际能力', async () => {
    setGlobalClient(makeMockClient([
      {
        id: 'provider1',
        models: {
          'model1': { modalities: { input: ['text', 'image'] } },
          'model2': { modalities: { input: ['text'] } },
        },
      },
    ]) as never)

    const caps1 = await getCapabilities('provider1/model1')
    expect(caps1).toEqual({ image: true, audio: false, video: false, pdf: false })

    const caps2 = await getCapabilities('provider1/model2')
    expect(caps2).toEqual({ image: false, audio: false, video: false, pdf: false })
  })

  it('provider.list 失败时返回 FULL_CAPABILITY', async () => {
    setGlobalClient({
      provider: { list: vi.fn(async () => { throw new Error('network') }) },
    } as never)

    const caps = await getCapabilities('any/model')
    expect(caps).toEqual({ image: true, audio: true, video: true, pdf: true })
  })

  it('client 未设置时返回 FULL_CAPABILITY', async () => {
    setGlobalClient(undefined as never)
    const caps = await getCapabilities('any/model')
    expect(caps).toEqual({ image: true, audio: true, video: true, pdf: true })
  })

  it('modalities.input 缺失时返回全 false', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p', models: { 'm': {} } },
    ]) as never)

    const caps = await getCapabilities('p/m')
    expect(caps).toEqual(NONE_SUPPORTED)
  })
})

describe('cacheSessionModel + getCapabilitiesBySession', () => {
  beforeEach(() => {
    resetCapabilityCacheForTesting()
  })

  it('sessionID 未缓存时返回 FULL_CAPABILITY', async () => {
    setGlobalClient(makeMockClient([]) as never)
    const caps = await getCapabilitiesBySession('unknown-session')
    expect(caps).toEqual({ image: true, audio: true, video: true, pdf: true })
  })

  it('缓存 sessionID 后查询到对应模型能力', async () => {
    setGlobalClient(makeMockClient([
      { id: 'p1', models: { 'm1': { modalities: { input: ['text', 'image', 'pdf'] } } } },
    ]) as never)

    cacheSessionModel('session-1', 'p1', 'm1')
    const caps = await getCapabilitiesBySession('session-1')
    expect(caps).toEqual({ image: true, audio: false, video: false, pdf: true })
  })

  it('LRU 淘汰：超过上限时删除最旧条目', async () => {
    setGlobalClient(makeMockClient([]) as never)

    for (let i = 0; i < 1001; i++) {
      cacheSessionModel(`session-${i}`, 'p', `m${i}`)
    }

    const caps0 = await getCapabilitiesBySession('session-0')
    expect(caps0).toEqual({ image: true, audio: true, video: true, pdf: true })

    const caps1000 = await getCapabilitiesBySession('session-1000')
    expect(caps1000).toEqual({ image: true, audio: true, video: true, pdf: true })
  })
})
