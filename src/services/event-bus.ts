type EventHandler = (event: SessionEventData) => void

export interface SessionEventData {
  type: string
  sessionID: string
  properties: Record<string, unknown>
  raw: unknown
}

type SessionFilter = (event: SessionEventData) => boolean

interface Subscription {
  id: number
  handler: EventHandler
  filter?: SessionFilter
}

let _subscriptions: Subscription[] = []
let _nextId = 1

export function subscribeSessionEvents(handler: EventHandler, filter?: SessionFilter): () => void {
  const id = _nextId++
  _subscriptions.push({ id, handler, filter })
  return () => {
    _subscriptions = _subscriptions.filter((s) => s.id !== id)
  }
}

export function dispatchSessionEvent(event: SessionEventData): void {
  const subs = [..._subscriptions]
  for (const sub of subs) {
    if (sub.filter && !sub.filter(event)) continue
    try {
      sub.handler(event)
    } catch {
      // 单个订阅者异常不影响其他订阅者
    }
  }
}

export function extractSessionID(event: { type: string; properties: Record<string, unknown> }): string | undefined {
  const props = event.properties
  if (typeof props.sessionID === 'string') return props.sessionID
  if (typeof props.info === 'object' && props.info !== null) {
    const info = props.info as Record<string, unknown>
    if (typeof info.sessionID === 'string') return info.sessionID
  }
  if (typeof props.part === 'object' && props.part !== null) {
    const part = props.part as Record<string, unknown>
    if (typeof part.sessionID === 'string') return part.sessionID
  }
  return undefined
}

/** 重置事件总线状态，仅供测试调用 */
export function resetEventBus(): void {
  _subscriptions = []
  _nextId = 1
}
