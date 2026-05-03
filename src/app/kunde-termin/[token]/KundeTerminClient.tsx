'use client'

// AAR-702: Mini-Flow UI — Kunde sieht SV-Vorschlag, kann annehmen oder
// eigenen Termin vorschlagen. Kein Login.

import { useState, useTransition } from 'react'
import { acceptVorschlagByToken, counterByToken, type KundeTerminData } from './actions'

type View = 'overview' | 'gegenvorschlag' | 'done'

export default function KundeTerminClient({
  termin,
  token,
}: {
  termin: KundeTerminData
  token: string
}) {
  const [view, setView] = useState<View>('overview')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState('')
  const [neuesDatum, setNeuesDatum] = useState('')
  const [grund, setGrund] = useState('')

  const altDate = new Date(termin.start_zeit)
  const neuDate = termin.vorgeschlagenes_datum ? new Date(termin.vorgeschlagenes_datum) : null

  function fmt(d: Date) {
    return d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function handleAccept() {
    setError(null)
    startTransition(async () => {
      const res = await acceptVorschlagByToken(token)
      if (res.success) {
        setDoneMsg('Termin bestätigt! Der Sachverständige wurde informiert.')
        setView('done')
      } else {
        setError(res.error ?? 'Aktion fehlgeschlagen')
      }
    })
  }

  function handleCounter() {
    if (!neuesDatum) {
      setError('Bitte wählen Sie ein Datum.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await counterByToken(token, neuesDatum, grund.trim())
      if (res.success) {
        setDoneMsg('Ihr Vorschlag wurde übermittelt. Der Sachverständige meldet sich.')
        setView('done')
      } else {
        setError(res.error ?? 'Aktion fehlgeschlagen')
      }
    })
  }

  if (view === 'done') {
    return (
      <PageWrapper>
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl text-emerald-600">✓</span>
          </div>
          <h1 className="text-xl font-semibold text-[#0D1B3E] mb-2">Geschafft</h1>
          <p className="text-sm text-claimondo-ondo">{doneMsg}</p>
        </div>
      </PageWrapper>
    )
  }

  return (
    <PageWrapper>
      <div className="space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#4573A2]">
            {termin.fall_nummer ? `Fall ${termin.fall_nummer}` : 'Terminvorschlag'}
          </p>
          <h1 className="text-xl font-semibold text-[#0D1B3E] mt-1">
            Hallo {termin.kunde_vorname}
          </h1>
          <p className="text-sm text-claimondo-ondo mt-2">
            {termin.sv_name} kann den ursprünglichen Termin nicht halten und
            schlägt einen neuen vor.
          </p>
        </div>

        <div className="rounded-2xl border border-claimondo-border bg-white p-4 space-y-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70">
              Ursprünglicher Termin
            </p>
            <p className="text-sm text-[#0D1B3E] mt-0.5 line-through">{fmt(altDate)}</p>
          </div>
          {neuDate && (
            <div className="border-t border-claimondo-border pt-3">
              <p className="text-[10px] uppercase tracking-wider text-[#4573A2]">
                Neuer Vorschlag
              </p>
              <p className="text-base font-semibold text-[#0D1B3E] mt-0.5">{fmt(neuDate)}</p>
              {termin.gegenvorschlag_grund && (
                <p className="text-xs text-claimondo-ondo mt-2">
                  Begründung: {termin.gegenvorschlag_grund}
                </p>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
            {error}
          </div>
        )}

        {view === 'overview' ? (
          <div className="space-y-2">
            {neuDate && (
              <button
                type="button"
                onClick={handleAccept}
                disabled={pending}
                className="w-full min-h-[48px] rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#1E3A5F] transition-colors disabled:opacity-60"
              >
                {pending ? 'Wird verarbeitet…' : 'Vorschlag annehmen'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setView('gegenvorschlag')}
              disabled={pending}
              className="w-full min-h-[48px] rounded-xl border border-[#4573A2] text-[#4573A2] text-sm font-semibold hover:bg-[#4573A2]/5 transition-colors disabled:opacity-60"
            >
              Anderen Termin vorschlagen
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[#0D1B3E] block mb-1">
                Ihr Wunschtermin
              </label>
              <input
                type="datetime-local"
                value={neuesDatum}
                onChange={(e) => setNeuesDatum(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-xl border border-claimondo-border px-3 min-h-[44px] text-base text-[#0D1B3E] focus:outline-none focus:border-[#4573A2]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#0D1B3E] block mb-1">
                Begründung (optional)
              </label>
              <textarea
                rows={2}
                value={grund}
                onChange={(e) => setGrund(e.target.value)}
                placeholder="z. B. „Bin zu der Zeit beruflich verhindert"
                className="w-full rounded-xl border border-claimondo-border px-3 py-2 text-base text-[#0D1B3E] focus:outline-none focus:border-[#4573A2] resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setView('overview')}
                disabled={pending}
                className="flex-1 min-h-[44px] rounded-xl bg-[#f8f9fb] text-claimondo-navy text-sm font-medium hover:bg-claimondo-border"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={handleCounter}
                disabled={pending || !neuesDatum}
                className="flex-1 min-h-[44px] rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-60"
              >
                {pending ? 'Wird gesendet…' : 'Vorschlag senden'}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  )
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-6 md:p-8 shadow-xl shadow-black/5 border border-claimondo-border">
        {children}
      </div>
    </div>
  )
}
