'use client'

import { useState } from 'react'
import Link from 'next/link'
import { type TerminData } from './actions'
import { terminAblehnen, terminGegenvorschlag, terminAnnehmen } from '@/lib/actions/termin-actions'

type View = 'overview' | 'ablehnen' | 'gegenvorschlag' | 'done'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://cmndo.vercel.app'

export default function TerminClient({ termin, token }: { termin: TerminData; token: string }) {
  const [view, setView] = useState<View>('overview')
  const [loading, setLoading] = useState(false)
  const [grund, setGrund] = useState('')
  const [neuerTermin, setNeuerTermin] = useState('')
  const [doneMessage, setDoneMessage] = useState('')
  const [doneSuccess, setDoneSuccess] = useState(true)

  const terminDate = new Date(termin.start_zeit)
  const datum = terminDate.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  const uhrzeit = terminDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(termin.adresse)}`

  const canAct = termin.status === 'reserviert' || termin.status === 'gegenvorschlag'
  const isKundenGegenvorschlag = termin.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'kunde'
  const isSvGegenvorschlag = termin.status === 'gegenvorschlag' && termin.gegenvorschlag_von === 'sv'

  // ─── Status-spezifische Read-Only Screens ───────────────────────────────

  if (!canAct && view !== 'done') {
    let icon = 'ℹ️'
    let title = 'Bereits bearbeitet'
    let message = `Status: ${termin.status}`

    if (termin.status === 'bestaetigt') {
      icon = '✅'
      title = 'Termin steht'
      message = `Dein Termin am ${datum} um ${uhrzeit} Uhr ist bestätigt.`
    } else if (termin.status === 'abgelehnt') {
      icon = '❌'
      title = 'Termin abgelehnt'
      const abDatum = termin.abgelehnt_am ? new Date(termin.abgelehnt_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
      message = `Du hast diesen Termin${abDatum ? ` am ${abDatum}` : ''} abgelehnt. Claimondo wird einen neuen Gutachter zuweisen.`
    } else if (termin.status === 'abgesagt' || termin.status === 'storniert') {
      icon = '🚫'
      title = 'Termin storniert'
      message = 'Dieser Termin wurde storniert.'
    } else if (termin.status === 'abgeschlossen') {
      icon = '✓'
      title = 'Termin abgeschlossen'
      message = 'Dieser Termin wurde bereits durchgeführt.'
    } else if (termin.status === 'verschoben') {
      icon = '📅'
      title = 'Termin verschoben'
      message = 'Dieser Termin wurde verschoben.'
    }

    return (
      <PageWrapper>
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-black/10 border border-gray-200">
          <div className="text-center mb-4">
            <div className="w-14 h-14 rounded-full bg-[#4573A2]/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">{icon}</span>
            </div>
            <h1 className="text-lg font-semibold text-[#0D1B3E]" style={{ fontFamily: 'Montserrat, sans-serif' }}>{title}</h1>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>

          <TerminInfoCard termin={termin} datum={datum} uhrzeit={uhrzeit} mapsUrl={mapsUrl} />
          <FallakteLink fallId={termin.fall_id} />
        </div>
      </PageWrapper>
    )
  }

  // ─── Done Screen ────────────────────────────────────────────────────────

  if (view === 'done') {
    return (
      <PageWrapper>
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-black/10 border border-gray-200 text-center">
          <div className={`w-14 h-14 rounded-full ${doneSuccess ? 'bg-green-500/10' : 'bg-red-500/10'} flex items-center justify-center mx-auto mb-3`}>
            <span className="text-2xl">{doneSuccess ? '✓' : '✗'}</span>
          </div>
          <h1 className="text-lg font-semibold text-[#0D1B3E] mb-1">{doneSuccess ? 'Erledigt' : 'Fehler'}</h1>
          <p className="text-sm text-gray-500">{doneMessage}</p>
          <FallakteLink fallId={termin.fall_id} />
        </div>
      </PageWrapper>
    )
  }

  // ─── Action Handlers ────────────────────────────────────────────────────

  async function handleAblehnen() {
    setLoading(true)
    const result = await terminAblehnen({ grund, source: 'sv_token', token })
    setLoading(false)
    setDoneSuccess(result.success)
    setDoneMessage(result.success
      ? 'Der Termin wurde abgelehnt. Claimondo wird einen neuen Gutachter zuweisen.'
      : result.error ?? 'Fehler beim Ablehnen.')
    setView('done')
  }

  async function handleGegenvorschlag() {
    if (!neuerTermin) return
    setLoading(true)
    const result = await terminGegenvorschlag({ neuesDatum: neuerTermin, grund, source: 'sv_token', token })
    setLoading(false)
    setDoneSuccess(result.success)
    setDoneMessage(result.success
      ? 'Dein Gegenvorschlag wurde übermittelt. Der Kunde wird benachrichtigt.'
      : result.error ?? 'Fehler beim Gegenvorschlag.')
    setView('done')
  }

  async function handleAnnehmen() {
    setLoading(true)
    setDoneSuccess(false)
    setDoneMessage('Bitte nutze das Gutachter-Portal um den Gegenvorschlag anzunehmen.')
    setLoading(false)
    setView('done')
  }

  // ─── Active Screen (reserviert / gegenvorschlag) ────────────────────────

  return (
    <PageWrapper>
      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-black/10 border border-gray-200">
        <h1 className="text-lg font-semibold text-[#0D1B3E] mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
          Dein nächster Termin
        </h1>

        <TerminInfoCard termin={termin} datum={datum} uhrzeit={uhrzeit} mapsUrl={mapsUrl} />

        {/* Kunden-Gegenvorschlag Banner */}
        {isKundenGegenvorschlag && termin.vorgeschlagenes_datum && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
            <p className="text-sm font-medium text-amber-800 mb-1">Kunde hat einen Gegenvorschlag gemacht</p>
            <p className="text-sm text-amber-700">
              Neues Datum: {new Date(termin.vorgeschlagenes_datum).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            {termin.gegenvorschlag_grund && <p className="text-xs text-amber-600 mt-1">Grund: {termin.gegenvorschlag_grund}</p>}
          </div>
        )}

        {/* SV-eigener Gegenvorschlag Status */}
        {isSvGegenvorschlag && termin.vorgeschlagenes_datum && (
          <div className="bg-[#4573A2]/5 border border-[#7BA3CC]/30 rounded-2xl p-4 mb-4">
            <p className="text-sm font-medium text-[#0D1B3E]">Du hast einen Gegenvorschlag gemacht</p>
            <p className="text-sm text-[#1E3A5F]">
              Vorgeschlagenes Datum: {new Date(termin.vorgeschlagenes_datum).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
            <p className="text-xs text-gray-500 mt-1">Wir warten auf Rückmeldung vom Kunden.</p>
          </div>
        )}

        {/* Hinweistext */}
        {!isSvGegenvorschlag && (
          <div className="bg-[#4573A2]/5 border border-[#7BA3CC]/30 rounded-2xl px-4 py-3 mb-4">
            <p className="text-xs text-[#1E3A5F]">
              {isKundenGegenvorschlag
                ? 'Der Kunde hat einen alternativen Termin vorgeschlagen. Du kannst annehmen, erneut gegenvorschlagen oder ablehnen.'
                : 'Der Termin ist standardmäßig bestätigt. Hier nur eingreifen wenn du ablehnen oder verschieben möchtest.'}
            </p>
          </div>
        )}

        {/* Actions */}
        {view === 'overview' && !isSvGegenvorschlag && (
          <div className="space-y-3 mb-4">
            {isKundenGegenvorschlag && (
              <button onClick={handleAnnehmen} disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#1E3A5F] text-white font-medium text-sm hover:bg-[#4573A2] transition-colors disabled:opacity-40 active:scale-[0.98]">
                {loading ? 'Wird verarbeitet...' : 'Vorschlag annehmen'}
              </button>
            )}
            <button onClick={() => setView('gegenvorschlag')} disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-white text-[#1E3A5F] font-medium text-sm border border-[#4573A2] hover:bg-[#f8f9fb] transition-colors disabled:opacity-40">
              {isKundenGegenvorschlag ? 'Erneut gegenvorschlagen' : 'Neuen Termin vorschlagen'}
            </button>
            <button onClick={() => setView('ablehnen')} disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-white text-red-600 font-medium text-sm border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40">
              Termin ablehnen
            </button>
          </div>
        )}

        {/* Ablehnen-View */}
        {view === 'ablehnen' && (
          <div className="space-y-3 mb-4">
            <p className="text-sm text-gray-600">Möchtest du den Termin wirklich ablehnen?</p>
            <textarea value={grund} onChange={e => setGrund(e.target.value)} placeholder="Begründung (optional)"
              className="w-full rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#4573A2]" rows={3} />
            <button onClick={handleAblehnen} disabled={loading}
              className="w-full py-3.5 rounded-2xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-40 active:scale-[0.98]">
              {loading ? 'Wird verarbeitet...' : 'Termin endgültig ablehnen'}
            </button>
            <button onClick={() => setView('overview')} disabled={loading} className="w-full py-3 text-sm text-gray-500 hover:text-gray-700">Zurück</button>
          </div>
        )}

        {/* Gegenvorschlag-View */}
        {view === 'gegenvorschlag' && (
          <div className="space-y-3 mb-4">
            <p className="text-sm text-gray-600">Schlage einen alternativen Termin vor:</p>
            <input type="datetime-local" value={neuerTermin} onChange={e => setNeuerTermin(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4573A2]" />
            <textarea value={grund} onChange={e => setGrund(e.target.value)} placeholder="Begründung (optional)"
              className="w-full rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#4573A2]" rows={2} />
            <button onClick={handleGegenvorschlag} disabled={loading || !neuerTermin}
              className="w-full py-3.5 rounded-2xl bg-[#1E3A5F] text-white font-medium text-sm hover:bg-[#4573A2] transition-colors disabled:opacity-40 active:scale-[0.98]">
              {loading ? 'Wird verarbeitet...' : 'Gegenvorschlag senden'}
            </button>
            <button onClick={() => setView('overview')} disabled={loading} className="w-full py-3 text-sm text-gray-500 hover:text-gray-700">Zurück</button>
          </div>
        )}

        <FallakteLink fallId={termin.fall_id} />
      </div>
    </PageWrapper>
  )
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0D1B3E] flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-lg font-semibold text-[#0D1B3E]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Claimondo</span>
          </div>
        </div>
        {children}
        <p className="text-center text-xs text-gray-400 mt-4">Claimondo GmbH</p>
      </div>
    </div>
  )
}

function TerminInfoCard({ termin, datum, uhrzeit, mapsUrl }: { termin: TerminData; datum: string; uhrzeit: string; mapsUrl: string }) {
  return (
    <div className="bg-[#f8f9fb] rounded-2xl p-4 mb-4 space-y-2">
      <InfoRow label="Kunde" value={termin.kunde_name} />
      <InfoRow label="Datum" value={datum} />
      <InfoRow label="Uhrzeit" value={`${uhrzeit} Uhr`} />
      <div className="flex justify-between text-sm">
        <span className="text-gray-500">Adresse</span>
        <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
          className="text-[#4573A2] font-medium text-right hover:underline max-w-[60%] truncate">
          {termin.adresse}
        </a>
      </div>
      {termin.kennzeichen !== '—' && <InfoRow label="Kennzeichen" value={termin.kennzeichen} />}
      {termin.fahrzeug && <InfoRow label="Fahrzeug" value={termin.fahrzeug} />}
      {termin.versicherung && <InfoRow label="Versicherung" value={termin.versicherung} />}
      {termin.fall_nummer && <InfoRow label="Fall" value={termin.fall_nummer} />}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  )
}

function FallakteLink({ fallId }: { fallId: string | null }) {
  if (!fallId) return null
  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <Link href={`/gutachter/fall/${fallId}`}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[#4573A2] font-medium text-sm border border-[#7BA3CC]/30 hover:bg-[#4573A2]/5 transition-colors">
        → Zur vollständigen Fallakte
      </Link>
    </div>
  )
}
