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
  for (const sub of _subscriptions) {
    if (sub.filter && !sub.filter(event)) continue
    try {
      sub.handler(event)
    } catch {
      // 鍗曚釜璁㈤槄鑰呭紓甯镐笉褰卞搷鍏朵粬璁㈤槄鑰?    }
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
