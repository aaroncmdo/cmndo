'use client'

// Blanko-Karte per NFC beschreiben — WRITE-FIRST.
// Leere NFC-Karte auflegen -> frischer Token wird gemintet, auf den Chip geschrieben,
// zurueckgelesen/verifiziert und (optional) gleich ans gewaehlte Fahrzeug gebunden.
// KEIN QR-Zwang (der war nur fuer VORBEDRUCKTE Karten noetig). Web NFC = nur Chrome/Android;
// Desktop/iPhone bekommen die "am Handy oeffnen"-Bruecke.
import { useEffect, useState } from 'react'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives'
import { provisioniereKarte, type ProvisionEffects } from '@/lib/schadenkarte/provisioniere-karte'
import { nfcVerfuegbar, writeUndLiesZurueck } from '@/lib/schadenkarte/nfc'

type Props = {
  fahrzeuge: Array<{ vehicleId: string; label: string }>
  onMintToken: () => Promise<{ ok: true; token: string } | { ok: false; error: string }>
  onFinalize: (
    token: string,
    nfcUid: string | null,
    fahrzeugId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>
}

export function NfcKarteBeschreiben({ fahrzeuge, onMintToken, onFinalize }: Props) {
  const [unterstuetzt, setUnterstuetzt] = useState(false)
  const [bridgeQr, setBridgeQr] = useState<string | null>(null)
  const [fahrzeugId, setFahrzeugId] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [erfolg, setErfolg] = useState<string | null>(null)
  const [pendingToken, setPendingToken] = useState<string | null>(null)

  // Verfuegbarkeit ERST nach Mount pruefen (kein Hydration-Mismatch, s. nfcVerfuegbar-Kommentar).
  // Ohne NFC: QR der AKTUELLEN Seite bauen, damit der Operator sie am Android-Handy oeffnen kann.
  useEffect(() => {
    const ok = nfcVerfuegbar()
    setUnterstuetzt(ok)
    if (!ok && typeof window !== 'undefined') {
      void (async () => {
        try {
          const { default: QRCode } = await import('qrcode')
          setBridgeQr(await QRCode.toDataURL(window.location.href, { margin: 1, width: 180 }))
        } catch {
          setBridgeQr(null)
        }
      })()
    }
  }, [])

  async function beschreibe() {
    setFehler(null)
    setErfolg(null)
    setLaeuft(true)
    // writeUndLiesZurueck (geteilter Adapter) hat jetzt ein Write-Timeout -> kein Endlos-Haengen mehr.
    const effects: ProvisionEffects = { mintToken: onMintToken, writeAndRead: writeUndLiesZurueck, finalize: onFinalize }
    const res = await provisioniereKarte(effects, { fahrzeugId: fahrzeugId || null, pendingToken })
    if (res.ok) {
      setPendingToken(null)
      setErfolg(
        fahrzeugId
          ? 'Karte beschrieben und ans Fahrzeug gebunden.'
          : 'Karte beschrieben. Noch keinem Fahrzeug zugewiesen — erst nach dem Binden im Ernstfall aktiv.',
      )
    } else {
      setPendingToken(res.retryToken)
      setFehler(res.error)
    }
    setLaeuft(false)
  }

  if (!unterstuetzt) {
    return (
      <SectionCard title="Karte beschreiben (NFC)">
        <p className="text-sm text-claimondo-shield">
          NFC-Beschreiben geht nur auf einem{' '}
          <strong className="text-claimondo-navy">Android-Gerät mit Chrome</strong>. Am Desktop und iPhone ist das
          technisch nicht möglich.
        </p>
        {bridgeQr && (
          <div className="mt-3 flex items-center gap-3">
            <img
              src={bridgeQr}
              alt="QR-Code: diese Seite am Android-Handy öffnen"
              width={90}
              height={90}
              className="rounded-ios-sm"
            />
            <p className="text-sm text-claimondo-ondo">
              Diese Seite am Android-Handy (Chrome) öffnen — QR scannen — dort die Karten beschreiben.
            </p>
          </div>
        )}
      </SectionCard>
    )
  }

  return (
    <SectionCard
      title="Karte beschreiben (NFC)"
      subtitle="Leere Karte auflegen — sie wird beschrieben und optional gleich ans Fahrzeug gebunden."
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-body-xs font-medium text-claimondo-navy">Fahrzeug (optional)</span>
          <select
            value={fahrzeugId}
            onChange={(e) => setFahrzeugId(e.target.value)}
            disabled={laeuft}
            className="w-full rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30"
          >
            <option value="">— nur beschreiben (später binden) —</option>
            {fahrzeuge.map((f) => (
              <option key={f.vehicleId} value={f.vehicleId}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <Button variant="ondo" loading={laeuft} onClick={beschreibe}>
          Karte auflegen &amp; beschreiben
        </Button>

        {erfolg && <p className="text-sm text-success-strong">{erfolg}</p>}
        {fehler && <p className="text-sm text-danger-strong">{fehler}</p>}
      </div>
    </SectionCard>
  )
}
