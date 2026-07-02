// Test-Daten-Janitor (Design 2026-07-02): entfernt Seed-/Test-Pollution aus Prod, damit
// die Funnel-Zahlen die Realitaet zeigen. Bewusst konservativ:
//   - loescht nur DATEN (Claims/Leads + Dependents), NIE Accounts (Test-SVs/User bleiben
//     Fixtures, die 12 parallele Sessions per ID referenzieren).
//   - Recency-Guard 72h schuetzt mid-flight Smoke-Runs.
// Loesch-Mechanik (erster Prod-Lauf 02.07. hat sie gehaertet):
//   delete_fall_komplett raeumt die fall_id-scoped Legacy-Zeilen (timeline etc.), ist aber post
//   CMM-49 fuer bridge-gemappte Claims (fall_id != claim_id) NICHT verlaesslich beim Claim-Row
//   selbst -> danach die Claim-/Lead-Row DIREKT loeschen + alle NO_ACTION-Dependents raeumen
//   (CASCADE/SET-NULL-FKs regeln sich selbst). Scope: docs/superpowers/specs/2026-07-02-test-data-purge-design.md.

import { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

const RECENCY_MS = 72 * 60 * 60 * 1000

// Safety-Cap fuer den UNBEAUFSICHTIGTEN nightly Cron: findet ein Lauf mehr als so viele Ziele,
// wird NICHTS geloescht (Abbruch + Dead-Letter-Alert). Schuetzt vor Runaway durch Fehlkonfig
// (z.B. ein echter SV faelschlich ist_testaccount=true -> hunderte echte Claims). Steady-State
// = wenige Smoke-Reste/Tag; ein Ausschlag darueber signalisiert ein Problem, kein Routine-Cleanup.
// Ein legitimer grosser Einmal-Cleanup laeuft supervised (Konstante temporaer anheben).
const MAX_AUTO_DELETE = 25

// T2 = unkonvertierte reine Test-Leads. Suffixe sind unzweideutig Test (null echte Kunden):
const T2_EMAIL_SUFFIXES = ['@claimondo.test', '@example.com', '@claimondo-test.de']

// Blockierende FKs (NO_ACTION/RESTRICT ODER SET-NULL-auf-NOT-NULL-Spalte) — via pg_catalog
// vollstaendig ermittelt 02.07. Alle uebrigen sind CASCADE/nullbares-SET-NULL -> self-healing.
// Loesch-Reihenfolge bottom-up: BRIDGE-Deps (by fall_id) -> Bridge-Row -> CLAIM-Deps (by claim_id)
// -> Claim-Row; LEAD-Deps (by lead_id) -> Lead-Row. Ein Claim-Delete cascadet auf den Bridge-Row,
// den mehrere Tabellen per fall_id referenzieren (v.a. gutachter_finder_anfragen.konvertiert_zu_fall_id).
const CLAIM_DEPS: Array<{ table: string; col: string }> = [
  { table: 'abrechnung_positionen', col: 'claim_id' },
  { table: 'auftraege', col: 'claim_id' },
  { table: 'fall_dokumente', col: 'claim_id' },
  { table: 'gutachter_abrechnungspositionen', col: 'claim_id' },
  { table: 'kanzlei_abrechnung_positionen', col: 'claim_id' },
  { table: 'makler_provisionen', col: 'claim_id' },
  { table: 'technische_probleme', col: 'claim_id' },
]
const BRIDGE_DEPS: Array<{ table: string; col: string }> = [
  { table: 'abrechnung_positionen', col: 'fall_id' },
  { table: 'gutachter_abrechnungspositionen', col: 'fall_id' },
  { table: 'gutachter_finder_anfragen', col: 'konvertiert_zu_fall_id' },
  { table: 'gutachter_termine', col: 'fall_id' },
  { table: 'gutschriften', col: 'referenz_fall_id' },
  { table: 'kanzlei_abrechnung_positionen', col: 'fall_id' },
  { table: 'makler_provisionen', col: 'fall_id' },
  { table: 'whatsapp_inbound_messages', col: 'matched_fall_id' },
]
const LEAD_DEPS: Array<{ table: string; col: string }> = [
  { table: 'gutachter_finder_anfragen', col: 'konvertiert_zu_lead_id' },
  { table: 'gutachter_termine', col: 'lead_id' },
  { table: 'makler_provisionen', col: 'lead_id' },
  { table: 'tasks', col: 'lead_id' },
  { table: 'whatsapp_inbound_messages', col: 'matched_lead_id' },
]

export type PurgeT1 = { claimId: string; fallId: string; leadId: string | null }
export type PurgeT2 = { leadId: string; email: string | null }

export type PurgeManifest = {
  generatedAt: string
  dryRun: boolean
  t1: PurgeT1[]
  t2: PurgeT2[]
  skipped: { t1Recency: number; t2Recency: number }
  deleted: { claims: number; leads: number }
  capExceeded: boolean
  errors: string[]
}

// Recency-Guard auf created_at (NICHT updated_at): ein aktiver Smoke-Run ERZEUGT Claims/Leads
// jetzt (created_at recent). Ein alt-erzeugter Datensatz, dessen updated_at nur durch einen
// Backfill (CMM-49) oder diesen Cleanup selbst (SET NULL auf claims.lead_id beim Lead-Delete)
// frisch wurde, ist NICHT mid-flight -> created_at ist das korrekte "aus aktivem Lauf?"-Signal.
function createdAtMs(row: { created_at: string | null }): number {
  return row.created_at ? Date.parse(row.created_at) : 0
}

/**
 * Re-derived das Ziel-Set (T1 Test-SV-Claims + T2 unkonvertierte Test-Leads) mit 72h-Guard.
 * Deterministisch: identisch zum SQL-Manifest, das dem Design zugrunde liegt.
 */
export async function selectTestDataTargets(admin: Db): Promise<{
  t1: PurgeT1[]
  t2: PurgeT2[]
  skipped: { t1Recency: number; t2Recency: number }
}> {
  const cutoffMs = Date.now() - RECENCY_MS

  const { data: testSvs } = await admin.from('sachverstaendige').select('id').eq('ist_testaccount', true)
  const testSvIds = new Set((testSvs ?? []).map((s) => s.id as string))

  const { data: allClaims } = await admin
    .from('claims')
    .select('id, sv_id, lead_id, created_at, updated_at')
  const claimLeadIds = new Set(
    (allClaims ?? []).map((c) => c.lead_id as string | null).filter((x): x is string => Boolean(x)),
  )

  const t1: PurgeT1[] = []
  let t1Recency = 0
  for (const c of allClaims ?? []) {
    const svId = c.sv_id as string | null
    if (!svId || !testSvIds.has(svId)) continue
    if (createdAtMs(c) > cutoffMs) {
      t1Recency++
      continue
    }
    const { data: bridge } = await admin
      .from('faelle_claim_bridge')
      .select('fall_id')
      .eq('claim_id', c.id as string)
      .maybeSingle()
    t1.push({
      claimId: c.id as string,
      fallId: (bridge?.fall_id as string | null) ?? (c.id as string),
      leadId: (c.lead_id as string | null) ?? null,
    })
  }

  const { data: allLeads } = await admin.from('leads').select('id, email, created_at, updated_at')
  const t2: PurgeT2[] = []
  let t2Recency = 0
  for (const l of allLeads ?? []) {
    const email = (l.email as string | null) ?? ''
    const isTestEmail = T2_EMAIL_SUFFIXES.some((sfx) => email.toLowerCase().endsWith(sfx))
    if (!isTestEmail) continue
    if (claimLeadIds.has(l.id as string)) continue
    if (createdAtMs(l) > cutoffMs) {
      t2Recency++
      continue
    }
    t2.push({ leadId: l.id as string, email: l.email as string | null })
  }

  return { t1, t2, skipped: { t1Recency, t2Recency } }
}

/** Raeumt blockierende Dependents (best-effort, Fehler werden gesammelt statt geworfen). */
async function clearDeps(admin: Db, deps: Array<{ table: string; col: string }>, id: string, errors: string[]): Promise<void> {
  for (const d of deps) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin.from(d.table as any).delete() as any).eq(d.col, id)
    if (error) errors.push(`${d.table}.${d.col}=${id}: ${error.message}`)
  }
}

/** Loescht einen Claim zuverlaessig: RPC (Legacy) + Bridge-/Claim-Deps + Bridge-/Claim-Row direkt. */
async function deleteClaim(admin: Db, t: PurgeT1, errors: string[]): Promise<boolean> {
  // 1. fall_id-scoped Legacy-Zeilen (timeline etc.) — best effort, RPC swallowt intern.
  await admin.rpc('delete_fall_komplett', { p_fall_id: t.fallId, p_claim_id: t.claimId })
  // 2. BRIDGE-Deps (by fall_id): der Claim-Delete cascadet auf den Bridge-Row, diese blocken ihn.
  await clearDeps(admin, BRIDGE_DEPS, t.fallId, errors)
  // 3. Bridge-Row selbst (idempotent; entkoppelt Claim-Delete vom Bridge-CASCADE).
  {
    const { error } = await admin.from('faelle_claim_bridge').delete().eq('claim_id', t.claimId)
    if (error) errors.push(`faelle_claim_bridge.delete(${t.claimId}): ${error.message}`)
  }
  // 4. CLAIM-Deps (by claim_id).
  await clearDeps(admin, CLAIM_DEPS, t.claimId, errors)
  // 5. Claim-Row direkt (idempotent: 0 Zeilen falls RPC sie schon entfernt hat).
  const { error } = await admin.from('claims').delete().eq('id', t.claimId)
  if (error) {
    errors.push(`claims.delete(${t.claimId}): ${error.message}`)
    return false
  }
  return true
}

/** Loescht einen Lead zuverlaessig: Lead-Deps + Lead-Row direkt. */
async function deleteLead(admin: Db, leadId: string, errors: string[]): Promise<boolean> {
  await clearDeps(admin, LEAD_DEPS, leadId, errors)
  const { error } = await admin.from('leads').delete().eq('id', leadId)
  if (error) {
    errors.push(`leads.delete(${leadId}): ${error.message}`)
    return false
  }
  return true
}

/**
 * Test-Daten-Purge. dryRun (default) selektiert nur + gibt das Manifest zurueck, loescht NICHTS.
 * Fehler pro Zeile werden gesammelt (ein Fehler stoppt nicht den Rest), nie geworfen.
 */
export async function purgeTestData(opts: { dryRun: boolean }): Promise<PurgeManifest> {
  const admin = createAdminClient()
  const derived = await selectTestDataTargets(admin)

  const manifest: PurgeManifest = {
    generatedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    t1: derived.t1,
    t2: derived.t2,
    skipped: derived.skipped,
    deleted: { claims: 0, leads: 0 },
    capExceeded: false,
    errors: [],
  }

  if (opts.dryRun) return manifest

  // Safety-Cap: unerwartet viele Ziele -> NICHTS loeschen, ueber Dead-Letter eskalieren.
  const total = derived.t1.length + derived.t2.length
  if (total > MAX_AUTO_DELETE) {
    manifest.capExceeded = true
    manifest.errors.push(
      `Safety-Cap: ${total} Ziele (> ${MAX_AUTO_DELETE}) — Abbruch OHNE Loeschung. Ungewoehnlich viele Test-Ziele deuten auf Fehlkonfig (echter SV mit ist_testaccount=true?) — manuell pruefen.`,
    )
    return manifest
  }

  for (const t of derived.t1) {
    const claimOk = await deleteClaim(admin, t, manifest.errors)
    if (claimOk) manifest.deleted.claims++
    if (t.leadId) {
      const leadOk = await deleteLead(admin, t.leadId, manifest.errors)
      if (leadOk) manifest.deleted.leads++
    }
  }

  for (const t of derived.t2) {
    const leadOk = await deleteLead(admin, t.leadId, manifest.errors)
    if (leadOk) manifest.deleted.leads++
  }

  return manifest
}
