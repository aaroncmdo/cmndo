'use client'

// AAR-289 / AAR-396: Stammdaten-Übersicht für die rechte Spalte der SV-Fallakte.
// AAR-311: SV kann Cardentity Typ-B (15€) nach dem Termin manuell triggern.
// AAR-754 (Phase C): Stammdaten + KB-Kontakt wandern in Shared-Components,
// dieser Wrapper komponiert StammdatenReadSection (mit Cardentity-Slot)
// und FallKontakteCard.

import { CardentityTypBButton } from '@/components/cardentity/CardentityTypBButton'
import { requestCardentityTypBForFallSv } from '../cardentity-actions'
import { StammdatenReadSection } from '@/components/shared/stammdaten'
import { FallKontakteCard } from '@/components/shared/fall-kontakte'

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  fin?: string | null
  hat_vorschaeden?: boolean | null
  eigene_versicherung?: string | null
  eigene_policennr?: string | null
} | null

type Kundenbetreuer = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

export function StammdatenCard({
  lead,
  fall,
  kundenbetreuer,
}: {
  lead: Lead
  fall: Record<string, unknown>
  kundenbetreuer: Kundenbetreuer
}) {
  const fin = (fall.fin_vin as string | null) ?? lead?.fin ?? null
  const hatVorschaeden = lead?.hat_vorschaeden ?? null

  return (
    <div className="space-y-3">
      <StammdatenReadSection
        rolle="sv"
        lead={lead}
        fall={fall}
        fahrzeugFooter={
          <CardentityTypBButton
            action={() => requestCardentityTypBForFallSv(fall.id as string)}
            finVorhanden={!!fin}
            initial={{
              fetchedAt:
                (fall.cardentity_abfrage_am as string | null) ??
                (fall.cardentity_enriched_at as string | null) ??
                null,
              vorschadenVorhanden: hatVorschaeden,
              vorschadenAnzahl: (fall.vorschaden_anzahl as number | null) ?? null,
              letzterVorschadenDatum: (fall.vorschaden_letzter_datum as string | null) ?? null,
            }}
          />
        }
      />

      {kundenbetreuer && (
        <FallKontakteCard
          rolle="sv"
          kundenbetreuer={kundenbetreuer}
        />
      )}
    </div>
  )
}
