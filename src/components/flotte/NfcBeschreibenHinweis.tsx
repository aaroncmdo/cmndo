'use client'

// Device-bewusster Hinweis fuer das NFC-Beschreiben der Batch-Karten (Admin-Karten-Sektion).
//   Android/Chrome : klare Anleitung "je Karte auf Beschreiben tippen + leere Karte anhalten".
//   Desktop/iPhone : Web-NFC-Schreiben ist unmoeglich (NDEFReader = Android-only) -> Bruecke
//                    "diese Seite am Android oeffnen" + QR der AKTUELLEN URL (im Admin eingeloggt).
// Ersetzt die frueher in NfcKarteBeschreiben verlorene Desktop-Bruecke, jetzt fuer den
// Per-Karten-Schreibweg (NfcKarteSchreibenButton).
import { useEffect, useState } from 'react'
import { nfcVerfuegbar } from '@/lib/schadenkarte/nfc'

export function NfcBeschreibenHinweis() {
  // null = vor Mount (SSR-safe, kein Hydration-Mismatch, s. nfcVerfuegbar-Kommentar).
  const [unterstuetzt, setUnterstuetzt] = useState<boolean | null>(null)
  const [bridgeQr, setBridgeQr] = useState<string | null>(null)

  useEffect(() => {
    const ok = nfcVerfuegbar()
    setUnterstuetzt(ok)
    if (!ok && typeof window !== 'undefined') {
      void (async () => {
        try {
          const { default: QRCode } = await import('qrcode')
          setBridgeQr(await QRCode.toDataURL(window.location.href, { margin: 1, width: 140 }))
        } catch {
          setBridgeQr(null)
        }
      })()
    }
  }, [])

  if (unterstuetzt === null) return null

  if (unterstuetzt) {
    return (
      <div className="mb-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
        <p className="text-body-sm font-medium text-claimondo-navy">📶 NFC-Karte beschreiben</p>
        <p className="mt-0.5 text-caption text-claimondo-ondo/70">
          Tippen Sie in der Tabelle bei einer Karte auf „NFC-Karte beschreiben" und halten Sie eine
          <strong className="text-claimondo-navy"> leere</strong> Karte an die Rückseite des Handys. Jede Karte erhält
          so ihren <strong className="text-claimondo-navy">eindeutigen</strong> Code auf den Chip.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
      <p className="text-body-sm font-medium text-claimondo-navy">📶 NFC-Karten beschreiben — nur am Android-Handy</p>
      <p className="mt-0.5 text-caption text-claimondo-ondo/70">
        Web-NFC-Schreiben geht nur am <strong className="text-claimondo-navy">Android-Handy</strong> (Chrome). Öffnen Sie
        diese Seite dort (im Admin-Portal eingeloggt) — dann erscheint bei jeder Karte der Button „NFC-Karte beschreiben".
        Das Binden ans Fahrzeug + der QR-Code funktionieren auch ohne NFC.
      </p>
      {bridgeQr && (
        <div className="mt-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bridgeQr} alt="QR-Code: diese Seite am Android-Handy öffnen" width={80} height={80} className="rounded-ios-sm" />
          <span className="text-caption text-claimondo-ondo/60">QR scannen → Seite am Handy öffnen.</span>
        </div>
      )}
    </div>
  )
}
