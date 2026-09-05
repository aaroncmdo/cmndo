'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { SITE } from '@/lib/site'
import { ackClarityNotice, hasSeenClarityNotice, isClarityOptedOut, setClarityOptOut } from '@/lib/clarity'

// Microsoft Clarity — Opt-out-Modell (Art. 6 Abs. 1 lit. f): Clarity startet
// sofort, sofern kein Widerspruch vorliegt. Der Hinweis-Banner informiert beim
// ersten Besuch (KEIN Gate); Widerspruch jederzeit ueber "Cookie-Einstellungen"
// im Footer. Plausible (cookielos) ist davon unberuehrt.
// Init via dynamischem Import in einer geschachtelten async-Funktion — kein
// Top-Level-Import (SSR-sicher) und kein setState im Effekt-Body.
export function ClarityAnalytics() {
  const [showNotice, setShowNotice] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function setup() {
      const optedOut = isClarityOptedOut()
      const projectId = SITE.clarityProjectId
      if (!optedOut && projectId) {
        try {
          const { default: Clarity } = await import('@microsoft/clarity')
          Clarity.init(projectId)
        } catch {
          /* Clarity geblockt/nicht ladbar — nie crashen */
        }
      }
      if (!cancelled && !optedOut && !hasSeenClarityNotice()) {
        setShowNotice(true)
      }
    }
    void setup()
    return () => {
      cancelled = true
    }
  }, [])

  if (!showNotice) return null

  // Design-Aufnahme 05.09.2026 (Playwright, 390x844): die Karte war 221 px hoch und
  // deckte 25 % des mobilen Viewports ab — auf der Startseite lag sie ueber der
  // Sektionsueberschrift, auf Desktop ueber den Werkzeug-Karten (elementFromPoint traf
  // den Hinweis statt "Unfall-Assistance"/"Kuerzungs-Checker"). Jetzt eine schmale
  // Leiste am unteren Rand: ein Satz, zwei Knoepfe daneben, Text 12/14 px.
  return (
    <div
      role="region"
      aria-label="Hinweis zur Reichweitenmessung"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-au-sand-dark bg-au-surface px-4 py-3 text-xs text-au-ink shadow-au-lg sm:text-sm"
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 leading-snug">
          Wir nutzen <strong>Microsoft Clarity</strong> (Heatmaps, maskierte
          Sitzungsanalyse), um diese Seite zu verbessern — auf Grundlage berechtigten
          Interesses. Widerspruch jederzeit über „Cookie-Einstellungen“ im Seitenfuß.{' '}
          <Link href="/datenschutz" className="underline">
            Datenschutzerklärung
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => {
              ackClarityNotice()
              setShowNotice(false)
            }}
            className="min-h-10 rounded-ios-md bg-au-ink px-4 py-2 text-sm font-medium text-au-surface"
          >
            Verstanden
          </button>
          <button
            type="button"
            onClick={() => {
              setClarityOptOut(true)
              window.location.reload()
            }}
            className="min-h-10 rounded-ios-md border border-au-sand-dark px-4 py-2 text-sm font-medium text-au-ink"
          >
            Ablehnen
          </button>
        </div>
      </div>
    </div>
  )
}
