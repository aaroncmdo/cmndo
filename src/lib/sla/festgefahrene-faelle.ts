// Dispatch-Sichtbarkeit fuer festgefahrene Faelle (Aaron 03.07., Option B).
//
// Die SLA-Pipeline (AAR-85, src/lib/sla/tracker.ts) setzt bei Frist-Ablauf
// sla_tracking.status='breached' + erzeugt einen `sla_breach`-Task. Diese
// Signale wurden bisher NUR im Admin-Portal (/admin/sla) als flache Tabelle
// gezeigt — Dispatch (das operativ die Gutachter zuweist / Termine nachfasst)
// sah sie NIRGENDS, und die roh-`sla_breach`-Tasks werden ueberhaupt von keiner
// UI gerendert.
//
// Diese Funktion aggregiert die breached-SLAs PRO CLAIM (dedupliziert) und
// leitet die konkrete Dispatch-Aktion ab. Wichtig: sla_tracking.status alleine
// luegt teils — completeSla() wird auf manchen Pfaden nicht gerufen, darum kann
// gutachter_zuweisung 'breached' bleiben obwohl sv_id laengst gesetzt ist. Daher
// entscheidet der LIVE-Zustand (sv_id / bestaetigter Termin), nicht das Flag;
// bereits-fortgeschrittene Claims werden ausgeblendet.
//
// Voll DB-getrieben: liest sla_tracking + claims + leads + gutachter_termine,
// nichts hardcoded. Admin-Client (wie das Dispatch-Dashboard fuer die
// flow_links-Counts) — sla_tracking ist ops-weite Daten, Dispatch-Auth ist per
// Layout-Guard (requirePortalAccess) gesichert.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SlaTyp } from '@/lib/sla/tracker'

export type FestgefahrenerFallKind = 'kein_gutachter' | 'termin_unbestaetigt'

export type FestgefahrenerFall = {
  claimId: string
  fallId: string
  claimNummer: string
  leadId: string | null
  kundeName: string
  kind: FestgefahrenerFallKind
  aktionLabel: string
  slaTypen: SlaTyp[]
  earliestBreachIso: string
  stuckSeitTagen: number
}

/**
 * Pure Klassifikation: was haengt an DIESEM Claim operativ wirklich noch?
 *
 * sla_tracking.status='breached' ist NICHT verlaesslich (stale, s. Datei-Kopf) —
 * darum entscheidet der Live-Zustand:
 *   • kein SV zugewiesen            → Dispatch muss Gutachter zuweisen (kritisch)
 *   • SV da, Termin nicht bestaetigt → auf SV-Bestaetigung nachfassen (Warnung)
 *   • SV da + bestaetigter Termin    → laeuft -> null (ausblenden)
 *
 * Der besichtigung-/gutachten-Upload-Verzug NACH bestaetigtem Termin ist SV-Sache
 * (sv-mahnung-saeumnis-Cron) und bewusst NICHT Teil dieser Dispatch-Ansicht.
 */
export function klassifiziereFestgefahren(input: {
  hatSv: boolean
  hatBestaetigtenTermin: boolean
}): { kind: FestgefahrenerFallKind; aktionLabel: string } | null {
  if (!input.hatSv) {
    return { kind: 'kein_gutachter', aktionLabel: 'Gutachter zuweisen' }
  }
  if (!input.hatBestaetigtenTermin) {
    return { kind: 'termin_unbestaetigt', aktionLabel: 'Termin-Bestätigung nachfassen' }
  }
  return null
}

type BreachRow = { claim_id: string | null; fall_id: string; sla_typ: string; breach_at: string }
type ClaimRow = { id: string; claim_nummer: string | null; sv_id: string | null; lead_id: string | null }
type LeadRow = { id: string; vorname: string | null; nachname: string | null }

/**
 * Liefert alle aktuell festgefahrenen Claims (>=1 verletzte SLA, live noch
 * offen), dedupliziert pro Claim, aeltester Breach zuerst (am laengsten
 * festgefahren = dringlichster). Consumer: Dispatch-Dashboard.
 */
export async function ladeFestgefahreneFaelle(): Promise<FestgefahrenerFall[]> {
  const db = createAdminClient()

  // 1) Breached SLAs einsammeln (ein Row je fall+sla_typ, UNIQUE).
  const { data: breachedRaw } = await db
    .from('sla_tracking')
    .select('claim_id, fall_id, sla_typ, breach_at')
    .eq('status', 'breached')

  const breached = (breachedRaw ?? []) as BreachRow[]
  if (breached.length === 0) return []

  // 2) Pro Claim gruppieren (claim_id ist der Key; sla_tracking traegt ihn nativ).
  type Agg = { claimId: string; fallId: string; slaTypen: Set<string>; earliest: string }
  const perClaim = new Map<string, Agg>()
  for (const b of breached) {
    if (!b.claim_id) continue // Orphan ohne claim_id -> nicht aufloesbar, ueberspringen
    const cur = perClaim.get(b.claim_id)
    if (cur) {
      cur.slaTypen.add(b.sla_typ)
      if (b.breach_at < cur.earliest) cur.earliest = b.breach_at
    } else {
      perClaim.set(b.claim_id, {
        claimId: b.claim_id,
        fallId: b.fall_id,
        slaTypen: new Set([b.sla_typ]),
        earliest: b.breach_at,
      })
    }
  }
  const claimIds = Array.from(perClaim.keys())
  if (claimIds.length === 0) return []
  const fallIds = Array.from(new Set(Array.from(perClaim.values()).map((a) => a.fallId)))

  // 3) Claims laden (sv_id fuer den Live-Check, claim_nummer + lead_id fuer UI/Link).
  const { data: claimsRaw } = await db
    .from('claims')
    .select('id, claim_nummer, sv_id, lead_id')
    .in('id', claimIds)
  const claimById = new Map<string, ClaimRow>()
  for (const c of (claimsRaw ?? []) as ClaimRow[]) claimById.set(c.id, c)

  // 4) Kundennamen via leads.
  const leadIds = Array.from(
    new Set(
      Array.from(claimById.values())
        .map((c) => c.lead_id)
        .filter((x): x is string => !!x),
    ),
  )
  const leadById = new Map<string, LeadRow>()
  if (leadIds.length > 0) {
    const { data: leadsRaw } = await db.from('leads').select('id, vorname, nachname').in('id', leadIds)
    for (const l of (leadsRaw ?? []) as LeadRow[]) leadById.set(l.id, l)
  }

  // 5) Bestaetigte Termine (Live-Check) — via claim_id ODER fall_id (Altbestand).
  const confirmedClaimIds = new Set<string>()
  const confirmedFallIds = new Set<string>()
  {
    const { data: byClaim } = await db
      .from('gutachter_termine')
      .select('claim_id')
      .eq('status', 'bestaetigt')
      .in('claim_id', claimIds)
    for (const t of (byClaim ?? []) as Array<{ claim_id: string | null }>) {
      if (t.claim_id) confirmedClaimIds.add(t.claim_id)
    }
    const { data: byFall } = await db
      .from('gutachter_termine')
      .select('fall_id')
      .eq('status', 'bestaetigt')
      .in('fall_id', fallIds)
    for (const t of (byFall ?? []) as Array<{ fall_id: string | null }>) {
      if (t.fall_id) confirmedFallIds.add(t.fall_id)
    }
  }

  // 6) Zusammenbauen + klassifizieren (Live-Zustand entscheidet, s. klassifiziere...).
  const now = Date.now()
  const result: FestgefahrenerFall[] = []
  for (const agg of perClaim.values()) {
    const claim = claimById.get(agg.claimId)
    if (!claim) continue // Claim-Row fehlt (geloescht) -> nicht anzeigbar
    const hatSv = !!claim.sv_id
    const hatBestaetigtenTermin = confirmedClaimIds.has(agg.claimId) || confirmedFallIds.has(agg.fallId)
    const klass = klassifiziereFestgefahren({ hatSv, hatBestaetigtenTermin })
    if (!klass) continue // laeuft bereits -> nicht (mehr) festgefahren

    const lead = claim.lead_id ? leadById.get(claim.lead_id) : undefined
    const kundeName = [lead?.vorname, lead?.nachname].filter(Boolean).join(' ').trim() || '—'
    const stuckSeitTagen = Math.max(0, Math.floor((now - new Date(agg.earliest).getTime()) / 86_400_000))

    result.push({
      claimId: agg.claimId,
      fallId: agg.fallId,
      claimNummer: claim.claim_nummer ?? agg.fallId.slice(0, 8),
      leadId: claim.lead_id,
      kundeName,
      kind: klass.kind,
      aktionLabel: klass.aktionLabel,
      slaTypen: Array.from(agg.slaTypen) as SlaTyp[],
      earliestBreachIso: agg.earliest,
      stuckSeitTagen,
    })
  }

  // Aeltester Breach zuerst = am laengsten festgefahren = oben.
  result.sort((a, b) => a.earliestBreachIso.localeCompare(b.earliestBreachIso))
  return result
}
