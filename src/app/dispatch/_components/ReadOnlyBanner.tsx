// AAR-514: Kleiner Hinweis-Banner für Dispatch-Views die als „Nachschlagen"
// (Read-Only) klassifiziert sind. Macht explizit dass Änderungen im Admin-
// Portal passieren, damit der Dispatcher keine Edit-Funktion sucht.

import { EyeIcon } from 'lucide-react'

export default function ReadOnlyBanner({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 bg-claimondo-ondo/[0.06] border border-claimondo-light-blue/30 rounded-lg px-3 py-2 text-[11px] text-claimondo-navy">
      <EyeIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-claimondo-ondo" />
      <p className="leading-relaxed">
        {message ??
          'Nur-Lese-Ansicht — Änderungen an Stammdaten erfolgen im Admin-Portal.'}
      </p>
    </div>
  )
}
