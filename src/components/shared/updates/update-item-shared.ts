import { BellIcon, ActivityIcon, MessageCircleIcon, PhoneIcon, ClipboardListIcon } from 'lucide-react'
import type { TypFilter } from '@/lib/updates/split'
import type { UpdateItem } from '@/lib/updates/types'

// #updates-rebuild: geteilte Item-Bausteine fuer Popover (UpdatesNav) UND die
// /updates-Vollseite (Phase 5 Teil D) — kein Dup.

export const TYP_CHIPS: { key: TypFilter; label: string; icon: typeof BellIcon }[] = [
  { key: 'alle', label: 'Alle', icon: BellIcon },
  { key: 'event', label: 'Aktivität', icon: ActivityIcon },
  { key: 'message', label: 'Nachrichten', icon: MessageCircleIcon },
  { key: 'call', label: 'Anrufe', icon: PhoneIcon },
  { key: 'task', label: 'Aufgaben', icon: ClipboardListIcon },
]

export function fmtRelative(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1) return 'jetzt'
  if (diffMin < 60) return `vor ${diffMin} Min`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `vor ${h} Std`
  const days = Math.floor(h / 24)
  if (days < 7) return `vor ${days} Tg`
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}

export function typIcon(typ: UpdateItem['typ']): string {
  return typ === 'task' ? '✅' : typ === 'message' ? '💬' : typ === 'call' ? '📞' : '🔔'
}
