'use client'
import { useState } from 'react'
import { berechneAnspruch } from '../actions'
import { SEGMENTE, SEGMENT_LABEL, SCHULDFORMEN, SCHULD_LABEL, ERSATZFAHRZEUG_OPTIONEN, ERSATZFAHRZEUG_LABEL, type AnspruchSpanne, type Ersatzfahrzeug, type Schuldform, type Segment, type VisionResult } from '@/lib/anspruch/types'
import { Button } from '@/components/primitives'

// Kurzvorschau des Regulierungswegs je Schuldform (rechts neben dem Label).
const SCHULD_HINT: Record<Schuldform, string> = {
  unverschuldet: 'Gegner zahlt',
  teilschuld: 'anteilig',
  selbst: 'über Ihre Kasko',
}

export function AnspruchEinschaetzungStep({
  sessionToken, vision, onFertig, initialSchuld,
}: { sessionToken: string; vision: VisionResult; onFertig: (s: AnspruchSpanne) => void; initialSchuld?: Schuldform }) {
  const [segment, setSegment] = useState<Segment>(vision.segment)
  const [schuld, setSchuld] = useState<Schuldform>(initialSchuld ?? 'unverschuldet')
  const [fahrbereit, setFahrbereit] = useState<boolean | null>(null)
  const [ersatzfahrzeug, setErsatzfahrzeug] = useState<Ersatzfahrzeug>('nutzungsausfall')
  const [ezJahr, setEzJahr] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  async function weiter() {
    if (fahrbereit === null) { setFehler('Bitte angeben, ob das Fahrzeug fahrbereit ist'); return }
    const currentYear = new Date().getFullYear()
    const jahr = ezJahr.trim() ? Number(ezJahr.trim()) : null
    if (jahr === null || !Number.isFinite(jahr) || jahr < 1980 || jahr > currentYear + 1) {
      setFehler('Bitte eine gültige Erstzulassung angeben (z. B. 2021)')
      return
    }
    setBusy(true); setFehler(null)
    const r = await berechneAnspruch(sessionToken, { segment, fahrbereit, ezJahr: jahr, schuld, ersatzfahrzeug })
    setBusy(false)
    if (r.ok) onFertig(r.spanne)
    else setFehler(r.error)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Erkannt: {vision.beschaedigte_teile.join(', ')}</h2>
        <p className="text-body-sm text-claimondo-shield">{vision.beschreibung}</p>
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-claimondo-navy">Wer hat den Unfall verursacht?</p>
        <div className="flex flex-col gap-2">
          {SCHULDFORMEN.map((s) => (
            <button key={s} type="button" onClick={() => setSchuld(s)}
              className={`flex items-center justify-between rounded-ios-sm border px-3 py-2 text-left ${schuld === s ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>
              <span className="text-body-sm font-medium">{SCHULD_LABEL[s]}</span>
              <span className={`text-caption ${schuld === s ? 'text-white/80' : 'text-claimondo-shield'}`}>{SCHULD_HINT[s]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-claimondo-navy">Fahrzeugklasse</p>
        <div className="flex flex-wrap gap-2">
          {SEGMENTE.map((s) => (
            <button key={s} type="button" onClick={() => setSegment(s)}
              className={`rounded-ios-sm border px-3 py-1.5 text-body-sm ${segment === s ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>
              {SEGMENT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-claimondo-navy">Ist Ihr Fahrzeug noch fahrbereit?</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setFahrbereit(true)}
            className={`flex-1 rounded-ios-sm border px-3 py-2 text-body-sm ${fahrbereit === true ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>Ja, fahrbereit</button>
          <button type="button" onClick={() => setFahrbereit(false)}
            className={`flex-1 rounded-ios-sm border px-3 py-2 text-body-sm ${fahrbereit === false ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>Nein, nicht fahrbereit</button>
        </div>
      </div>

      {fahrbereit === false ? (
        <div>
          <p className="mb-2 text-body-sm font-medium text-claimondo-navy">Ersatzfahrzeug während der Reparatur?</p>
          <div className="flex flex-col gap-2">
            {ERSATZFAHRZEUG_OPTIONEN.map((e) => (
              <button key={e} type="button" onClick={() => setErsatzfahrzeug(e)}
                className={`rounded-ios-sm border px-3 py-2 text-left text-body-sm ${ersatzfahrzeug === e ? 'border-claimondo-navy bg-claimondo-navy text-white' : 'border-claimondo-border text-claimondo-navy'}`}>
                {ERSATZFAHRZEUG_LABEL[e]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-body-sm font-medium text-claimondo-navy">Erstzulassung (Jahr)</label>
        <input inputMode="numeric" value={ezJahr} onChange={(e) => setEzJahr(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="z. B. 2021"
          className="w-full rounded-ios-sm border border-claimondo-border px-3 py-2 text-body text-claimondo-navy" />
        <p className="mt-1 text-caption text-claimondo-shield">Für die Wertermittlung Ihres Fahrzeugs (Pflichtfeld).</p>
      </div>

      {fehler ? <p className="text-body-sm text-danger-strong">{fehler}</p> : null}
      <Button onClick={weiter} loading={busy} className="w-full">Anspruch anzeigen</Button>
    </div>
  )
}
