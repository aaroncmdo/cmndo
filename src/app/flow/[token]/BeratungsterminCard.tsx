'use client'

import { useState } from 'react'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { bestaetigeBeratungsterminFlow, verschiebeBeratungsterminFlow } from './self-service-actions'

type Props = {
  token: string
  termin: { id: string; startZeit: string; status: string; kbVorname: string | null }
}

function fmt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
      timeZone: 'Europe/Berlin',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// Berlin-Wall-Clock aus <input datetime-local> (WunschterminPicker liefert 'YYYY-MM-DDTHH:mm')
// als ISO interpretieren — der Picker erzeugt lokale Zeit; wir senden sie als ISO an die Action,
// die sie als Termin-Zeitpunkt speichert (gleiche Konvention wie der Embed-Wunschtermin).
function lokalToIso(lokal: string): string {
  return new Date(lokal).toISOString()
}

export function BeratungsterminCard({ token, termin }: Props) {
  const [startZeit, setStartZeit] = useState(termin.startZeit)
  const [status, setStatus] = useState(termin.status)
  const [verschieben, setVerschieben] = useState(false)
  const [neuLokal, setNeuLokal] = useState('')
  const [pending, setPending] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function bestaetigen() {
    setPending(true); setFehler(null)
    try {
      const r = await bestaetigeBeratungsterminFlow(token)
      if (!r.ok) { setFehler(r.error ?? 'Fehler'); return }
      setStatus('bestaetigt')
    } finally { setPending(false) }
  }

  async function speichern() {
    if (!neuLokal) return
    setPending(true); setFehler(null)
    try {
      const iso = lokalToIso(neuLokal)
      const r = await verschiebeBeratungsterminFlow(token, iso)
      if (!r.ok) { setFehler(r.error ?? 'Fehler'); return }
      setStartZeit(iso); setStatus('bestaetigt'); setVerschieben(false)
    } finally { setPending(false) }
  }

  return (
    <div className="mb-5 rounded-ios-md border border-claimondo-ondo/20 bg-claimondo-ondo/[0.06] p-5">
      <p className="text-xs uppercase tracking-wider text-claimondo-ondo mb-1">Ihr Beratungstermin</p>
      <p className="text-base font-semibold text-claimondo-navy">{fmt(startZeit)}</p>
      {termin.kbVorname && (
        <p className="text-sm text-claimondo-ondo mb-1">mit {termin.kbVorname}</p>
      )}
      <p className="text-xs text-claimondo-shield/80 mb-3">
        {status === 'bestaetigt' ? 'Bestätigt — wir rufen Sie zur vereinbarten Zeit an.' : 'Passt Ihnen dieser Termin?'}
      </p>

      {fehler && <p className="text-sm text-danger-strong mb-2">{fehler}</p>}

      {!verschieben ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          {status !== 'bestaetigt' && (
            <button
              onClick={bestaetigen}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm disabled:opacity-60 transition-colors"
            >
              Passt mir
            </button>
          )}
          <button
            onClick={() => setVerschieben(true)}
            disabled={pending}
            className="inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-claimondo-border text-claimondo-navy font-semibold text-sm disabled:opacity-60"
          >
            Verschieben
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <WunschterminPicker value={neuLokal} onChange={setNeuLokal} />
          <div className="flex gap-2">
            <button
              onClick={speichern}
              disabled={pending || !neuLokal}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm disabled:opacity-60 transition-colors"
            >
              Neuen Termin speichern
            </button>
            <button
              onClick={() => { setVerschieben(false); setNeuLokal('') }}
              disabled={pending}
              className="inline-flex items-center justify-center min-h-11 px-5 rounded-full border border-claimondo-border text-claimondo-navy font-semibold text-sm disabled:opacity-60"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
