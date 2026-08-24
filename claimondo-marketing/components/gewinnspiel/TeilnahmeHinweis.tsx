'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Hinweis auf die automatische Gewinnspiel-Teilnahme (Spec 6.3).
//
// Dass ein Lead automatisch teilnimmt, ist eine Verarbeitung zu einem NEUEN
// Zweck — das braucht einen sichtbaren Hinweis dort, wo abgeschickt wird.
// Stillschweigend geht es nicht.
//
// Der Hinweis wird DYNAMISCH eingeblendet: laeuft keine Kampagne, steht dort
// auch nichts. Ein statischer Text wuerde nach Kampagnenende auf ein
// Gewinnspiel hinweisen, das es nicht mehr gibt — dieselbe Klasse Problem wie
// eine Topbar, die stehen bleibt.
//
// Clientseitig statt serverseitig, damit die Komponente in bestehende
// 'use client'-Formulare passt, ohne deren Server-Grenze umzubauen. Ein kurzer
// Nachlauf ist bei einem Hinweistext unkritisch; er verschiebt kein Layout,
// weil er unterhalb des Absende-Bereichs sitzt.

const KAMPAGNE_API = 'https://app.claimondo.de/api/kampagne/aktiv'

export function TeilnahmeHinweis({ className = '' }: { className?: string }) {
  const [aktiv, setAktiv] = useState(false)
  const [betrag, setBetrag] = useState<number | null>(null)
  const [preiseProTag, setPreiseProTag] = useState<number | null>(null)

  useEffect(() => {
    let abgebrochen = false
    fetch(KAMPAGNE_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { aktiv?: boolean; betragEur?: number; preiseProTag?: number } | null) => {
        if (abgebrochen || !d?.aktiv) return
        setAktiv(true)
        setBetrag(d.betragEur ?? null)
        setPreiseProTag(d.preiseProTag ?? null)
      })
      .catch(() => {
        // Still: ein nicht erreichbarer Kampagnen-Endpunkt darf ein
        // Schadenmeldungs-Formular nicht stoeren.
      })
    return () => {
      abgebrochen = true
    }
  }, [])

  if (!aktiv) return null

  const preis =
    betrag !== null && preiseProTag !== null
      ? `${preiseProTag} × ${betrag.toLocaleString('de-DE')} € Gutschein`
      : 'einen Gutschein'

  return (
    <p className={`text-[11px] leading-relaxed text-claimondo-shield/70 ${className}`}>
      Mit dem Absenden nehmen Sie automatisch an unserem täglichen Gewinnspiel teil (
      {preis}). Die Teilnahme ist kostenlos und für den Ablauf Ihrer Schadenmeldung ohne
      Bedeutung.{' '}
      <Link href="/gewinnspiel/teilnahmebedingungen" className="underline" target="_blank">
        Teilnahmebedingungen
      </Link>
    </p>
  )
}
