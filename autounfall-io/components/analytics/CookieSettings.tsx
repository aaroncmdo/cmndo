'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { isClarityOptedOut, setClarityOptOut } from '@/lib/clarity'

// "Cookie-Einstellungen" im Footer — Widerspruch/Opt-out gegen Microsoft Clarity
// (Art. 21 DSGVO). Plausible ist cookielos und nicht betroffen. Das Umschalten
// laedt die Seite neu, damit Clarity sicher (nicht mehr) initialisiert wird.
export function CookieSettings() {
  const [open, setOpen] = useState(false)
  const [optedOut, setOptedOut] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function apply(nextOptOut: boolean) {
    setClarityOptOut(nextOptOut)
    window.location.reload()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOptedOut(isClarityOptedOut())
          setOpen(true)
        }}
        className="text-left transition-colors hover:text-au-surface"
      >
        Cookie-Einstellungen
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cookie-Einstellungen"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-au-ink/60 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-ios-md bg-au-surface p-6 text-left text-au-ink shadow-au-lg">
            <h2 className="font-display text-lg font-bold">Cookie-Einstellungen</h2>
            <p className="mt-3 text-sm leading-relaxed text-au-ink-soft">
              <strong>Reichweitenmessung (Plausible):</strong> cookielos, immer aktiv,
              keine personenbezogenen Daten.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-au-ink-soft">
              <strong>Microsoft Clarity</strong> (Heatmaps, maskierte Sitzungsanalyse) ist
              derzeit <strong>{optedOut ? 'deaktiviert' : 'aktiv'}</strong>. Sie können der
              Verarbeitung jederzeit widersprechen (Art. 21 DSGVO). Details in der{' '}
              <Link href="/datenschutz" className="underline" onClick={() => setOpen(false)}>
                Datenschutzerklärung
              </Link>
              .
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-ios-md border border-au-sand-dark px-4 py-2 text-sm font-medium text-au-ink"
              >
                Schließen
              </button>
              <button
                type="button"
                onClick={() => apply(!optedOut)}
                className="rounded-ios-md bg-au-ink px-4 py-2 text-sm font-medium text-au-surface"
              >
                {optedOut ? 'Clarity aktivieren' : 'Clarity deaktivieren'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
