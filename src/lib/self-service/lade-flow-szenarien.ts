// Loader fuer die DB-getriebene FlowLink-Matrix (Aaron 14.07.).
// Die Daten liegen in flow_szenarien + flow_szenario_steps; die LOGIK (matchen/auswerten) ist pure
// und getestet (flow-szenarien.ts). Dieser Loader ist die einzige Stelle, die beides zusammenbringt.
//
// Server-only (Supabase-Import) — der Client bekommt das Ergebnis als Prop.

import { createServiceClient } from '@/lib/supabase/server'
import { bauFlowKontext, type LeadFuerKontext } from './flow-kontext'
import { resolveFlowWeichen, type FlowWeichen } from './flow-weichen'
import type { FlowSzenario, FlowSzenarioStep } from './flow-szenarien'

export type FlowConfig = {
  szenarien: FlowSzenario[]
  steps: FlowSzenarioStep[]
}

/** Laedt die aktive Szenario-Matrix aus der DB. */
export async function ladeFlowConfig(): Promise<FlowConfig> {
  const svc = createServiceClient()

  const [szenarienRes, stepsRes] = await Promise.all([
    svc
      .from('flow_szenarien')
      .select('id, bezeichnung, schuldfrage, eigene_versicherung, service_typ, feststellung_zweig, prioritaet')
      .eq('aktiv', true),
    svc
      .from('flow_szenario_steps')
      .select('szenario_id, step_id, reihenfolge, bedingung, erhebt_felder, aktiv')
      .eq('aktiv', true)
      .order('reihenfolge', { ascending: true }),
  ])

  // Fehler nicht verschlucken: eine leere Matrix wuerde den Flow lautlos leerlaufen lassen.
  if (szenarienRes.error) console.error('[flow-config] flow_szenarien:', szenarienRes.error.message)
  if (stepsRes.error) console.error('[flow-config] flow_szenario_steps:', stepsRes.error.message)

  return {
    szenarien: (szenarienRes.data ?? []) as unknown as FlowSzenario[],
    steps: (stepsRes.data ?? []) as unknown as FlowSzenarioStep[],
  }
}

/**
 * Bequemer Einstieg: Config laden + Kontext bauen + Weichen aufloesen.
 * `svHatTermin` kommt von aussen (Termin-Lookup in page.tsx), weil es nicht am Lead haengt.
 */
export async function ladeFlowWeichen(
  lead: LeadFuerKontext,
  svHatTermin: boolean,
): Promise<{ config: FlowConfig; weichen: FlowWeichen }> {
  const config = await ladeFlowConfig()
  const kontext = bauFlowKontext(lead, svHatTermin)
  return { config, weichen: resolveFlowWeichen(config.szenarien, config.steps, kontext) }
}
