// CMM-33: Read-only Hinweis-Banner für den SV — listet nur die offenen
// Pflicht-Slots als „vor Ort einzusammeln". Kein Status-Pill, kein
// Download-Link, kein Upload — der SV soll auf einen Blick sehen welche
// Unterlagen er beim Termin mitbringen / einsammeln muss. Hochgeladene
// Files sind in der Dokumente-Sektion unten (WeitereDokumenteCard) sichtbar.
//
// Banner verschwindet automatisch wenn alle Pflicht-Slots erfüllt sind —
// wir wollen kein „grünes Erfolgs-Banner", einfach ausblenden.

import { ClipboardListIcon } from 'lucide-react'
import type { PflichtSlotForView } from '@/components/fall/PflichtdokumenteSection'

export default function SvEinzuholenBanner({
  slots,
  title = 'Vor Ort einzusammeln',
}: {
  slots: PflichtSlotForView[]
  title?: string
}) {
  // Nur offene Pflicht-Slots zeigen. Optionale Slots werden in der
  // Dokumente-Sektion unten verwaltet.
  const offenePflicht = slots.filter((s) => s.pflicht && s.status !== 'erfuellt')
  if (offenePflicht.length === 0) return null

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 h-full">
      <div className="flex items-start gap-3">
        <ClipboardListIcon className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">{title}</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Diese Unterlagen sind noch offen — beim Termin mitnehmen oder
            mit dem Kunden klären.
          </p>
          <ul className="mt-3 space-y-1.5">
            {offenePflicht.map((slot) => (
              <li key={slot.slot_id} className="text-sm text-claimondo-navy">
                <span className="font-medium">{slot.label}</span>
                {slot.beschreibung && (
                  <span className="text-xs text-claimondo-ondo">
                    {' — '}
                    {slot.beschreibung}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
