import type { OfflineHandler } from './ops'

const handlers = new Map<string, OfflineHandler>()

export function registerHandler(handler: OfflineHandler): void {
  handlers.set(handler.kind, handler)
}
export function getHandler(kind: string): OfflineHandler | undefined {
  return handlers.get(kind)
}
export function getRegisteredKinds(): string[] {
  return [...handlers.keys()]
}
/** Test-only: reset the registry between tests. */
export function clearHandlers(): void {
  handlers.clear()
}
