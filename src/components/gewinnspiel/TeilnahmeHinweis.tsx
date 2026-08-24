'use client'

import { useEffect, useState } from 'react'

// Hinweis auf die automatische Gewinnspiel-Teilnahme (Spec 6.3) — App-Variante.
//
// Dass ein Lead automatisch teilnimmt, ist eine Verarbeitung zu einem NEUEN
// Zweck und braucht einen sichtbaren Hinweis dort, wo abgeschickt wird.
//
// Warum es diese Komponente ZWEIMAL gibt (hier und in claimondo-marketing):
// Es sind zwei eigenstaendige Next-Builds ohne geteiltes Package. Die
// Alternative waere ein Shared-Paket nur fuer 40 Zeilen Markup — der Aufwand
// stuende in keinem Verhaeltnis. Beide Fassungen sind bewusst klein und lesen
// dieselbe Quelle (/api/kampagne/aktiv), damit sie nicht inhaltlich driften
// koennen: aendert sich der Betrag, aendern sich beide automatisch.
//
// Blendet sich NUR ein, wenn tatsaechlich eine Kampagne laeuft. Ein statischer
// Text wuerde nach Kampagnenende auf ein Gewinnspiel hinweisen, das es nicht
// mehr gibt.
//
// Relativer Pfad, anders als im Marketing-Build: die Route liegt in DIESER App.

const KAMPAGNE_API = '/api/kampagne/aktiv'

export function TeilnahmeHinweis({ className = '' }: { className?: string }) {
  const [text, setText] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    fetch(KAMPAGNE_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { aktiv?: boolean; betragEur?: number; preiseProTag?: number } | null) => {
        if (abgebrochen || !d?.aktiv) return
        const preis =
          d.betragEur && d.preiseProTag
            ? `${d.preiseProTag} × ${d.betragEur.toLocaleString('de-DE')} € Gutschein`
            : 'einen Gutschein'
        setText(
          `Mit dem Absenden nehmen Sie automatisch an unserem täglichen Gewinnspiel teil (${preis}). ` +
            'Kostenlos und ohne Einfluss auf Ihre Schadenmeldung.',
        )
      })
      .catch(() => {
        // Still: ein nicht erreichbarer Kampagnen-Endpunkt darf eine
        // Schadenmeldung nicht stoeren.
      })
    return () => {
      abgebrochen = true
    }
  }, [])

  if (!text) return null

  return (
    <p className={`text-[0.6875rem] leading-relaxed text-claimondo-shield/70 ${className}`}>
      {text}{' '}
      <a
        href="https://claimondo.de/gewinnspiel/teilnahmebedingungen"
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        Teilnahmebedingungen
      </a>
    </p>
  )
}
