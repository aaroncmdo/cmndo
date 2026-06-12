'use client'

// AAR-956 Dead-Pin-Fallback — Lite-Karte (Consumer-UI). Erscheint NUR wenn die Engine
// 0 buchbare Partner liefert (planeTerminMitFallback → kind 'fallback'). „Abgespeckte"
// Partner-Karte: KEIN Name/Profil/Reviews (leak-safe, sv_leads = unclaimter Import) — nur
// „Kfz-Gutachter in {ort}" + generische Immer-frei-Slots.
//
// AAR-956 Reorder (Aaron 12.06.): Termin = Schritt 2 (vor Kontakt) → SELECT-Mode. Ein
// Slot-Klick WÄHLT den Termin (onSelectSlot) und der Wizard geht weiter zu Schaden/Kontakt;
// die echte Reservierung (dispatch_pending) passiert erst beim Kontakt-Submit
// (reserviereEmbedTermin). Der Karten-Kopf-Klick (onSelect) hebt den Pin auf der Karte hervor.
// DE-only inline (Embed-Konvention), Slot-Look konsistent zu SvSlotAuswahl (nahtlos Partner↔Fallback).

import { MapPin } from 'lucide-react'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import type { DeadPinOeffentlich, SlotVorschlag } from '@/lib/sv-matching-modul'

function fmtSlot(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${formatBerlin(iso, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })} Uhr`
}

export function DeadPinSlotStep({
  deadPins,
  onSelectSlot,
  onSelect,
  selectedDeadPinId,
}: {
  deadPins: DeadPinOeffentlich[]
  /** Slot gewählt → Wizard merkt die Auswahl + geht weiter (Reservierung erst am Ende). */
  onSelectSlot: (dp: DeadPinOeffentlich, slot: SlotVorschlag) => void
  /** Karten-Kopf geklickt → Karte routet zum Dead-Pin + hebt ihn hervor (optional). */
  onSelect?: (dp: DeadPinOeffentlich) => void
  selectedDeadPinId?: string | null
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Verfügbare Gutachter in Ihrer Nähe</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Wählen Sie einen Wunschtermin — wir bestätigen ihn in Kürze.
        </p>
      </div>
      {deadPins.map((dp) => {
        const selektiert = !!onSelect && selectedDeadPinId === dp.deadPinId
        const kopf = (
          <>
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-claimondo-bg text-claimondo-ondo">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-claimondo-navy">
                Kfz-Gutachter{dp.ort ? ` in ${dp.ort}` : ' in Ihrer Nähe'}
              </p>
              <p className="text-[0.75rem] text-claimondo-shield/70">{dp.distanzGerundet}</p>
            </div>
          </>
        )
        return (
          <div
            key={dp.deadPinId}
            className={`rounded-ios-md border bg-white/70 p-4 ${selektiert ? 'border-claimondo-ondo ring-2 ring-claimondo-ondo ring-offset-1' : 'border-claimondo-border'}`}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(dp)}
                className="mb-2 flex w-full items-center gap-2 text-left"
              >
                {kopf}
              </button>
            ) : (
              <div className="mb-2 flex items-center gap-2">{kopf}</div>
            )}
            {dp.slots.length === 0 ? (
              <p className="text-[0.8125rem] text-claimondo-shield/60">
                Aktuell keine freien Zeiten — wir melden uns telefonisch.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {dp.slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => onSelectSlot(dp, slot)}
                    className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy transition hover:border-claimondo-ondo hover:bg-claimondo-bg"
                  >
                    {fmtSlot(slot.start)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
