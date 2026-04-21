// AAR-514: Kleiner Hinweis-Banner für Dispatch-Views die als „Nachschlagen"
// (Read-Only) klassifiziert sind. Macht explizit dass Änderungen im Admin-
// Portal passieren, damit der Dispatcher keine Edit-Funktion sucht.

import { EyeIcon } from 'lucide-react'

export default function ReadOnlyBanner({ message }: { message?: string }) {
  return (
    <div className="flex items-start gap-2 bg-[#EEF3F9] border border-[#7BA3CC]/30 rounded-lg px-3 py-2 text-[11px] text-[#0D1B3E]">
      <EyeIcon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#4573A2]" />
      <p className="leading-relaxed">
        {message ??
          'Nur-Lese-Ansicht — Änderungen an Stammdaten erfolgen im Admin-Portal.'}
      </p>
    </div>
  )
}
