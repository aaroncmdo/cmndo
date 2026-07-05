// src/lib/status/icons.tsx
// The ONLY lucide importer in lib/status — keeps the data modules server-safe.
import type { LucideIcon } from 'lucide-react'
import {
  PlayCircleIcon, UserCheckIcon, PhoneCallIcon, CheckCircleIcon,
  XCircleIcon, ScaleIcon, ClockIcon, PauseCircleIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  'play-circle': PlayCircleIcon,
  'user-check': UserCheckIcon,
  'phone-call': PhoneCallIcon,
  'check-circle': CheckCircleIcon,
  'x-circle': XCircleIcon,
  scale: ScaleIcon,
  clock: ClockIcon,
  'pause-circle': PauseCircleIcon,
}

export function statusIcon(iconKey?: string): LucideIcon | null {
  return iconKey ? (ICONS[iconKey] ?? null) : null
}
