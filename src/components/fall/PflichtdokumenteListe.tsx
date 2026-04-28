// CMM-23: Shared Pflichtdokumente-Liste für SV + KB (+ Admin) im Fall.
// Zeigt 1:1 die Slots, die der Kunde im Onboarding sieht — pro Slot
// Status (offen / hochgeladen / später) + Download-Link wenn File da ist.
//
// Anders als der gelbe AuftragDokumenteBanner (zeigt nur offene Slots
// als "Noch einzuholen") ist diese Liste die vollständige Sicht — auch
// die schon hochgeladenen Slots mit Datei-Link, damit der SV/KB sie
// direkt herunterladen kann.

import Link from 'next/link'
import {
  CheckCircle2Icon,
  CircleDotIcon,
  ClockIcon,
  DownloadIcon,
} from 'lucide-react'

export type PflichtSlotForView = {
  slot_id: string
  /** CMM-29: pflichtdokumente.id — wird vom Kunde-Upload-Banner für die
   *  uploadPflichtdokument-Action gebraucht. Null wenn der Slot über
   *  Smart-Filter sichtbar ist aber noch keine pflichtdokumente-Row hat. */
  pflichtdokument_id: string | null
  label: string
  beschreibung: string
  pflicht: boolean
  status: 'offen' | 'erfuellt' | 'spaeter' | 'nicht_relevant'
  /** Liste der hochgeladenen Files für diesen Slot — können mehrere sein
      bei multi_file. Erste = Cover. */
  files: Array<{ name: string; url: string }>
}

function StatusPill({ status, pflicht }: { status: PflichtSlotForView['status']; pflicht: boolean }) {
  if (status === 'erfuellt') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
        <CheckCircle2Icon className="w-3 h-3" /> Hochgeladen
      </span>
    )
  }
  if (status === 'spaeter') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-claimondo-ondo/10 text-claimondo-ondo">
        <ClockIcon className="w-3 h-3" /> Später
      </span>
    )
  }
  // offen
  return (
    <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
      <CircleDotIcon className="w-3 h-3" />
      {pflicht ? 'Pflicht offen' : 'Offen'}
    </span>
  )
}

export default function PflichtdokumenteListe({
  slots,
  title = 'Pflichtdokumente vom Kunden',
}: {
  slots: PflichtSlotForView[]
  title?: string
}) {
  if (slots.length === 0) {
    return null
  }

  const offen = slots.filter((s) => s.status !== 'erfuellt').length

  return (
    <div className="rounded-2xl bg-white border border-claimondo-border p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-claimondo-navy">{title}</p>
        <span className="text-xs text-claimondo-ondo">
          {slots.length - offen} / {slots.length} eingegangen
        </span>
      </div>
      <ul className="space-y-2">
        {slots.map((slot) => (
          <li
            key={slot.slot_id}
            className="rounded-xl border border-claimondo-border bg-[#f8f9fb] p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-claimondo-navy">
                  {slot.label}
                </p>
                {slot.beschreibung && (
                  <p className="text-xs text-claimondo-ondo mt-0.5">
                    {slot.beschreibung}
                  </p>
                )}
              </div>
              <StatusPill status={slot.status} pflicht={slot.pflicht} />
            </div>
            {slot.files.length > 0 && (
              <div className="mt-2 space-y-1">
                {slot.files.map((f, i) => (
                  <Link
                    key={`${slot.slot_id}-${i}`}
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-claimondo-navy hover:text-claimondo-shield bg-white border border-claimondo-border hover:border-claimondo-ondo rounded-lg px-2.5 py-1.5 transition-colors"
                  >
                    <DownloadIcon className="w-3.5 h-3.5" />
                    <span className="truncate max-w-[16rem]">
                      {f.name || 'Datei öffnen'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
