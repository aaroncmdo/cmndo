'use client'

// AAR-956 Dead-Pin-Fallback — Lite-Karte (Consumer-UI). Erscheint NUR wenn die Engine
// 0 buchbare Partner liefert (FlowSlotStep.onKeinMatch). „Abgespeckte" Partner-Karte:
// KEIN Name/Profil/Reviews (leak-safe, sv_leads = unclaimter Import) — nur
// „Kfz-Gutachter in {ort}" + generische Immer-frei-Slots. Buchung reserviert einen
// dispatch_pending sv_lead-Termin (Dispatch koordiniert manuell); der SV wird NIE
// benachrichtigt, Kunde+Team schon (macht der Parent). DE-only inline (Embed-Konvention),
// Slot-Look konsistent zu SvSlotAuswahl (nahtlos Partner↔Fallback).

import { useState } from 'react'
import { MapPin, CheckCircle2 } from 'lucide-react'
import { formatBerlin } from '@/lib/google-calendar/timezone'
import type { DeadPinOeffentlich } from '@/lib/sv-matching-modul'

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
  onBook,
  onSelect,
  selectedDeadPinId,
}: {
  deadPins: DeadPinOeffentlich[]
  /** Reserviert den generischen Slot (→ dispatch_pending). Der Parent hält den Token. */
  onBook: (deadPinId: string, startIso: string) => Promise<{ ok: boolean; error?: string }>
  // AAR-956 #4 (Aaron 12.06.): Dead-Pin-Karte auswählbar → die Embed-Karte routet dorthin +
  // hebt den Pin hervor. Optional/additiv (Buchung läuft weiter über die Slot-Buttons).
  onSelect?: (dp: DeadPinOeffentlich) => void
  selectedDeadPinId?: string | null
}) {
  const [pending, setPending] = useState<string | null>(null) // "deadPinId|startIso" in flight
  const [fehler, setFehler] = useState<string | null>(null)
  const [gebucht, setGebucht] = useState<{ ort: string | null; startIso: string } | null>(null)

  async function waehlen(dp: DeadPinOeffentlich, startIso: string) {
    setPending(`${dp.deadPinId}|${startIso}`)
    setFehler(null)
    const r = await onBook(dp.deadPinId, startIso)
    setPending(null)
    if (!r.ok) {
      setFehler(r.error ?? 'Die Reservierung hat nicht geklappt. Bitte erneut versuchen.')
      return
    }
    setGebucht({ ort: dp.ort, startIso })
  }

  if (gebucht) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <h3 className="text-body font-bold text-claimondo-navy">Termin reserviert</h3>
        <p className="text-[0.8125rem] leading-relaxed text-claimondo-shield/80">
          Ihr Kfz-Gutachter{gebucht.ort ? ` in ${gebucht.ort}` : ''} ist für{' '}
          {new Date(gebucht.startIso).toLocaleString('de-DE', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}{' '}
          Uhr vorgemerkt. Wir bestätigen Ihren Termin in Kürze.
        </p>
      </div>
    )
  }

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
                {dp.slots.map((slot) => {
                  const key = `${dp.deadPinId}|${slot.start}`
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void waehlen(dp, slot.start)}
                      className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy transition hover:border-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
                    >
                      {pending === key ? 'Wird reserviert…' : fmtSlot(slot.start)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      {fehler && (
        <p className="rounded-ios-md bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger-strong">{fehler}</p>
      )}
    </div>
  )
}
