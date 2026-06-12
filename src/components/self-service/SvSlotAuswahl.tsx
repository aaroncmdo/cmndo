'use client'

// AAR-956 §3a: Geteilte SV-Slot-Auswahl (SV-Karten + Slot-Buttons). Präsentational +
// aktionsfrei — von /anfrage (TerminBuchungClient) UND /flow (incomplete-Slot-Step)
// genutzt, damit der Slot-Picker nicht doppelt gepflegt wird (Phase C deprecatet
// /anfrage). Match-/Buchungs-Logik liegt beim Consumer.

import { useTranslations } from 'next-intl'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  onSvSelect,
  selectedSvId,
}: {
  svs: OeffentlichesSvProfil[]
  fehler: string | null
  onSlot: (sv: OeffentlichesSvProfil, slot: SlotVorschlag) => void
  // AAR-956 #4 (Embed, Aaron 12.06.): SV-Karte auswählbar → die Embed-Karte routet zum
  // gewählten SV + hebt ihn hervor. Optional/additiv — ohne die Props (z.B. /flow, /anfrage)
  // bleibt die Karte unveraendert (Kopf nicht klickbar, keine Hervorhebung).
  onSvSelect?: (sv: OeffentlichesSvProfil) => void
  selectedSvId?: string | null
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
        {svs.map((sv, i) => {
          const embedMode = !!onSvSelect
          const selektiert = embedMode && selectedSvId === sv.svId
          // AAR-956 (Aaron 12.06.): der empfohlene Gutachter (#1) wird im Embed als navy-glassy
          // Card hervorgehoben (glass='dark'); Inhalt dann in Weiß. /flow (kein embedMode) bleibt
          // unverändert (weiße Card, Ondo-„Empfohlen"-Text).
          const dunkel = embedMode && i === 0
          const kopf = (
            <>
              {sv.profilbild ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sv.profilbild} alt={sv.vorname} className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className={cn(
                  'h-12 w-12 rounded-full flex items-center justify-center font-semibold',
                  dunkel ? 'bg-white/15 text-white' : 'bg-claimondo-bg text-claimondo-navy',
                )}>
                  {sv.vorname.charAt(0)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={cn('font-semibold', dunkel ? 'text-white' : 'text-claimondo-navy')}>{sv.vorname}</span>
                  {i === 0 && (
                    embedMode ? (
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                        dunkel ? 'bg-white/90 text-claimondo-navy' : 'bg-claimondo-navy text-white',
                      )}>
                        {t('slot.empfohlen')}
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold text-claimondo-ondo">{t('slot.empfohlen')}</span>
                    )
                  )}
                  {selektiert && (
                    <span className={cn('ml-auto inline-flex items-center gap-1 text-[11px] font-bold', dunkel ? 'text-white' : 'text-claimondo-navy')}>
                      <Check className="h-3.5 w-3.5" /> Ausgewählt
                    </span>
                  )}
                </div>
                <div className={cn('flex items-center gap-2 text-sm', dunkel ? 'text-white/70' : 'text-claimondo-navy/60')}>
                  <span>{sv.distanzGerundet}</span>
                  {dunkel ? (
                    <span className="rounded-full bg-white/90 px-1.5 py-0.5">
                      <GoogleBewertungBadge
                        durchschnitt={sv.bewertungDurchschnitt}
                        anzahl={sv.bewertungAnzahl}
                        zuletztAktualisiert={sv.bewertungAktualisiert}
                        size="sm"
                      />
                    </span>
                  ) : (
                    <GoogleBewertungBadge
                      durchschnitt={sv.bewertungDurchschnitt}
                      anzahl={sv.bewertungAnzahl}
                      zuletztAktualisiert={sv.bewertungAktualisiert}
                      size="sm"
                    />
                  )}
                </div>
              </div>
            </>
          )
          return (
            <Card
              key={sv.svId}
              p={5}
              radius="lg"
              glass={dunkel ? 'dark' : undefined}
              // Auswahl-Outline NUR auf weißen Karten (die navy-glassy #1 ist eh hervorgehoben).
              // outline statt ring, weil Card inline boxShadow den Tailwind-ring schluckt.
              className={selektiert && !dunkel ? 'outline outline-2 outline-offset-2 outline-claimondo-navy' : undefined}
            >
              {onSvSelect ? (
                <button
                  type="button"
                  data-testid={`buchung-sv-${i}`}
                  onClick={() => onSvSelect(sv)}
                  className="mb-3 flex w-full items-center gap-3 text-left"
                >
                  {kopf}
                </button>
              ) : (
                <div data-testid={`buchung-sv-${i}`} className="flex items-center gap-3 mb-3">
                  {kopf}
                </div>
              )}
              {sv.profilbeschreibung && (
                <p className={cn('text-sm mb-3 line-clamp-2', dunkel ? 'text-white/70' : 'text-claimondo-navy/60')}>{sv.profilbeschreibung}</p>
              )}
              {sv.slots.length === 0 ? (
                <p className={cn('text-sm', dunkel ? 'text-white/60' : 'text-claimondo-navy/50')}>{t('slot.keine_termine')}</p>
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
          )
        })}
      </div>
    </div>
  )
}
