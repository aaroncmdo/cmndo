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
    if (action === 'noshow') {
      // 6b: bestaetigeSvNoShowVomTeam leitet die Self-Service-Verlegung ein.
      const r = res as { manuell?: boolean }
      toast.success(
        r.manuell
          ? 'SV-No-Show vermerkt — kein Ersatz-Gutachter automatisch gefunden, bitte manuell vermitteln.'
          : 'SV-No-Show vermerkt — Ersatz-Gutachter zugewiesen, Re-Termin-Link an den Kunden gesendet.',
      )
    } else {
      toast.success('Als durchgeführt vermerkt')
    }
    router.refresh()
  }

  return (
    <div className="bg-white rounded-3xl shadow-claimondo-md border border-claimondo-navy/[0.06]">
      <div className="px-5 py-4 border-b border-claimondo-navy/[0.06]">
        <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
          <CalendarClockIcon className="w-4 h-4 text-warning" />
          Ungeklärte Gutachter-Termine
          <span className="ml-auto bg-warning-soft text-warning-strong text-[10px] font-bold px-2 py-0.5 rounded-full">
            {items.length}
          </span>
        </h2>
      </div>
      <ul className="divide-y divide-claimondo-navy/[0.06] max-h-[400px] overflow-y-auto">
        {items.map((it) => {
          // ⚠ `timeZone` ist PFLICHT, nicht Kosmetik: Diese Karte ist eine Client-Component,
          // wird also server-seitig vorgerendert UND im Browser hydriert. Ohne feste Zone
          // nimmt jede Seite ihre eigene — der Node-Prozess auf prod laeuft mit
          // `TZ=Europe/Berlin` (pm2 id 862), ein Browser in UTC rendert zwei Stunden
          // frueher. Genau das war der React-#418-Hydration-Fehler, der den nightly seit
          // dem 06.08. rot faerbte: Server „Mi., 05.08., 10:00" gegen Client
          // „Mi., 05.08., 08:00" (Trace des Laufs 32807670143, DOM-Snapshot-Diff).
          //
          // ⭐ Warum es lange unentdeckt blieb: ein Entwickler-Browser in Europe/Berlin
          // rendert dasselbe wie der Server — lokal ist der Fehler UNSICHTBAR. Reproduzieren
          // laesst er sich mit `test.use({ timezoneId: 'UTC' })`.
          // Vorbild derselben Seite: dispatch/dashboard/page.tsx:195-196.
          const datum = it.startZeit
            ? new Date(it.startZeit).toLocaleString('de-DE', {
                timeZone: 'Europe/Berlin',
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
