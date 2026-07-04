// src/lib/status/index.ts
// Public entry point. Consumers import from '@/lib/status'.
// (Legacy-constant re-export shims are added in the cleanup wave.)
export type { StatusSlot, ViewerRole, DomainName, StatusDef } from './types'
export { STATUS_SLOT_CLASSES, statusSlotClass } from './slots'
export { resolveStatus, statusLabel, statusBadgeView } from './resolve'
export { statusIcon } from './icons'
