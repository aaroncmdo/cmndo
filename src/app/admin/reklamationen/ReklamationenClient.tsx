'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { entscheideReklamation } from '@/lib/actions/storno-actions'
import { StatusBadge, type StatusBadgeTone } from '@/components/shared/StatusBadge'

type Reklamation = {
  id: string; fall_id: string; sv_id: string; grund: string
  begruendung: string; eingereicht_am: string; status: string; frist_bis: string; admin_begruendung: string | null
}

const STATUS_BADGE: Record<string, { label: string; tone: StatusBadgeTone }> = {
  eingereicht: { label: 'Eingereicht', tone: 'warning' },
  pruefung: { label: 'In Prüfung', tone: 'info' },
  berechtigt: { label: 'Berechtigt', tone: 'success' },
  abgelehnt: { label: 'Abgelehnt', tone: 'danger' },
  auto_abgelehnt_frist: { label: 'Frist abgelaufen', tone: 'neutral' },
}

const GRUND_LABELS: Record<string, string> = {
  kein_haftpflichtschaden: 'Kein Haftpflichtschaden',
  bagatelle_unter_750: 'Bagatelle unter 750 EUR',
  unvollstaendige_kundendaten: 'Unvollständige Kundendaten',
  sonstiges: 'Sonstiges',
}

export default function ReklamationenClient({ reklamationen, svNameMap, fallNrMap }: {
  reklamationen: Reklamation[]; svNameMap: Record<string, string>; fallNrMap: Record<string, string>
}) {
  const router = useRouter()
  const [filter, setFilter] = useState('eingereicht')
  const [actionId, setActionId] = useState<string | null>(null)
  const [adminGrund, setAdminGrund] = useState('')
  const [loading, setLoading] = useState(false)

  const filtered = filter === 'alle' ? reklamationen : reklamationen.filter(r => r.status === filter)

  async function handleEntscheidung(id: string, entscheidung: 'berechtigt' | 'abgelehnt') {
    if (entscheidung === 'abgelehnt' && !adminGrund.trim()) return
    setLoading(true)
    await entscheideReklamation(id, entscheidung, adminGrund || 'Ohne Begründung')
    setActionId(null)
    setAdminGrund('')
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="h-full overflow-y-auto py-6">
      <div>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-heading-lg font-bold text-claimondo-navy">Reklamationen</h1>
            <p className="mt-0.5 text-body-sm text-claimondo-ondo">SV-Reklamationen prüfen und entscheiden</p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-4">
          {['eingereicht', 'pruefung', 'berechtigt', 'abgelehnt', 'alle'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-body-xs font-medium leading-tight text-center rounded-full border transition-colors ${
                filter === f ? 'bg-claimondo-ondo text-white border-claimondo-ondo' : 'border-claimondo-border text-claimondo-ondo'
              }`}>{f === 'alle' ? 'Alle' : STATUS_BADGE[f]?.label ?? f}</button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(r => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.eingereicht
            return (
              <div key={r.id} className="bg-white rounded-ios-lg shadow-ios-md p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-body-sm font-medium text-claimondo-navy">{svNameMap[r.sv_id] ?? '—'} — Fall {fallNrMap[r.fall_id] ?? r.fall_id.slice(0, 8)}</p>
                    <p className="text-body-xs text-claimondo-ondo">{GRUND_LABELS[r.grund] ?? r.grund} · {new Date(r.eingereicht_am).toLocaleDateString('de-DE')}</p>
                  </div>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </div>
                <p className="text-body-xs text-claimondo-navy mb-2">{r.begruendung}</p>
                <p className="text-caption text-claimondo-ondo/70">Frist bis: {new Date(r.frist_bis).toLocaleDateString('de-DE')}</p>

                {r.admin_begruendung && <p className="text-body-xs text-claimondo-ondo mt-2 italic">Admin: {r.admin_begruendung}</p>}

                {['eingereicht', 'pruefung'].includes(r.status) && (
                  <div className="mt-3 pt-3 border-t border-claimondo-border">
                    {actionId === r.id ? (
                      <div className="space-y-2">
                        <textarea value={adminGrund} onChange={e => setAdminGrund(e.target.value)}
                          placeholder="Admin-Begründung (bei Ablehnung Pflicht)"
                          className="w-full border border-claimondo-border rounded-ios-lg px-3 py-2 text-body-xs resize-none focus:outline-none focus:border-claimondo-ondo" rows={2} />
                        <div className="flex gap-2">
                          <button onClick={() => handleEntscheidung(r.id, 'berechtigt')} disabled={loading}
                            className="px-3 py-1.5 text-body-xs font-medium text-white bg-success rounded-ios-lg hover:bg-success-strong disabled:opacity-50">Berechtigt</button>
                          <button onClick={() => handleEntscheidung(r.id, 'abgelehnt')} disabled={loading || !adminGrund.trim()}
                            className="px-3 py-1.5 text-body-xs font-medium text-white bg-danger rounded-ios-lg hover:bg-danger-strong disabled:opacity-50">Abgelehnt</button>
                          <button onClick={() => setActionId(null)} className="px-3 py-1.5 text-body-xs text-claimondo-ondo hover:text-claimondo-navy">Abbrechen</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setActionId(r.id)} className="text-body-xs text-claimondo-ondo hover:underline">Entscheidung treffen</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-center text-claimondo-ondo/70 text-body-sm py-8">Keine Reklamationen.</p>}
        </div>
      </div>
    </div>
  )
}
