'use server'

// 2026-05-11 Funnel v2 PR #4: Datenabhaengiger Onboarding-Loader.
//
// Liest die DB-Lage eines Falls und entscheidet welche onboarding_phasen
// dem Kunden im DynamicWizard noch gezeigt werden — Phasen wo alle
// Pflichtfelder bereits gefuellt sind, werden komplett geskippt.
//
// Datenfluss (siehe docs/plans/funnel-vereinfachung-2026-05-11.md):
//   1. Page laedt ladeNoetigePhasen(fallId)
//   2. Read auf faelle_claim_bridge (nur claim_id/lead_id) + claims + leads + vehicles + fall_documents
//      (CMM-49: faelle-Read schon auf die Bridge migriert — kein from('faelle') mehr)
//   3. Pro Feld pruefen: DB-Wert vorhanden?
//   4. Pro Phase pruefen: alle Pflichtfelder gefuellt? → Phase weglassen
//   5. WizardClient bekommt:
//      - phases:        nur die noch unvollstaendigen Phasen
//      - prefilledValues: alle bekannten Werte fuer pre-fill der Form

import { getLocale } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { localizePhase, localizeFeld } from './localize'
import type { OnboardingPhase, OnboardingFeld, FieldOption, DbTarget, ConditionalOn } from '@/components/onboarding/types'
import { filterFelderByAudience } from './filter-felder-by-audience'
import { sollPhaseGeskipptWerden, resolveHergangFromLead } from './phasen-skip'
import { baueVorbefuellung, type VorbefuellungsDokument } from './baue-vorbefuellung'

export type LoadedWizardState = {
  phases: OnboardingPhase[]
  prefilledValues: Record<string, unknown>
  fallId: string
  // Diagnostik fuer UI-Anzeige ("3 von 8 Phasen schon erledigt durch Dispatcher/OCR")
  totalDefinedPhases: number
  skippedPhases: number
}

/**
 * @param fallId Pflicht — der Fall fuer den der Onboarding-Status berechnet
 *   wird. Auth-Check muss vor dem Aufruf passieren.
 * @param flowKey Welche Phasen-Strecke (default 'kunde-onboarding'). Erweiterbar
 *   fuer SV-Onboarding etc.
 */
export async function ladeNoetigePhasen(
  fallId: string,
  flowKey: string = 'kunde-onboarding',
): Promise<LoadedWizardState> {
  const supabase = createAdminClient()
  const locale = await getLocale()

  // ─── 1. DB-Snapshot: Fall + Claim + Lead + Vehicle + Documents ───────
  // CMM-49 (faelle-Drop-Runway): aus faelle werden hier NUR claim_id + lead_id genutzt
  // (alle übrigen Stammdaten kommen unten aus claims/leads/vehicle). Das select('*') war
  // inert → Anker auf faelle_claim_bridge; lead_id aus claims (SSoT, div=0).
  const { data: fall } = await supabase
    .from('faelle_claim_bridge')
    .select('fall_id, claim_id, claims:claims!fk_bridge_claim(lead_id)')
    .eq('fall_id', fallId)
    .maybeSingle()

  if (!fall) {
    return { phases: [], prefilledValues: {}, fallId, totalDefinedPhases: 0, skippedPhases: 0 }
  }

  const claim_id = (fall as Record<string, unknown>).claim_id as string | null
  const claimsEmbed = (fall as { claims?: unknown }).claims
  const claimRow = Array.isArray(claimsEmbed) ? claimsEmbed[0] : claimsEmbed
  const lead_id = (claimRow as { lead_id?: string | null } | null)?.lead_id ?? null

  const [claimRes, leadRes, docsRes] = await Promise.all([
    claim_id
      ? supabase.from('claims').select('*').eq('id', claim_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead_id
      ? supabase.from('leads').select('*').eq('id', lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // fall_dokumente (nicht fall_documents); Slot-Bezug = pflichtdokument_id, Typ = dokument_typ.
    supabase.from('fall_dokumente').select('dokument_typ, pflichtdokument_id').eq('fall_id', fallId),
  ])

  // Vehicle ueber claim_vehicle_involvements + vehicles
  let vehicle: Record<string, unknown> | null = null
  if (claim_id) {
    const { data: cvi } = await supabase
      .from('claim_vehicle_involvements')
      .select('vehicle_id')
      .eq('claim_id', claim_id)
      .eq('rolle', 'geschaedigter')
      .limit(1)
      .maybeSingle()
    if (cvi?.vehicle_id) {
      const { data: v } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', cvi.vehicle_id as string)
        .maybeSingle()
      vehicle = (v as Record<string, unknown> | null) ?? null
    }
  }

  // ─── 2. Pre-fill-Map: alle DB-Werte unter ihrem feld_key ────────────
  // Praezedenz + Dokument-Ableitung liegen in ./baue-vorbefuellung (pure, unit-getestet).
  // Kern: der Claim schlaegt den Lead — der Lead ist die Erstmeldung, der Claim der
  // laufende Vorgang. Begruendung + prod-Messung im Header jenes Moduls.
  const prefilled: Record<string, unknown> = baueVorbefuellung({
    fall: fall as Record<string, unknown>,
    claim: (claimRes.data ?? null) as Record<string, unknown> | null,
    lead: (leadRes.data ?? null) as Record<string, unknown> | null,
    vehicle,
    dokumente: (docsRes.data ?? []) as VorbefuellungsDokument[],
  })

  // Bug3-dedupe-Edge (Prod-Smoke 28.07.): Claims, deren convertLeadToClaim-Bridge
  // die Hergang-Kopie ausliess, fragten die Erzaehlung hier ERNEUT (leere textarea)
  // obwohl leads.unfallhergang sie traegt. Heilung an der Stelle, wo die Luecke
  // sichtbar wird: dieselbe Kaskade wie die Bridge, idempotent (nur wenn leer),
  // fail-soft (bei Write-Fehler traegt wenigstens prefilled den Wert -> kein
  // Doppel-Ask). FUNDAMENT §1.1: die Wahrheit gehoert an den Claim, nicht nur
  // in die Anzeige.
  if (claim_id && !prefilled['hergang_kunde_text']) {
    const hergangFallback = resolveHergangFromLead(
      (leadRes.data ?? null) as Record<string, unknown> | null,
    )
    if (hergangFallback) {
      prefilled['hergang_kunde_text'] = hergangFallback
      const { error: healErr } = await supabase
        .from('claims')
        .update({ hergang_kunde_text: hergangFallback })
        .eq('id', claim_id)
      if (healErr) {
        console.error('[ladeNoetigePhasen] hergang-Backfill fehlgeschlagen:', healErr.message)
      }
    }
  }

  // ─── 3. Phasen + Felder aus DB laden ────────────────────────────────
  const { data: phasenRows } = await supabase
    .from('onboarding_phasen')
    .select(`
      id, flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on, i18n,
      onboarding_felder (
        id, phase_id, reihenfolge, feld_key, typ, label, hint, placeholder,
        pflicht, optionen, validation, db_target, conditional_on, i18n, audience, sektion
      )
    `)
    .eq('flow_key', flowKey)
    .order('reihenfolge', { ascending: true })

  if (!phasenRows) {
    return { phases: [], prefilledValues: prefilled, fallId, totalDefinedPhases: 0, skippedPhases: 0 }
  }

  // ─── 4. Phasen filtern: Pflichtfelder bereits alle erfuellt? ─────────
  const phasen: OnboardingPhase[] = []
  let skipped = 0

  for (const p of phasenRows) {
    const felderRaw = Array.isArray(p.onboarding_felder) ? p.onboarding_felder : []
    const felder: OnboardingFeld[] = (felderRaw as typeof felderRaw)
      .sort((a: { reihenfolge: number }, b: { reihenfolge: number }) => a.reihenfolge - b.reihenfolge)
      .map((f: {
        id: string; phase_id: string; reihenfolge: number; feld_key: string; typ: string;
        label: string; hint: string | null; placeholder: string | null; pflicht: boolean;
        optionen: unknown; validation: unknown; db_target: unknown; conditional_on: unknown; i18n: unknown;
        audience: unknown; sektion: unknown;
      }) => {
        const loc = localizeFeld(
          { label: f.label, hint: f.hint, placeholder: f.placeholder, optionen: (f.optionen as FieldOption[] | null) ?? null },
          f.i18n,
          locale,
        )
        return {
          id: f.id,
          phase_id: f.phase_id,
          reihenfolge: f.reihenfolge,
          feld_key: f.feld_key,
          typ: f.typ as OnboardingFeld['typ'],
          label: loc.label,
          hint: loc.hint,
          placeholder: loc.placeholder,
          pflicht: f.pflicht,
          optionen: loc.optionen,
          validation: (f.validation as Record<string, unknown> | null) ?? null,
          db_target: f.db_target as DbTarget,
          conditional_on: (f.conditional_on as ConditionalOn | null) ?? null,
          audience: (f.audience as OnboardingFeld['audience']) ?? null,
          sektion: (f.sektion as string | null) ?? null,
        }
      })

    // P0 (dispatch-config-unify): nur kunde-sichtbare Felder im Kunden-Wizard.
    // Default audience='beide' -> in P0 ein No-op (== felder). Ab P1 (wenn Felder
    // auf 'dispatcher' gesetzt werden) sieht der Kunde dispatcher-only-Felder nicht.
    const sichtbareFelder = filterFelderByAudience(felder, 'kunde')

    // Skip-Logik (extrahiert nach ./phasen-skip, unit-getestet): ALLE Pflicht-
    // felder gefuellt (Lookup via feld_key UND db_target.spalte, Funnel v3 PR #9)
    // ODER die Phase hat keine sichtbaren Felder (Bug3-Smoke 28.07.: sonst ist
    // phases.length===0 unerreichbar und der Fallakte-Redirect der
    // onboarding-details-Page toter Code).
    if (sollPhaseGeskipptWerden(sichtbareFelder, prefilled)) {
      skipped++
      continue
    }

    const ploc = localizePhase(
      { titel: p.titel, eyebrow: p.eyebrow ?? null, beschreibung: p.beschreibung ?? null },
      (p as { i18n?: unknown }).i18n,
      locale,
    )
    phasen.push({
      id: p.id,
      flow_key: p.flow_key,
      reihenfolge: p.reihenfolge,
      phase_key: p.phase_key,
      titel: ploc.titel,
      eyebrow: ploc.eyebrow,
      beschreibung: ploc.beschreibung,
      conditional_on: (p.conditional_on as ConditionalOn | null) ?? null,
      felder: sichtbareFelder,
    })
  }

  return {
    phases: phasen,
    prefilledValues: prefilled,
    fallId,
    totalDefinedPhases: phasenRows.length,
    skippedPhases: skipped,
  }
}
