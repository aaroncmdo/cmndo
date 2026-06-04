'use client'

// AAR-956 §3a: Geteilte SV-Slot-Auswahl (SV-Karten + Slot-Buttons). Präsentational +
// aktionsfrei — von /anfrage (TerminBuchungClient) UND /flow (incomplete-Slot-Step)
// genutzt, damit der Slot-Picker nicht doppelt gepflegt wird (Phase C deprecatet
// /anfrage). Match-/Buchungs-Logik liegt beim Consumer.

import { useTranslations } from 'next-intl'
import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import { Card } from '@/components/primitives/Card'
import type { OeffentlichesSvProfil, SlotVorschlag } from '@/lib/sv-matching-modul/types'
import { formatBerlin } from '@/lib/google-calendar/timezone'

// AAR-956 TZ: slot.start ist ein echter UTC-Instant -> explizit Berlin formatieren
// (sonst browser-TZ-abhaengig). uhrSuffix kommt lokalisiert vom Consumer
// (selfService.slot.uhr_suffix — DE "Uhr", EN "h", sonst leer; Glossar).
function fmtSlot(iso: string, uhrSuffix: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const formatted = formatBerlin(iso, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return uhrSuffix ? `${formatted} ${uhrSuffix}` : formatted
}

export function SvSlotAuswahl({
  svs,
  fehler,
  onSlot,
}: {
  svs: OeffentlichesSvProfil[]
  fehler: string | null
  onSlot: (sv: OeffentlichesSvProfil, slot: SlotVorschlag) => void
}) {
  const t = useTranslations('selfService')
  const uhrSuffix = t('slot.uhr_suffix')
  return (
    <div className="max-w-lg w-full">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-1 text-center">
        {t('slot.heading')}
      </h1>
      <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
        {t('slot.sub')}
      </p>
      {fehler && <p className="text-claimondo-navy/70 text-sm mb-4 text-center">{fehler}</p>}
      <div className="flex flex-col gap-4">
        {svs.map((sv, i) => (
          <Card key={sv.svId} p={5} radius="lg">
            <div data-testid={`buchung-sv-${i}`} className="flex items-center gap-3 mb-3">
              {sv.profilbild ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sv.profilbild} alt={sv.vorname} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-claimondo-bg flex items-center justify-center text-claimondo-navy font-semibold">
                  {sv.vorname.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-claimondo-navy">{sv.vorname}</span>
                  {i === 0 && (
                    <span className="text-[11px] font-semibold text-claimondo-ondo">{t('slot.empfohlen')}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-claimondo-navy/60">
                  <span>{sv.distanzGerundet}</span>
                  <GoogleBewertungBadge
                    durchschnitt={sv.bewertungDurchschnitt}
                    anzahl={sv.bewertungAnzahl}
                    zuletztAktualisiert={sv.bewertungAktualisiert}
                    size="sm"
                  />
                </div>
              </div>
            </div>
            {sv.profilbeschreibung && (
              <p className="text-sm text-claimondo-navy/60 mb-3 line-clamp-2">{sv.profilbeschreibung}</p>
            )}
            {sv.slots.length === 0 ? (
              <p className="text-sm text-claimondo-navy/50">{t('slot.keine_termine')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sv.slots.map((slot) => (
                  <button
                    key={slot.start}
                    type="button"
                    data-testid={`buchung-slot-${sv.svId}-${slot.start}`}
                    onClick={() => onSlot(sv, slot)}
                    className="rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy transition hover:border-claimondo-ondo hover:bg-claimondo-bg"
                  >
                    {fmtSlot(slot.start, uhrSuffix)}
                    {slot.matchType === 'wunschtermin' && (
                      <span className="ml-1 text-[10px] font-semibold text-claimondo-ondo">{t('slot.wunschzeit')}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
