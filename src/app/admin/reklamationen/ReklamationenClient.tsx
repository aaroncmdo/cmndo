'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { entscheideReklamation } from '@/lib/actions/storno-actions'

type Reklamation = {
  id: string; fall_id: string; gutachter_id: string; grund: string
  begruendung: string; eingereicht_am: string; status: string; frist_bis: string; admin_begruendung: string | null
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  eingereicht: { label: 'Eingereicht', color: 'bg-amber-50 text-amber-600' },
  pruefung: { label: 'In Prüfung', color: 'bg-blue-50 text-blue-600' },
  berechtigt: { label: 'Berechtigt', color: 'bg-green-50 text-green-600' },
  abgelehnt: { label: 'Abgelehnt', color: 'bg-red-50 text-red-600' },
  auto_abgelehnt_frist: { label: 'Frist abgelaufen', color: 'bg-gray-100 text-gray-500' },
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
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Reklamationen</h1>
        <p className="text-sm text-gray-500 mb-4">SV-Reklamationen prüfen und entscheiden</p>

        <div className="flex gap-1.5 mb-4">
          {['eingereicht', 'pruefung', 'berechtigt', 'abgelehnt', 'alle'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                filter === f ? 'bg-[#4573A2] text-white border-[#4573A2]' : 'border-gray-200 text-gray-500'
              }`}>{f === 'alle' ? 'Alle' : STATUS_BADGE[f]?.label ?? f}</button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.map(r => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.eingereicht
            return (
              <div key={r.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{svNameMap[r.gutachter_id] ?? '—'} — Fall {fallNrMap[r.fall_id] ?? r.fall_id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500">{GRUND_LABELS[r.grund] ?? r.grund} · {new Date(r.eingereicht_am).toLocaleDateString('de-DE')}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                </div>
                <p className="text-xs text-gray-700 mb-2">{r.begruendung}</p>
                <p className="text-[10px] text-gray-400">Frist bis: {new Date(r.frist_bis).toLocaleDateString('de-DE')}</p>

                {r.admin_begruendung && <p className="text-xs text-gray-600 mt-2 italic">Admin: {r.admin_begruendung}</p>}

                {['eingereicht', 'pruefung'].includes(r.status) && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    {actionId === r.id ? (
                      <div className="space-y-2">
                        <textarea value={adminGrund} onChange={e => setAdminGrund(e.target.value)}
                          placeholder="Admin-Begründung (bei Ablehnung Pflicht)"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-[#4573A2]" rows={2} />
                        <div className="flex gap-2">
                          <button onClick={() => handleEntscheidung(r.id, 'berechtigt')} disabled={loading}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-green-500 rounded-lg hover:bg-green-600 disabled:opacity-50">Berechtigt</button>
                          <button onClick={() => handleEntscheidung(r.id, 'abgelehnt')} disabled={loading || !adminGrund.trim()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50">Abgelehnt</button>
                          <button onClick={() => setActionId(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Abbrechen</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setActionId(r.id)} className="text-xs text-[#4573A2] hover:underline">Entscheidung treffen</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Keine Reklamationen.</p>}
        </div>
      </div>
    </div>
  )
}
