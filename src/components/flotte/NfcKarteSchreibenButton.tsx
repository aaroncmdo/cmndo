'use client'

// Per-Karte NFC-Beschreiben-Button (fuer die Karten-Tabelle im Admin-Vertrieb).
// Anders als NfcKarteBeschreiben (write-first, mintet bei jedem Tap einen NEUEN Token) schreibt
// dieser Button den BESTEHENDEN Token einer bereits erzeugten (Batch-)Karte auf einen leeren Chip
// -> Batch erzeugen (schnell, Desktop) + spaeter am Android pro Karte den Chip beschreiben.
// Verifiziert per Zuruecklesen (chipTraegtToken) + persistiert die Chip-UID via onGeschrieben.
// Web NFC = nur Android/Chrome; Desktop/iPhone sehen nur den Status.
import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives'
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
import { nfcVerfuegbar, writeUndLiesZurueck, chipTraegtToken } from '@/lib/schadenkarte/nfc'

export function NfcKarteSchreibenButton({
  token,
  beschrieben,
  onGeschrieben,
}: {
  token: string
  /** true = Chip laut DB schon beschrieben (nfc_uid gesetzt). */
  beschrieben: boolean
  onGeschrieben: (token: string, nfcUid: string | null) => Promise<{ ok: boolean; error?: string }>
}) {
  // Verfuegbarkeit erst nach Mount (SSR-safe, wie NfcKarteBeschreiben).
  const [unterstuetzt, setUnterstuetzt] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [lokalOk, setLokalOk] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    setUnterstuetzt(nfcVerfuegbar())
  }, [])

  const fertig = beschrieben || lokalOk

  async function schreibe() {
    setFehler(null)
    setLaeuft(true)
    const res = await writeUndLiesZurueck(buildSchadenkarteUrl(token))
    if (!res.ok) {
      setFehler(res.error)
      setLaeuft(false)
      return
    }
    // Sicherung: traegt der zurueckgelesene Chip wirklich UNSEREN Token?
    if (!chipTraegtToken(res.readBack, token)) {
      setFehler('Nicht verifiziert — bitte dieselbe leere Karte erneut auflegen.')
      setLaeuft(false)
      return
    }
    const fin = await onGeschrieben(token, res.uid)
    setLaeuft(false)
    if (!fin.ok) {
      setFehler(fin.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    setLokalOk(true)
  }

  if (!unterstuetzt) {
    return (
      <span
        className="text-body-xs text-claimondo-ondo/50"
        title="NFC-Beschreiben geht nur auf einem Android-Gerät mit Chrome."
      >
        {fertig ? '✓ beschrieben' : 'nur Android'}
      </span>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {fertig ? (
        <span className="text-body-xs font-medium text-success-strong">✓ beschrieben</span>
      ) : (
        <Button variant="ondo" size="sm" loading={laeuft} onClick={schreibe}>
          NFC schreiben
        </Button>
      )}
      {fehler && <span className="text-body-xs text-danger-strong">{fehler}</span>}
    </div>
  )
}
