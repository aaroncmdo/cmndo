'use client'

import { useState } from 'react'
import { renderRich } from '@/lib/text'

// CLIENT-Sub-Komponente fuer Schritt 4 (Mietwagen oder Geld). Der "i"-Button
// klappt ein Info-Panel mit dem Nutzungsausfall-Hinweis auf/zu (Mock Z528-533).
// Klick-Tracking laeuft delegiert ueber SiteScripts — kein onClick-Tracking hier.
export function NutzungsausfallTooltip({ info }: { info: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-0.5 inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-petrol/10 text-petrol text-[10px] font-bold hover:bg-petrol hover:text-white transition align-middle"
        aria-label="Mehr Infos zum Nutzungsausfall"
        aria-expanded={open}
      >
        i
      </button>
      {open && (
        <div className="mt-2.5 max-w-[260px] mx-auto p-3 rounded-xl bg-petrol-tint border border-border text-[12px] text-secondary leading-snug text-left">
          {renderRich(info)}
        </div>
      )}
    </>
  )
}
