// Security (Write-Path-Audit 2026-07-01, F3): bewusst KEIN 'use server'.
// Diese Funktion mutiert via admin-client (RLS-bypass) und darf NICHT als
// RPC-Endpoint exponiert werden — sonst kann jeder authenticated User sie direkt
// mit beliebiger fallId aufrufen (Billing/Werbebudget-Mutation auf fremdem Claim).
// Alle Caller sind server-seitig (cron case-billing-batch, state-machine-Hook);
// die Guards leben dort.
// Siehe docs/2026-07-01-claim-write-path-authorization-audit.md.
import { createAdminClient } from '@/lib/supabase/admin'
import { splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { getLeadPriceFromTable, isCaseInKontingent } from './calculate-lead-price'
import { FINANCE } from '@/lib/finance/constants'

/**
 * KFZ-149: Per-case Guthaben-Verrechnung (atomar).
 *
 * Pro Fall im Kontingent:
 * 1. Lead-Preis aus Tabelle (Paketpreis)
 * 2. guthaben_abzug = MIN(150, werbebudget_guthaben_netto)
 * 3. sv_nachzahlung = lead_preis - guthaben_abzug
 * 4. Atomares Update gutachter.werbebudget_guthaben_netto
 *
 * INVARIANTE: lead_preis_netto = guthaben_verrechnet_netto + sv_nachzahlung_netto
 */
export async function processCaseBilling(fallId: string): Promise<{
  lead_preis_netto: number
  lead_preis_typ: 'paket' | 'einzel'
  guthaben_verrechnet_netto: number
  sv_nachzahlung_netto: number
  guthaben_neu_netto: number
} | null> {
  const db = createAdminClient()

  // CMM-49 Reader-Sweep: claims-direkt via resolveClaimId (faelle-Anker raus).
  // schadens_hoehe_netto + lead_preis_netto sind claims-SSoT (CMM-44 SP-B/Phase 3);
  // gutachten.gesamt_schadensbetrag via claims-Sub-Embed (SP-G); sv_id = claims.sv_id (CMM-60).
  const claimId = await resolveClaimId(db, fallId)
  if (!claimId) return null
  const { data: claim } = await db.from('claims')
    .select('id, sv_id, sa_unterschrieben, schadens_hoehe_netto, lead_preis_netto, gutachten(gesamt_schadensbetrag)')
    .eq('id', claimId)
    .single()

  if (!claim?.sv_id) return null

  // P4 (Invariante Spec 3 §4): kein Billing vor Kunden-Bestaetigung. Der SV-Vermittlungs-
  // Sofort-Claim (geboren sa_unterschrieben=false, sv_id gesetzt) wuerde sonst vom
  // case-billing-batch-Cron gebillt, obwohl der Kunde noch nicht signiert hat. Inert fuer
  // Bestands-/Normalfall-Claims (live verifiziert 30.07.: 0 billable Claims mit false/null).
  // Nach Onboarding feuert processCaseBilling erneut (idempotent) via resumeFunnelAfterOnboarding.
  if ((claim as { sa_unterschrieben?: boolean | null }).sa_unterschrieben !== true) return null

  // Bereits berechnet? (Idempotenz-Guard) — lead_preis_netto ist claims-SSoT.
  const existingLeadPreis = (claim as { lead_preis_netto?: number | null }).lead_preis_netto
  if (existingLeadPreis != null) return null
  const claimGutachten = Array.isArray((claim as { gutachten?: unknown }).gutachten)
    ? ((claim as { gutachten: unknown[] }).gutachten)[0]
    : (claim as { gutachten?: unknown }).gutachten
  const schadenhoehe = Number(
    (claim as { schadens_hoehe_netto?: number | null }).schadens_hoehe_netto
    ?? (claimGutachten as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag
    ?? 0
  )
  if (schadenhoehe <= 0) return null

  // Kontingent prüfen — W1.1/AAR-945 Task 2: Stichtag = Bepreisungszeitpunkt (now),
  // NICHT Fall-Erstelldatum. Das Kontingent (Paket vs. Einzel) wird am
  // Fakturierungsmonat gezählt — konsistent zur Billing-Window-Logik (Task 1).
  const imKontingent = await isCaseInKontingent(claim.sv_id, new Date())

  // Lead-Preis berechnen
  const { betrag_netto: leadPreis, typ } = await getLeadPriceFromTable(schadenhoehe, imKontingent)

  // Guthaben laden (atomar via SELECT FOR UPDATE wäre ideal, Supabase hat kein explizites Locking,
  // daher: read + update mit Optimistic Concurrency via werbebudget_guthaben_netto Check)
  const { data: sv } = await db.from('sachverstaendige')
    .select('werbebudget_guthaben_netto')
    .eq('id', claim.sv_id)
    .single()

  const currentGuthaben = Number(sv?.werbebudget_guthaben_netto ?? 0)

  // Guthaben-Abzug: nur im Kontingent, max 150
  const guthabenAbzug = imKontingent ? Math.min(FINANCE.ANZAHLUNG_PRO_KONTINGENT, currentGuthaben) : 0
  const nachzahlung = leadPreis - guthabenAbzug
  const guthabenNeu = currentGuthaben - guthabenAbzug

  // AAR (06.07. Bug-Audit): Reihenfolge + Atomaritaet gegen Doppel-Abzug.
  // FRUEHER: Guthaben wurde ZUERST dekrementiert, der Idempotenz-Marker
  // (lead_preis_netto) DANACH geschrieben. Schlug der 2. Write fehl, blieb
  // lead_preis_netto NULL, und der Reconcile-Batch-Cron `case-billing-batch`
  // (Filter lead_preis_netto IS NULL) zog beim naechsten Lauf ERNEUT ab -> SV
  // verlor mehrfach bis 150 EUR (gleiche Klasse wie das einzug_versucht_am-Leak).
  // JETZT: der Marker-Write ist der ATOMARE Latch (UPDATE ... WHERE
  // lead_preis_netto IS NULL RETURNING id) und laeuft ZUERST; das Guthaben wird
  // NUR dekrementiert, wenn DIESER Lauf den Latch gewonnen hat. Ein
  // paralleler/erneuter Lauf trifft 0 Zeilen -> kein 2. Abzug. Worst-Case dreht
  // sich zu "SV einmal zu wenig belastet" (Marker gesetzt, Guthaben nicht) statt
  // Doppel-Verlust — reconcilebar und SV-guenstig.
  //
  // Billing-Felder sind alle claims-SSoT (CLAIM_OWNED) -> splitOrKeepFaelleUpdate
  // routet sie auf claims (faelleUpdate bleibt leer). claimId via resolveClaimId immer gesetzt.
  const { claimsUpdate: pcbClaims } = splitOrKeepFaelleUpdate(
    {
      lead_preis_netto: leadPreis,
      lead_preis_typ: typ,
      lead_preis_berechnet_am: new Date().toISOString(),
      guthaben_verrechnet_netto: guthabenAbzug,
      sv_nachzahlung_netto: nachzahlung,
    },
    claimId,
  )
  if (Object.keys(pcbClaims).length === 0) return null
  const { data: latched, error: latchErr } = await db.from('claims')
    .update(pcbClaims)
    .eq('id', claimId)
    .is('lead_preis_netto', null)
    .select('id')
  // Latch verloren (0 Zeilen) oder Fehler -> ein anderer Lauf hat bereits abgerechnet
  // (oder tut es gerade); NICHT (nochmal) das Guthaben abziehen.
  if (latchErr || !latched || latched.length === 0) return null

  // Guthaben dekrementieren — erst NACH gewonnenem Latch.
  if (guthabenAbzug > 0) {
    await db.from('sachverstaendige')
      .update({ werbebudget_guthaben_netto: guthabenNeu })
      .eq('id', claim.sv_id)
  }

  console.log(`[KFZ-149] Case ${fallId}: Lead-Preis=${leadPreis} (${typ}), Guthaben-Abzug=${guthabenAbzug}, Nachzahlung=${nachzahlung}, Guthaben-Neu=${guthabenNeu}`)

  return {
    lead_preis_netto: leadPreis,
    lead_preis_typ: typ,
    guthaben_verrechnet_netto: guthabenAbzug,
    sv_nachzahlung_netto: nachzahlung,
    guthaben_neu_netto: guthabenNeu,
  }
}
