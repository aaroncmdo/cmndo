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

  return (
    <div
      role="region"
      aria-label="Hinweis zur Reichweitenmessung"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-ios-md border border-au-sand-dark bg-au-surface p-4 text-sm text-au-ink shadow-au-lg sm:p-5"
    >
      <p className="leading-relaxed">
        Wir nutzen <strong>Microsoft Clarity</strong> (Heatmaps, maskierte
        Sitzungsanalyse), um diese Seite zu verbessern — auf Grundlage berechtigten
        Interesses. Sie können jederzeit widersprechen (Opt-out) über{' '}
        „Cookie-Einstellungen“ im Seitenfuß. Mehr in der{' '}
        <Link href="/datenschutz" className="underline">
          Datenschutzerklärung
        </Link>
        .
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            ackClarityNotice()
            setShowNotice(false)
          }}
          className="rounded-ios-md bg-au-ink px-4 py-2 text-sm font-medium text-au-surface"
        >
          Verstanden
        </button>
        <button
          type="button"
          onClick={() => {
            setClarityOptOut(true)
            window.location.reload()
          }}
          className="rounded-ios-md border border-au-sand-dark px-4 py-2 text-sm font-medium text-au-ink"
        >
          Ablehnen
        </button>
      </div>
    </div>
  )
}
