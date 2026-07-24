'use client'

// (b) Tap-to-Provision (Aaron 24.07.): eine BLANKO-NFC-Karte antippen -> frischer Token wird
// gemintet, auf den Chip geschrieben, zurueckgelesen/verifiziert (chipTraegtToken) + die Chip-UID
// vermerkt — alles in EINEM Zug, ohne vorher „erzeugen". KEIN Binden (der Admin provisioniert nur,
// der FM bindet ans Fahrzeug). Web NFC = nur Android/Chrome; Desktop/iPhone rendern NICHTS
// (die NfcBeschreibenHinweis-Bruecke weist sie ans Android-Handy).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { buildSchadenkarteUrl } from '@/lib/schadenkarte/url'
import { nfcVerfuegbar, writeUndLiesZurueck, chipTraegtToken } from '@/lib/schadenkarte/nfc'

export function NfcBlankoProvisionieren({
  onMint,
  onFinalize,
}: {
  /** Mintet 1 frischen Karten-Token fuer die Firma (status='bestellt'). */
  onMint: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  /** Vermerkt die Chip-UID am (soeben beschriebenen) Token. KEIN Binden -> fahrzeugId bleibt null. */
  onFinalize: (token: string, nfcUid: string | null) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [unterstuetzt, setUnterstuetzt] = useState(false)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)

  // Verfuegbarkeit erst nach Mount (SSR-safe, wie NfcKarteSchreibenButton).
  useEffect(() => {
    setUnterstuetzt(nfcVerfuegbar())
  }, [])

  if (!unterstuetzt) return null

  async function provisionieren() {
    setLaeuft(true)
    setFehler(null)
    setErfolg(null)
    // 1) Frischen Token minten.
    const mint = await onMint()
    if (!mint.ok) {
      setFehler(mint.error)
      setLaeuft(false)
      return
    }
    // 2) Auf den Chip schreiben + zuruecklesen (Write-Timeout im Adapter).
    const w = await writeUndLiesZurueck(buildSchadenkarteUrl(mint.token))
    if (!w.ok) {
      setFehler(w.error)
      setLaeuft(false)
      return
    }
    // 3) Verifizieren: traegt der Chip wirklich UNSEREN frischen Token?
    if (!chipTraegtToken(w.readBack, mint.token)) {
      setFehler('Nicht verifiziert — bitte dieselbe leere Karte erneut anhalten.')
      setLaeuft(false)
      return
    }
    // 4) Chip-UID vermerken (kein Binden).
    const fin = await onFinalize(mint.token, w.uid)
    setLaeuft(false)
    if (!fin.ok) {
      setFehler(fin.error ?? 'Speichern fehlgeschlagen.')
      return
    }
    setErfolg('Karte beschrieben — bereit für den Flottenmanager (er bindet sie ans Fahrzeug).')
    router.refresh()
  }

  return (
    <div className="mb-4 space-y-2 rounded-ios-lg border border-claimondo-border p-3">
      <p className="text-body-sm font-medium text-claimondo-navy">Blanko-NFC-Karte antippen &amp; beschreiben</p>
      <p className="text-caption text-claimondo-ondo/70">
        Leere NFC-Karte auflegen — sie bekommt in einem Zug einen <strong className="text-claimondo-navy">eindeutigen</strong>{' '}
        Code (= QR) und erscheint unten in der Liste. Kein vorheriges „Erzeugen" nötig.
      </p>
      <Button variant="ondo" size="sm" loading={laeuft} onClick={provisionieren}>
        {laeuft ? 'Karte anhalten…' : 'Blanko-Karte antippen'}
      </Button>
      {laeuft && (
        <p className="text-caption text-claimondo-ondo">📶 Leere Karte jetzt an die Rückseite des Handys halten.</p>
      )}
      {erfolg && <p className="text-caption text-success-strong">{erfolg}</p>}
      {fehler && <p className="text-caption text-danger-strong">{fehler}</p>}
    </div>
  )
}
