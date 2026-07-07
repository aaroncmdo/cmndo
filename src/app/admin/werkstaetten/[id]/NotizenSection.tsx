'use client'

// Interne Notizen / Kommunikations-Log auf der Werkstatt-Detailseite (P3a).
// Nur Staff (die Detailseite ist admin-gegated; die Actions pruefen zusaetzlich).

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { fuegeWerkstattNotizHinzu, loescheWerkstattNotiz } from './actions'
import type { WerkstattNotiz } from './detail-data'

const TEXTAREA_CLS =
  'w-full px-3 py-2 rounded-ios-md border border-claimondo-border bg-white text-body-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/20 resize-y'

export function NotizenSection({ werkstattId, notizen }: { werkstattId: string; notizen: WerkstattNotiz[] }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function add() {
    const t = text.trim()
    if (!t) return
    setBusy(true)
    try {
      const res = await fuegeWerkstattNotizHinzu(werkstattId, t)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      setText('')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  async function loeschen(id: string) {
    const res = await loescheWerkstattNotiz(werkstattId, id)
    if (!res.ok) {
      toast.error(res.error ?? 'Fehler')
      return
    }
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Interne Notiz (nur für das Team sichtbar)…"
          className={TEXTAREA_CLS}
        />
        <div className="flex justify-end">
          <Button variant="navy" size="sm" loading={busy} disabled={!text.trim()} onClick={add}>
            Notiz hinzufügen
          </Button>
        </div>
      </div>

      {notizen.length === 0 ? (
        <p className="text-body-sm text-claimondo-ondo">Noch keine Notizen.</p>
      ) : (
        <ul className="space-y-2">
          {notizen.map((n) => (
            <li
              key={n.id}
              className="flex items-start justify-between gap-2 rounded-ios-md bg-claimondo-bg px-3 py-2"
            >
              <div>
                <p className="text-body-sm text-claimondo-navy whitespace-pre-wrap">{n.text}</p>
                <p className="text-body-xs text-claimondo-ondo mt-0.5">
                  {n.autor_name ?? 'Team'} · {new Date(n.created_at).toLocaleString('de-DE')}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => loeschen(n.id)}>
                <Trash2Icon className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
