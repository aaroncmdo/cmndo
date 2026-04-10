'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarIcon, CheckIcon, XIcon, RefreshCwIcon, ClockIcon, AlertTriangleIcon } from 'lucide-react'
import { terminAnnehmen, terminAblehnen, terminGegenvorschlag } from '@/lib/actions/termin-actions'

// KFZ-134: Gutachter Termine-Liste mit Akzeptieren/Ablehnen/Gegenvorschlag.

type TerminRow = {
  id: string
  fall_id: string
  fall_nummer: string
  kunde_name: string
  start_zeit: string
  end_zeit: string
  status: string
  vorgeschlagenes_datum: string | null
  gegenvorschlag_von: string | null
  gegenvorschlag_grund: string | null
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  reserviert: { label: 'Reserviert', cls: 'bg-blue-50 text-blue-700' },
  vorschlag: { label: 'Vorschlag', cls: 'bg-amber-50 text-amber-700' },
  gegenvorschlag: { label: 'Gegenvorschlag', cls: 'bg-orange-50 text-orange-700' },
  bestaetigt: { label: 'Bestätigt', cls: 'bg-emerald-50 text-emerald-700' },
  abgelehnt: { label: 'Abgelehnt', cls: 'bg-red-50 text-red-700' },
  storniert: { label: 'Storniert', cls: 'bg-gray-100 text-gray-500' },
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function formatZeit(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

export default function TermineClient({ termine }: { termine: TerminRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [modal, setModal] = useState<{ type: 'ablehnen' | 'gegenvorschlag'; termin: TerminRow } | null>(null)
  const [grund, setGrund] = useState('')
  const [neuesDatum, setNeuesDatum] = useState('')
  const [filter, setFilter] = useState<'offen' | 'alle'>('offen')

  const offene = termine.filter(t => ['reserviert', 'vorschlag', 'gegenvorschlag'].includes(t.status))
  const filtered = filter === 'offen' ? offene : termine

  function handleAnnehmen(t: TerminRow) {
    startTransition(async () => {
      await terminAnnehmen({ source: 'sv_portal', fallId: t.fall_id })
      router.refresh()
    })
  }

  function handleAblehnen() {
    if (!modal || modal.type !== 'ablehnen') return
    startTransition(async () => {
      await terminAblehnen({ source: 'sv_portal', fallId: modal.termin.fall_id, grund })
      setModal(null); setGrund(''); router.refresh()
    })
  }

  function handleGegenvorschlag() {
    if (!modal || modal.type !== 'gegenvorschlag' || !neuesDatum) return
    startTransition(async () => {
      await terminGegenvorschlag({ source: 'sv_portal', fallId: modal.termin.fall_id, neuesDatum, grund })
      setModal(null); setGrund(''); setNeuesDatum(''); router.refresh()
    })
  }

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-[#4573A2]" /> Meine Termine
          </h1>
          <p className="text-sm text-gray-500 mt-1">{offene.length} offen, {termine.length} gesamt</p>
        </div>
        <div className="inline-flex bg-gray-100 rounded-xl p-0.5 text-xs font-medium">
          <button onClick={() => setFilter('offen')} className={`px-3 py-1.5 rounded-lg ${filter === 'offen' ? 'bg-white text-[#1E3A5F] shadow' : 'text-gray-500'}`}>
            Offen ({offene.length})
          </button>
          <button onClick={() => setFilter('alle')} className={`px-3 py-1.5 rounded-lg ${filter === 'alle' ? 'bg-white text-[#1E3A5F] shadow' : 'text-gray-500'}`}>
            Alle ({termine.length})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <CalendarIcon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Keine Termine in dieser Ansicht.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => {
            const badge = STATUS_BADGE[t.status] ?? { label: t.status, cls: 'bg-gray-100 text-gray-600' }
            const isKundenGegenvorschlag = t.status === 'gegenvorschlag' && t.gegenvorschlag_von === 'kunde'
            const needsAction = ['reserviert', 'vorschlag'].includes(t.status) || isKundenGegenvorschlag
            const displayDatum = t.vorgeschlagenes_datum && t.status === 'gegenvorschlag' ? t.vorgeschlagenes_datum : t.start_zeit
            return (
              <div key={t.id} className={`bg-white rounded-2xl border p-5 ${needsAction ? 'border-[#4573A2] ring-1 ring-[#4573A2]/20' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-semibold text-gray-900">
                        {formatDatum(displayDatum)} · {formatZeit(displayDatum)}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                      {needsAction && <span className="text-[9px] bg-[#4573A2] text-white px-1.5 py-0.5 rounded-full font-medium">Aktion nötig</span>}
                    </div>
                    <p className="text-sm text-gray-700">{t.kunde_name}</p>
                    {t.gegenvorschlag_grund && (
                      <p className="text-xs text-amber-600 mt-1">Grund: {t.gegenvorschlag_grund}</p>
                    )}
                  </div>
                  <Link href={`/gutachter/fall/${t.fall_id}`} className="text-xs text-[#4573A2] hover:underline">
                    {t.fall_nummer}
                  </Link>
                </div>

                {needsAction && (
                  <div className="flex gap-2">
                    <button onClick={() => handleAnnehmen(t)} disabled={pending}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50">
                      <CheckIcon className="w-4 h-4" /> Annehmen
                    </button>
                    <button onClick={() => { setModal({ type: 'gegenvorschlag', termin: t }); setGrund(''); setNeuesDatum('') }} disabled={pending}
                      className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors">
                      <RefreshCwIcon className="w-3.5 h-3.5" /> Gegenvorschlag
                    </button>
                    <button onClick={() => { setModal({ type: 'ablehnen', termin: t }); setGrund('') }} disabled={pending}
                      className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors">
                      <XIcon className="w-3.5 h-3.5" /> Ablehnen
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Ablehnen Modal */}
      {modal?.type === 'ablehnen' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-red-500" /> Termin ablehnen
            </h3>
            <textarea value={grund} onChange={e => setGrund(e.target.value)} placeholder="Begründung (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:border-[#4573A2]" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-xl text-sm bg-gray-100 text-gray-600">Abbrechen</button>
              <button onClick={handleAblehnen} disabled={pending} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white disabled:opacity-50">Ablehnen</button>
            </div>
          </div>
        </div>
      )}

      {/* Gegenvorschlag Modal */}
      {modal?.type === 'gegenvorschlag' && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <RefreshCwIcon className="w-4 h-4 text-amber-500" /> Gegenvorschlag
            </h3>
            <input type="datetime-local" value={neuesDatum} onChange={e => setNeuesDatum(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:border-[#4573A2]" />
            <textarea value={grund} onChange={e => setGrund(e.target.value)} placeholder="Begründung (optional)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none focus:outline-none focus:border-[#4573A2]" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-xl text-sm bg-gray-100 text-gray-600">Abbrechen</button>
              <button onClick={handleGegenvorschlag} disabled={pending || !neuesDatum} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white disabled:opacity-50">Vorschlagen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
