'use client'

// P2d-1 (dispatch-config-unify): Dispatcher-spezifische Rich-Renderer fuer
// einzelne Felder der flachen lead-erfassung-Form. DispatchLeadForm fragt vor
// dem generischen FieldRenderer hier an — matched ein Override (via
// hasDispatchFieldOverride aus dem pure keys-Modul), rendert es die
// Rich-Komponente; sonst Fallback auf FieldRenderer. Haelt den GETEILTEN
// FieldRenderer (auch Kunden-Flow!) frei von Dispatcher-Concerns.

import type { ReactNode } from 'react'
import SvDispatchPanel, { type AktiverTermin } from '../SvDispatchPanel'
import type { DispatchOverrideKey } from './dispatch-field-override-keys'

// Kontext den die Dispatcher-Rich-Felder brauchen (von DispatchLeadForm gereicht).
export type DispatchFieldCtx = {
  leadId: string
  hardGateOk: boolean
  hardGateDetails: { q1: boolean; q2: boolean; q3: boolean } | null
  aktiverTermin: AktiverTermin | null
  wunschterminIso: string | null
  wunschterminWochentage: number[] | null
}

// Record<DispatchOverrideKey, …> erzwingt: Map-Keys == Liste im keys-Modul
// (fehlt ein Renderer fuer einen Key, bricht tsc — keine Drift).
const OVERRIDES: Record<DispatchOverrideKey, (ctx: DispatchFieldCtx) => ReactNode> = {
  // Kunde bucht selbst (TerminField/token); Dispatcher schlaegt SV vor + reserviert.
  termin: (ctx) => (
    <SvDispatchPanel
      leadId={ctx.leadId}
      hardGateOk={ctx.hardGateOk}
      hardGateDetails={ctx.hardGateDetails}
      aktiverTermin={ctx.aktiverTermin}
      wunschterminIso={ctx.wunschterminIso}
      wunschterminWochentage={ctx.wunschterminWochentage}
    />
  ),
}

export function renderDispatchFieldOverride(feldKey: string, ctx: DispatchFieldCtx): ReactNode | null {
  const fn = OVERRIDES[feldKey as DispatchOverrideKey]
  return fn ? fn(ctx) : null
}
