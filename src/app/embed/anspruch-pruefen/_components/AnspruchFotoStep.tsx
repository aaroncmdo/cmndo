'use client'
import { useState } from 'react'
import { ladeSchadenfoto, analysiereSchaden } from '../actions'
import type { VisionResult } from '@/lib/anspruch/types'
import { Button } from '@/components/primitives'

export function AnspruchFotoStep({
  sessionToken, onWeiter, onOhneAnalyse,
}: { sessionToken: string; onWeiter: (v: VisionResult) => void; onOhneAnalyse: () => void }) {
  const [anzahl, setAnzahl] = useState(0)
  const [busy, setBusy] = useState(false)          // Upload laeuft
  const [analysiert, setAnalysiert] = useState(false) // Vision-Analyse laeuft (10-30s)
  const [fehler, setFehler] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setFehler(null); setBusy(true)
    for (const f of files) {
      const fd = new FormData(); fd.set('foto', f)
      const r = await ladeSchadenfoto(sessionToken, fd)
      if (r.ok) setAnzahl(r.anzahl)
      else setFehler(r.error)
    }
    setBusy(false)
    e.target.value = ''
  }

  async function analysieren() {
    setAnalysiert(true); setFehler(null)
    const r = await analysiereSchaden(sessionToken)
    setAnalysiert(false)
    if (r.ok) onWeiter(r.vision)
    else setFehler(r.error)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Schaden fotografieren</h2>
        <p className="text-body-sm text-claimondo-shield">
          Am besten 3–5 Fotos: Gesamtansicht, Nahaufnahme des Schadens und angrenzende Teile.
        </p>
      </div>

      {analysiert ? (
        <div className="flex flex-col items-center rounded-ios-md border border-claimondo-border bg-claimondo-bg px-4 py-10 text-center">
          <span className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-claimondo-border border-t-claimondo-navy" aria-hidden />
          <p className="text-body font-medium text-claimondo-navy">Analysiere Ihre Fotos …</p>
          <p className="mt-1 text-body-sm text-claimondo-shield">Das dauert einen kurzen Moment.</p>
        </div>
      ) : (
        <>
          <label className="flex cursor-pointer items-center justify-center rounded-ios-md border border-dashed border-claimondo-border bg-claimondo-bg px-4 py-8 text-body text-claimondo-navy">
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onFile} disabled={busy} />
            {anzahl > 0 ? `${anzahl} Foto(s) hinzugefügt · weitere hinzufügen` : 'Fotos aufnehmen oder auswählen'}
          </label>

          {fehler ? (
            <div className="rounded-ios-md bg-warning-soft p-3">
              <p className="text-body-sm font-medium text-warning-strong">{fehler}</p>
              <p className="mt-0.5 text-caption text-claimondo-shield">
                Mehr oder schärfere Fotos helfen oft. Sie können auch ohne automatische Einschätzung direkt einen Gutachter finden.
              </p>
            </div>
          ) : null}

          <Button onClick={analysieren} loading={busy} disabled={anzahl === 0 || busy} className="w-full">
            Schaden analysieren
          </Button>

          {fehler ? (
            <button
              type="button"
              onClick={onOhneAnalyse}
              className="w-full text-center text-body-sm font-medium text-claimondo-navy underline underline-offset-2"
            >
              Ohne Einschätzung fortfahren
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}
