// Kanonischer EvalContext fuer dokument_katalog-Regeln aus der Claim-SSoT.
// Claim gewinnt vor Lead; Keys spiegeln die lead.*/fall.*-Referenzen der Seeds.
import type { EvalContext } from './ruleEvaluator'

type Row = Record<string, unknown> | null | undefined
const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null) ?? null

export function buildDokumentKontext(args: { claim?: Row; lead?: Row }): EvalContext {
  const c = (args.claim ?? {}) as Record<string, unknown>
  const l = (args.lead ?? {}) as Record<string, unknown>
  return {
    // schadensfotos/unfallfotos nutzen pflicht_wenn {is_not_null lead.id} = "immer
    // (sobald ein Lead existiert)". Daher lead.id im Kontext bereitstellen.
    'lead.id': pick(l.id, c.lead_id),
    'lead.zb1_status': pick(l.zb1_status),
    'lead.polizei_vor_ort': pick(c.polizei_vor_ort, l.polizei_vor_ort),
    'lead.fahrerflucht': pick(c.fahrerflucht, l.fahrerflucht),
    'lead.personenschaden_flag': pick(c.hat_personenschaden, l.personenschaden_flag),
    'lead.sachschaden_flag': pick(c.hat_sachschaden, l.sachschaden_flag),
    'lead.gewerbe_flag': pick(c.gewerbe_flag, l.gewerbe_flag),
    'lead.vorsteuerabzugsberechtigt': pick(c.vorsteuerabzugsberechtigt, l.vorsteuerabzugsberechtigt),
    'lead.finanzierung_leasing': pick(c.finanzierung_leasing, l.finanzierung_leasing),
    'lead.halter_ungleich_fahrer_flag': pick(c.halter_ungleich_fahrer, l.halter_ungleich_fahrer_flag),
    'lead.zeugen_vorhanden': pick(c.zeugen_vorhanden, l.zeugen_vorhanden),
    'lead.mietwagen_flag': pick(c.hat_mietwagen, l.mietwagen_flag),
    'lead.nutzungsausfall': pick(c.hat_nutzungsausfall, l.nutzungsausfall),
    'fall.zeugen_vorhanden': pick(c.zeugen_vorhanden),
    // Die folgenden drei Felder sind SV-/admin-seitige Slots (nicht kunde-uploadbar).
    // Sie fehlen oft am Claim wenn kein SV-Bearbeitung stattfand — null = nicht
    // freigeschaltet ist das korrekte Verhalten fuer diese internen Trigger.
    'fall.vorschaden_erkannt': pick(c.vorschaden_erkannt),
    'fall.technische_stellungnahme_status': pick(c.technische_stellungnahme_status),
    'fall.nachbesichtigung_status': pick(c.nachbesichtigung_status),
  }
}
