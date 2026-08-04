'use client'

// C4b (Fundament „Eine Akte"): die SV-Content-Zone fuer <FallAkte layout='stack'>. 1:1 aus
// FallDetailClient extrahiert (grid Stammdaten|Doks + Vorschaeden + Gutachten + Werte + Copilot +
// Chat) — behavior-preserving. STABILE Komponente (eigenes File, kein inline-Closure), damit
// useGeoTracking-Re-Renders von FallDetailClient sie nicht remounten (Chat/Copilot-State bleibt).

import { type ComponentProps } from 'react'
import StammdatenAccordion from '@/components/fall/StammdatenAccordion'
import { GutachtenCard } from './GutachtenCard'
import { GutachtenWerteCard } from './GutachtenWerteCard'
import WeitereDokumenteCard from '@/components/gutachter/WeitereDokumenteCard'
import AnsprechpartnerCard from './AnsprechpartnerCard'
import { FinNachtragenCard } from './FinNachtragenCard'
import { GutachterCopilotPanel } from '@/components/gutachter/GutachterCopilotPanel'
import { ClaimChatPanel } from '@/components/chat/ClaimChatPanel'
import type { TeamMitglied } from './FallakteDrawer'
import type { FallDokumentRow } from '@/components/faelle/FallDokumenteSidebar'

type Lead = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

export type SvContentVm = {
  fall: Record<string, unknown>
  lead: Lead
  parteien: Record<string, unknown>[]
  dokumente: Record<string, unknown>[]
  team: TeamMitglied[]
  sichtbarFallDokumente: FallDokumentRow[] | undefined
  fallNummer: string
  subphase: ComponentProps<typeof GutachtenCard>['subphase']
  gutachtenWerte: {
    gutachten_datum: string | null
    reparaturkosten_netto: number | null
    reparaturkosten_brutto: number | null
    minderwert: number | null
    wiederbeschaffungswert: number | null
    restwert: number | null
    nutzungsausfall_tage: number | null
    gutachten_sv_honorar_brutto: number | null
    gutachten_nutzungsausfall_tagessatz_eur: number | null
    wiederbeschaffungsdauer_tage: number | null
    totalschaden: boolean | null
    gutachten_ocr_manuell_ueberschrieben: boolean | null
  } | null
  currentUserId: string | null
}

export function SvContentZone({ vm }: { vm: SvContentVm }) {
  const { fall, lead, parteien, dokumente, team, sichtbarFallDokumente, fallNummer, subphase, gutachtenWerte, currentUserId } = vm
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* CMM-32 Walkthrough: Stammdaten-Block links, Dokumente rechts daneben. Mobile: stacked. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 sm:gap-6">
        <StammdatenAccordion
          data={{
            fall,
            lead,
            parteien,
            dokumenteAnzahl: (dokumente ?? []).length,
          }}
        />
        <div className="space-y-4">
          {/* S1: FIN-Nachtrag nur wenn die FIN fehlt — sonst zeigt StammdatenAccordion sie read-only. */}
          {!fall.fin_vin && <FinNachtragenCard fallId={fall.id as string} />}
          <WeitereDokumenteCard
            fallId={fall.id as string}
            dokumente={(dokumente ?? []).map((d) => ({
              id: String(d.id),
              dokument_typ: (d.typ as string | null) ?? null,
              datei_url: (d.datei_url as string | null) ?? null,
              datei_name: (d.datei_name as string | null) ?? null,
              hochgeladen_von_rolle: (d.hochgeladen_von_rolle as string | null) ?? null,
              created_at: (d.created_at as string | null) ?? null,
              storage_path: ((d as { storage_path?: string | null }).storage_path) ?? null,
            }))}
          />
          <AnsprechpartnerCard team={team} />
        </div>
      </div>

      {!!fall.hat_vorschaeden && (
        <div className="rounded-2xl bg-warning-soft/40 border border-warning/30 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-ios-xl bg-warning-soft text-warning-strong flex items-center justify-center flex-shrink-0">
              <span className="text-lg">⚠️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-claimondo-navy">
                Vorschäden gemeldet
              </p>
              <p className="text-xs text-claimondo-ondo mt-1">
                Der Kunde hat{' '}
                <span className="font-medium text-claimondo-navy">
                  {fall.vorschaden_anzahl != null
                    ? `${String(fall.vorschaden_anzahl)} Vorschäden`
                    : 'Vorschäden'}
                </span>{' '}
                am Fahrzeug angegeben. Reparaturrechnungen werden — falls
                vorhanden — über den gelben Banner mit nachgereicht.
              </p>
            </div>
          </div>
        </div>
      )}

      <GutachtenCard
        fallId={fall.id as string}
        fallNummer={fallNummer}
        subphase={subphase}
        gutachten={
          (sichtbarFallDokumente ?? [])
            .filter((d) => d.dokument_typ === 'gutachten')
            .map((d) => ({
              id: d.id,
              dokument_typ: d.dokument_typ,
              storage_path: d.storage_path,
              original_filename: d.original_filename,
              hochgeladen_am: d.hochgeladen_am,
            }))
        }
        extracted={gutachtenWerte ?? null}
      />

      {gutachtenWerte && (
        <GutachtenWerteCard
          fallId={fall.id as string}
          werte={{
            reparaturkosten_netto: gutachtenWerte.reparaturkosten_netto,
            reparaturkosten_brutto: gutachtenWerte.reparaturkosten_brutto,
            minderwert: gutachtenWerte.minderwert,
            wiederbeschaffungswert: gutachtenWerte.wiederbeschaffungswert,
            restwert: gutachtenWerte.restwert,
            nutzungsausfall_tage: gutachtenWerte.nutzungsausfall_tage,
            gutachten_nutzungsausfall_tagessatz_eur: gutachtenWerte.gutachten_nutzungsausfall_tagessatz_eur,
            wiederbeschaffungsdauer_tage: gutachtenWerte.wiederbeschaffungsdauer_tage,
            totalschaden: gutachtenWerte.totalschaden,
          }}
          manuellUeberschrieben={gutachtenWerte.gutachten_ocr_manuell_ueberschrieben ?? false}
        />
      )}

      {/* KI-Copilot: technisch-fachlicher Assistent. Streaming via /api/gutachter/copilot. */}
      <GutachterCopilotPanel fallId={fall.id as string} />

      {/* Fall-Chat: kanonischer Gruppen-Thread (istStaff=false -> Kunde-Gruppe + DMs). */}
      {currentUserId && (
        <div>
          <h3 className="text-heading-sm font-semibold text-claimondo-navy mb-2 px-1">
            Fall-Chat
          </h3>
          <div className="h-[60vh] min-h-0 overflow-hidden rounded-ios-xl border border-claimondo-border bg-white">
            <ClaimChatPanel
              claimId={(fall.claim_id as string | null) ?? (fall.id as string)}
              currentUserId={currentUserId}
              istStaff={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
