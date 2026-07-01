'use client'
import { useState } from 'react'
import { ladeSchadenfoto, analysiereSchaden } from '../actions'
import type { VisionResult } from '@/lib/anspruch/types'
import { Button } from '@/components/primitives'

export function AnspruchFotoStep({
  sessionToken, onWeiter,
}: { sessionToken: string; onWeiter: (v: VisionResult) => void }) {
  const [anzahl, setAnzahl] = useState(0)
  const [busy, setBusy] = useState(false)
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
    setBusy(true); setFehler(null)
    const r = await analysiereSchaden(sessionToken)
    setBusy(false)
    if (r.ok) onWeiter(r.vision)
    else setFehler(r.error)
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-heading-sm font-bold text-claimondo-navy">Schaden fotografieren</h2>
        <p className="text-body-sm text-claimondo-shield">
          Am besten 3–5 Fotos: Gesamtansicht, Nahaufnahme des Schadens und angrenzende Teile.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-center rounded-ios-md border border-dashed border-claimondo-border bg-claimondo-bg px-4 py-8 text-body text-claimondo-navy">
        <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={onFile} disabled={busy} />
        {anzahl > 0 ? `${anzahl} Foto(s) hinzugefügt — weitere hinzufügen` : 'Fotos aufnehmen oder auswählen'}
      </label>

      {fehler ? <p className="text-body-sm text-danger-strong">{fehler}</p> : null}

      <Button onClick={analysieren} loading={busy} disabled={anzahl === 0} className="w-full">
        Schaden analysieren
      </Button>
    </div>
  )
}
