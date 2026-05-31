'use client'

// AAR-939 — Dispatcher-Karte: ungeklaerte embed-B/nur_gutachter-Termine aufloesen.
// Listet die offenen embed_b_termin_klaerung-Tasks (vom Kunde-NEIN bzw. dem
// Resolution-Cron) und bietet pro Termin zwei Ausgaenge:
//   • „Doch durchgeführt" → bestaetigeDurchgefuehrtVomTeam (Claim terminal)
//   • „SV kam nicht"       → bestaetigeSvNoShowVomTeam (Records-Signal, €70 bleibt)
// KEINE Verlegung (separater Flow). Nach der Aktion router.refresh() → Eintrag weg.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClockIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import {
  bestaetigeSvNoShowVomTeam,
  bestaetigeDurchgefuehrtVomTeam,
} from '@/lib/termine/embed-b-dispatcher-actions'

export type KlaerungItem = {
  taskId: string
  terminId: string
  titel: string
  startZeit: string | null
}

export default function EmbedBKlaerungCard({ items }: { items: KlaerungItem[] }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)

  async function handle(terminId: string, action: 'noshow' | 'done') {
    setPending(`${terminId}:${action}`)
    const res =
      action === 'noshow'
        ? await bestaetigeSvNoShowVomTeam(terminId)
        : await bestaetigeDurchgefuehrtVomTeam(terminId)
    setPending(null)
    if (!res.ok) {
      toast.error(res.error ?? 'Es ist ein Fehler aufgetreten.')
      return
    }
    toast.success(action === 'noshow' ? 'SV-No-Show vermerkt' : 'Als durchgeführt vermerkt')
    router.refresh()
  }

  return (
    <div className="bg-white rounded-3xl shadow-claimondo-md border border-claimondo-navy/[0.06]">
      <div className="px-5 py-4 border-b border-claimondo-navy/[0.06]">
        <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
          <CalendarClockIcon className="w-4 h-4 text-amber-600" />
          Ungeklärte Gutachter-Termine
          <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </h2>
      </div>
      <ul className="divide-y divide-claimondo-navy/[0.06] max-h-[400px] overflow-y-auto">
        {items.map((it) => {
          const datum = it.startZeit
            ? new Date(it.startZeit).toLocaleString('de-DE', {
                weekday: 'short',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : '—'
          return (
            <li key={it.taskId} className="px-5 py-3 space-y-2">
              <div>
                <p className="text-sm text-claimondo-navy">{it.titel}</p>
                <p className="text-xs text-claimondo-ondo/70">Termin: {datum}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="success"
                  size="sm"
                  onClick={() => handle(it.terminId, 'done')}
                  loading={pending === `${it.terminId}:done`}
                  disabled={pending !== null}
                >
                  Doch durchgeführt
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handle(it.terminId, 'noshow')}
                  loading={pending === `${it.terminId}:noshow`}
                  disabled={pending !== null}
                >
                  SV kam nicht
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
