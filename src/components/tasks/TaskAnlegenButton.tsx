'use client'

// AAR-307: Rollen-gated Button für das Task-Anlegen-Modal.
// Rendert nur wenn der aktuelle Nutzer eine erlaubte Rolle hat (KB/SV/Admin).
// Die Rolle wird als Prop durchgereicht — der Server-Side-Check bleibt
// zusätzlich als Safety-Net im createAdHocTask.

import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { TaskAnlegenModal } from './TaskAnlegenModal'

const ALLOWED_ROLLEN = new Set(['kundenbetreuer', 'sachverstaendiger', 'admin'])

export function TaskAnlegenButton({
  fallId,
  rolle,
  variant = 'primary',
  label = 'Task anlegen',
}: {
  fallId: string
  rolle: string | null | undefined
  variant?: 'primary' | 'ghost'
  label?: string
}) {
  const [open, setOpen] = useState(false)
  if (!rolle || !ALLOWED_ROLLEN.has(rolle)) return null

  const className =
    variant === 'primary'
      ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-xs font-medium text-gray-800 hover:bg-gray-50'
      : 'inline-flex items-center gap-1 text-xs font-medium text-[#4573A2] hover:text-[#0D1B3E]'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <PlusIcon className="w-3.5 h-3.5" />
        {label}
      </button>
      <TaskAnlegenModal open={open} onClose={() => setOpen(false)} fallId={fallId} />
    </>
  )
}
