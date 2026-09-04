'use client'

// P2d-1/P2d-2 (dispatch-config-unify): Dispatcher-spezifische Rich-Renderer fuer
// einzelne Felder der flachen lead-erfassung-Form. DispatchLeadForm fragt vor
// dem generischen FieldRenderer hier an — matched ein Override (via
// hasDispatchFieldOverride aus dem pure keys-Modul), rendert es die
// Rich-Komponente; sonst Fallback auf FieldRenderer. Haelt den GETEILTEN
// FieldRenderer (auch Kunden-Flow!) frei von Dispatcher-Concerns.

import type { ReactNode } from 'react'
import SvDispatchPanel, { type AktiverTermin } from '../SvDispatchPanel'
import WerkstattVermittlungPanel from '../WerkstattVermittlungPanel'
import type { OnboardingFeld } from '@/components/onboarding/types'
import type { DispatchOverrideKey } from './dispatch-field-override-keys'
import { DispatchVersichererField } from './DispatchVersichererField'
import { DispatchPlaceField } from './DispatchPlaceField'
import { DispatchKennzeichenField } from './DispatchKennzeichenField'
import { DispatchKaskoTarifField } from './DispatchKaskoTarifField'

// Kontext den die Dispatcher-Rich-Felder brauchen (von DispatchLeadForm gereicht).
export type DispatchFieldCtx = {
  leadId: string
  // Volle Lead-Row als Quelle der Initialwerte fuer die Override-Felder.
  lead: Record<string, unknown>
  // termin/SvDispatchPanel:
  hardGateOk: boolean
  hardGateDetails: { q1: boolean; q2: boolean; q3: boolean } | null
  aktiverTermin: AktiverTermin | null
  wunschterminIso: string | null
  wunschterminWochentage: number[] | null
  // Reparatur-Werkstatt-Vermittlung (Task 5): aktuell zugewiesene Werkstatt.
  currentWerkstatt: { id: string; name: string } | null
}

// Record<DispatchOverrideKey, …> erzwingt: Map-Keys == Liste im keys-Modul
// (fehlt ein Renderer fuer einen Key, bricht tsc — keine Drift).
const OVERRIDES: Record<DispatchOverrideKey, (feld: OnboardingFeld, ctx: DispatchFieldCtx) => ReactNode> = {
  // termin: Kunde bucht selbst (TerminField/token); Dispatcher schlaegt SV vor.
  // Direkt darunter die Reparatur-Werkstatt-Vermittlung (Task 5) — gleicher
  // Termin-Block, weil beides der Dispatcher vor/um den FlowLink-Versand setzt.
  termin: (_feld, ctx) => (
    <div className="space-y-4">
      <SvDispatchPanel
        leadId={ctx.leadId}
        hardGateOk={ctx.hardGateOk}
        hardGateDetails={ctx.hardGateDetails}
        aktiverTermin={ctx.aktiverTermin}
        wunschterminIso={ctx.wunschterminIso}
        wunschterminWochentage={ctx.wunschterminWochentage}
      />
      <WerkstattVermittlungPanel target="lead" id={ctx.leadId} currentWerkstatt={ctx.currentWerkstatt} />
    </div>
  ),
  // gegner_versicherung: Autocomplete aus versicherungen-Stammdaten statt Freitext.
  gegner_versicherung: (feld, ctx) => (
    <DispatchVersichererField feld={feld} leadId={ctx.leadId} lead={ctx.lead} />
  ),
  // Adressen: Google-Place-Autocomplete (Adresse + Koordinaten) statt Freitext.
  besichtigungsort_adresse: (feld, ctx) => (
    <DispatchPlaceField feld={feld} leadId={ctx.leadId} lead={ctx.lead} target="besichtigungsort" />
  ),
  unfallort: (feld, ctx) => (
    <DispatchPlaceField feld={feld} leadId={ctx.leadId} lead={ctx.lead} target="unfallort" />
  ),
  // kennzeichen (Eigen-Fahrzeug): Parts-Editor (Stadt/Kennung/Zahl/Typ) statt Freitext.
  kennzeichen: (feld, ctx) => (
    <DispatchKennzeichenField feld={feld} leadId={ctx.leadId} lead={ctx.lead} />
  ),
  // kunde_strasse (P4-D): Kundenadresse als Place-Autocomplete (Geocoding → kunde_lat/lng).
  kunde_strasse: (feld, ctx) => (
    <DispatchPlaceField feld={feld} leadId={ctx.leadId} lead={ctx.lead} target="kunde" />
  ),
  // Kasko-WB Phase 1: Versicherer/Tarif/Bindung als Rich-Feld (nur bei schuldfrage=eigenverantwortung, siehe onboarding_felder).
  eigene_kasko_tarif: (feld, ctx) => <DispatchKaskoTarifField feld={feld} leadId={ctx.leadId} lead={ctx.lead} />,
}

export function renderDispatchFieldOverride(feld: OnboardingFeld, ctx: DispatchFieldCtx): ReactNode | null {
  const fn = OVERRIDES[feld.feld_key as DispatchOverrideKey]
  return fn ? fn(feld, ctx) : null
}
