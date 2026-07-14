'use client'

// Sichtbarer Such-Trigger fuer Portale ohne bequemes Cmd+K (v.a. mobil/Kunde).
// Dispatcht ein globales Event, das die Spotlight-Palette oeffnet — entkoppelt vom
// Spotlight-Mount-Ort. Ghost-Icon-Button (KEIN Primaer-CTA -> component-set-safe).
import { SearchIcon } from 'lucide-react'

export function SearchTriggerButton({
  className,
  label = 'Suche öffnen',
}: {
  className?: string
  label?: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => window.dispatchEvent(new Event('claimondo:open-search'))}
      className={
        className ??
        'inline-flex items-center justify-center rounded-ios-md p-2 text-claimondo-light-blue transition-colors hover:bg-white/5 hover:text-white'
      }
    >
      <SearchIcon style={{ width: 18, height: 18 }} />
    </button>
  )
}
