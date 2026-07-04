// src/lib/status/slots.ts
// THE single status-color source. 7 token slots -> Tailwind classes.
// Semantic slots use status tokens (bg-success-soft etc.) that rebrand via
// var(--brand-*). Neutral/active/done use Claimondo tokens. pending shares warning.
import type { StatusSlot } from './types'

export const STATUS_SLOT_CLASSES: Record<StatusSlot, string> = {
  neutral: 'bg-claimondo-bg text-claimondo-ondo',
  active:  'bg-claimondo-ondo/10 text-claimondo-ondo',
  pending: 'bg-warning-soft text-warning-strong',
  done:    'bg-claimondo-bg text-claimondo-navy',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger:  'bg-danger-soft text-danger-strong',
}

export function statusSlotClass(slot: StatusSlot | undefined): string {
  return STATUS_SLOT_CLASSES[slot ?? 'neutral']
}
