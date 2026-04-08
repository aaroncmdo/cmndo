'use client'

import { useState } from 'react'
import { type TerminData, ablehnenTermin, bestaetigenTermin, gegenvorschlagTermin } from './actions'

type View = 'overview' | 'ablehnen' | 'gegenvorschlag' | 'done'

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

  // Bereits entschieden
  if (termin.status !== 'reserviert' && termin.status !== 'bestaetigt') {
    const statusLabels: Record<string, string> = {
      abgelehnt: 'Dieser Termin wurde bereits abgelehnt.',
      abgesagt: 'Dieser Termin wurde abgesagt.',
      storniert: 'Dieser Termin wurde storniert.',
      abgeschlossen: 'Dieser Termin wurde bereits durchgeführt.',
      gegenvorschlag: 'Für diesen Termin liegt ein Gegenvorschlag vor. Claimondo wird sich melden.',
      verschoben: 'Dieser Termin wurde verschoben.',
    }
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl shadow-black/10">
          <div className="w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">ℹ️</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Bereits bearbeitet</h1>
          <p className="text-sm text-gray-500">{statusLabels[termin.status] ?? `Status: ${termin.status}`}</p>
        </div>
      </div>
    )
  }

  if (view === 'done') {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl shadow-black/10">
          <div className={`w-14 h-14 rounded-full ${doneSuccess ? 'bg-green-500/10' : 'bg-red-500/10'} flex items-center justify-center mx-auto mb-4`}>
            <span className="text-2xl">{doneSuccess ? '✓' : '✗'}</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{doneSuccess ? 'Erledigt' : 'Fehler'}</h1>
          <p className="text-sm text-gray-500">{doneMessage}</p>
        </div>
      </div>
    )
  }

  async function handleBestaetigen() {
    setLoading(true)
    const result = await bestaetigenTermin(token)
    setLoading(false)
    setDoneSuccess(result.success)
    setDoneMessage(result.success
      ? 'Der Termin wurde bestätigt. Vielen Dank!'
      : result.error ?? 'Fehler beim Bestätigen.')
    setView('done')
  }

  async function handleAblehnen() {
    setLoading(true)
    const result = await ablehnenTermin(token, grund)
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
    const result = await gegenvorschlagTermin(token, neuerTermin, grund)
    setLoading(false)
    setDoneSuccess(result.success)
    setDoneMessage(result.success
      ? 'Ihr Gegenvorschlag wurde übermittelt. Claimondo prüft den neuen Termin.'
      : result.error ?? 'Fehler beim Gegenvorschlag.')
    setView('done')
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo / Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#0D1B3E] flex items-center justify-center">
              <span className="text-white font-bold text-sm">C</span>
            </div>
            <span className="text-lg font-semibold text-[#0D1B3E]" style={{ fontFamily: 'Montserrat, sans-serif' }}>Claimondo</span>
          </div>
        </div>

        {/* Termin-Card */}
        <div className="bg-white rounded-3xl p-6 shadow-xl shadow-black/10 border border-gray-200">
          <h1 className="text-lg font-semibold text-[#0D1B3E] mb-4" style={{ fontFamily: 'Montserrat, sans-serif' }}>
            Terminbestätigung
          </h1>

          {/* Info-Block */}
          <div className="bg-[#f8f9fb] rounded-2xl p-4 mb-6 space-y-2">
            <InfoRow label="Kunde" value={termin.kunde_name} />
            <InfoRow label="Kennzeichen" value={termin.kennzeichen} />
            <InfoRow label="Datum" value={datum} />
            <InfoRow label="Uhrzeit" value={`${uhrzeit} Uhr`} />
            <InfoRow label="Adresse" value={termin.adresse} />
            {termin.fall_nummer && <InfoRow label="Fall" value={termin.fall_nummer} />}
          </div>

          {/* Actions */}
          {view === 'overview' && (
            <div className="space-y-3">
              <button
                onClick={handleBestaetigen}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-[#1E3A5F] text-white font-medium text-sm hover:bg-[#4573A2] transition-colors disabled:opacity-40 active:scale-[0.98]"
              >
                {loading ? 'Wird verarbeitet...' : 'Termin bestätigen'}
              </button>
              <button
                onClick={() => setView('gegenvorschlag')}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-white text-[#1E3A5F] font-medium text-sm border border-[#1E3A5F] hover:bg-[#f8f9fb] transition-colors disabled:opacity-40"
              >
                Gegenvorschlag
              </button>
              <button
                onClick={() => setView('ablehnen')}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-white text-red-600 font-medium text-sm border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-40"
              >
                Termin ablehnen
              </button>
            </div>
          )}

          {/* Ablehnen-View */}
          {view === 'ablehnen' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Möchten Sie den Termin wirklich ablehnen?</p>
              <textarea
                value={grund}
                onChange={e => setGrund(e.target.value)}
                placeholder="Begründung (optional)"
                className="w-full rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
                rows={3}
              />
              <button
                onClick={handleAblehnen}
                disabled={loading}
                className="w-full py-3.5 rounded-2xl bg-red-600 text-white font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-40 active:scale-[0.98]"
              >
                {loading ? 'Wird verarbeitet...' : 'Termin endgültig ablehnen'}
              </button>
              <button
                onClick={() => setView('overview')}
                disabled={loading}
                className="w-full py-3 text-sm text-gray-500 hover:text-gray-700"
              >
                Zurück
              </button>
            </div>
          )}

          {/* Gegenvorschlag-View */}
          {view === 'gegenvorschlag' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Schlagen Sie einen alternativen Termin vor:</p>
              <input
                type="datetime-local"
                value={neuerTermin}
                onChange={e => setNeuerTermin(e.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
              />
              <textarea
                value={grund}
                onChange={e => setGrund(e.target.value)}
                placeholder="Begründung (optional)"
                className="w-full rounded-2xl border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
                rows={2}
              />
              <button
                onClick={handleGegenvorschlag}
                disabled={loading || !neuerTermin}
                className="w-full py-3.5 rounded-2xl bg-[#1E3A5F] text-white font-medium text-sm hover:bg-[#4573A2] transition-colors disabled:opacity-40 active:scale-[0.98]"
              >
                {loading ? 'Wird verarbeitet...' : 'Gegenvorschlag senden'}
              </button>
              <button
                onClick={() => setView('overview')}
                disabled={loading}
                className="w-full py-3 text-sm text-gray-500 hover:text-gray-700"
              >
                Zurück
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">Claimondo GmbH</p>
      </div>
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
