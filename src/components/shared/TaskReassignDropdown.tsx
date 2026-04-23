'use client'

// AAR-723: Admin-Reassign-Dropdown für Tasks. Zeigt alle aktiven
// Mitarbeiter-Profile (alle Rollen außer Kunde), Admin kann den Task per
// Select weiterleiten. Server-Action setzt zugewiesen_an + empfaenger_*
// atomar um und schreibt Timeline-Eintrag.

import { useState, useTransition } from 'react'
import { reassignTask } from '@/app/admin/tasks/actions'

export type ReassignCandidate = {
  id: string
  name: string
  rolle: string
}

export default function TaskReassignDropdown({
  taskId,
  currentAssigneeId,
  candidates,
  compact = false,
}: {
  taskId: string
  currentAssigneeId: string | null
  candidates: ReassignCandidate[]
  compact?: boolean
}) {
  const [value, setValue] = useState<string>(currentAssigneeId ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onChange(next: string) {
    if (!next || next === currentAssigneeId) return
    setValue(next)
    startTransition(async () => {
      const res = await reassignTask(taskId, next)
      if (res.success) setMsg('Weitergeleitet')
      else setMsg(res.error ?? 'Fehler')
      setTimeout(() => setMsg(null), 2500)
    })
  }

  const sortedCandidates = [...candidates].sort((a, b) =>
    a.rolle === b.rolle ? a.name.localeCompare(b.name) : a.rolle.localeCompare(b.rolle),
  )

  return (
    <div className={`flex items-center gap-1.5 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      <label className="text-claimondo-ondo shrink-0">Weiterleiten an:</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={pending}
        className={`flex-1 min-w-0 border border-claimondo-border rounded px-1.5 py-0.5 ${compact ? 'text-[11px]' : 'text-xs'} focus:outline-none focus:border-claimondo-ondo`}
      >
        <option value="">— Kollege wählen —</option>
        {sortedCandidates.map(c => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.rolle})
          </option>
        ))}
      </select>
      {msg && <span className="text-[10px] text-claimondo-ondo">{msg}</span>}
    </div>
  )
}
