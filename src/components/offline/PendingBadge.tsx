'use client'

// AAR-388: Upload-Status-Badge für Dokument-Slots in der Fallakte
// (v. a. Feldmodus). Zeigt den Zustand eines Outbox-Items anhand seines
// Idempotency-Keys — solange nicht synced: „Wartet auf Verbindung" /
// „Lädt hoch…"; nach erfolgreichem Sync ist das Item aus der Outbox
// entfernt, Status='idle' → Badge rendert nichts.

import { CloudIcon, CloudOffIcon, Loader2Icon, AlertTriangleIcon } from 'lucide-react'
import { useSlotPending, type SlotPendingStatus } from '@/lib/offline/use-pending-count'

type Props = {
  idempotencyKey: string | null
  className?: string
}

const STYLES: Record<Exclude<SlotPendingStatus, 'idle'>, { label: string; className: string; Icon: typeof CloudIcon }> = {
  pending: {
    label: 'Wartet auf Verbindung',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    Icon: CloudOffIcon,
  },
  uploading: {
    label: 'Lädt hoch…',
    className: 'bg-[color:var(--brand-primary,#4573A2)]/10 text-[color:var(--brand-primary,#4573A2)] border-[color:var(--brand-primary,#4573A2)]/30',
    Icon: Loader2Icon,
  },
  failed: {
    label: 'Versuch fehlgeschlagen — wird wiederholt',
    className: 'bg-orange-50 text-orange-700 border-orange-200',
    Icon: AlertTriangleIcon,
  },
  dead: {
    label: 'Dauerhaft fehlgeschlagen',
    className: 'bg-red-50 text-red-700 border-red-200',
    Icon: AlertTriangleIcon,
  },
}

export default function PendingBadge({ idempotencyKey, className = '' }: Props) {
  const status = useSlotPending(idempotencyKey)
  if (status === 'idle') return null

  const { label, className: variantCls, Icon } = STYLES[status]
  const iconCls = status === 'uploading' ? 'w-3 h-3 animate-spin' : 'w-3 h-3'

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${variantCls} ${className}`}
    >
      <Icon className={iconCls} />
      {label}
    </span>
  )
}
