// Regel-4-Prod-Smoke: SCHARFER Provisions-Release-Uebergang pending -> freigegeben
// ueber den ECHTEN Produktions-Cron-Pfad (Handoff 3cff8e12/Aaron 01.08.).
//
// Kontext: Der pg_cron `release_provisionen` (02:00 UTC) feuert nachweislich taeglich
// (cron_jobs_audit response_ids), aber der Flip pending->freigegeben ist noch NIE in
// prod gelaufen — kein Claim war je abgeschlossen+7d. Dieser Smoke beweist den Flip
// end-to-end: Trigger-Mint -> pg_cron-Command (SELECT public.cron_trigger_release_provisionen(),
// via MCP execute_sql zwischen den Phasen gefeuert) -> Vault-Secret -> net.http_get ->
// /api/cron/release-provisionen -> runProvisionsRelease -> status='freigegeben'.
//
// Phasen (der Cron-Schuss laeuft AUSSERHALB dieses Scripts, darum getrennt):
//   --phase seed --werkstatt-user <uid>   Wegwerf-Inbound-Claim (-8d abgeschlossen) + Mint-Assert
//                                          + Fremd-Effekt-Precheck (ALLE Partner-Typen)
//   --phase assert --claim <id>            Poll auf status='freigegeben' (max ~60s)
//   --phase cleanup                        0-Residue (Provisionen, Claims, Bridge, Mitteilungen)
//
// Fallstrick P3 (Handoff): sv_id + reparatur_werkstatt_id bleiben NULL -> istIntraNetzwerk=false
// -> KEINE Suppression -> sauberer freigegeben-Pfad.
//
// SICHERHEIT: nur Wegwerf-Entities (throwaway-*@claimondo.test, telefon=NULL). Der Cron-Schuss
// wirkt global -> der Fremd-Effekt-Precheck listet ALLE fremden pending-Rows und bewertet sie
// (release-berechtigt/storno-faellig); bei Fremd-Effekt NICHT schiessen.
//
// Nutzung: npx tsx --env-file=.env.local scripts/smoke/netzwerk-release-scharf-smoke.mts --phase <p> [...]

import { createClient } from '@supabase/supabase-js'

const SMOKE_TAG = 'SMOKE-RELEASE-SCHARF'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ENV fehlt (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — --env-file=.env.local?')
  process.exit(1)
}
if (!url.includes('paizkjajbuxxksdoycev')) {
  console.error(`ABBRUCH: URL ist nicht das echte prod (${url}) — Preview-Ref-Falle.`)
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const HOLD_MS = 7 * 86400_000

type PendingRow = { id: string; partner_typ: string; claim_id: string | null }
type ClaimRow = {
  id: string
  operative_status: string | null
  abgeschlossen_am: string | null
  service_typ: string | null
  fall_typ: string | null
}

/** Fremd-Effekt-Precheck: listet ALLE fremden pending-Rows und bewertet, ob der
 *  Cron-Schuss sie anfassen wuerde (release-berechtigt ODER storno-faellig). */
async function precheckFremdEffekte(eigeneClaimIds: string[]): Promise<number> {
  const { data: pend, error } = await db
    .from('partner_provisionen')
    .select('id, partner_typ, claim_id')
    .eq('status', 'pending')
  if (error) throw new Error(`precheck pending: ${error.message}`)
  const fremde = ((pend ?? []) as PendingRow[]).filter(
    (r) => r.claim_id && !eigeneClaimIds.includes(r.claim_id),
  )
  if (fremde.length === 0) {
    console.log('[precheck ✓] 0 fremde pending-Rows.')
    return 0
  }
  const { data: claims, error: cErr } = await db
    .from('claims')
    .select('id, operative_status, abgeschlossen_am, service_typ, fall_typ')
    .in('id', fremde.map((r) => r.claim_id as string))
  if (cErr) throw new Error(`precheck claims: ${cErr.message}`)
  const byId = new Map(((claims ?? []) as ClaimRow[]).map((c) => [c.id, c]))
  const cutoff = Date.now() - HOLD_MS

  let betroffen = 0
  for (const r of fremde) {
    const c = byId.get(r.claim_id as string)
    if (!c) continue
    const storno = c.operative_status === 'storniert'
    // Voll-Claim-Release-Pfad; nur_gutachter (termin-basiert) konservativ als betroffen zaehlen,
    // wenn wir es nicht ausschliessen koennen.
    const releaseVoll =
      (c.operative_status === 'abgeschlossen' || c.operative_status === 'reguliert_vollstaendig') &&
      !!c.abgeschlossen_am && new Date(c.abgeschlossen_am).getTime() <= cutoff
    let releaseNurGutachter = false
    if (c.service_typ === 'nur_gutachter') {
      const { data: term } = await db
        .from('gutachter_termine')
        .select('durchgefuehrt_am')
        .eq('claim_id', c.id)
        .not('durchgefuehrt_am', 'is', null)
        .order('durchgefuehrt_am', { ascending: false })
        .limit(1)
      const ts = (term?.[0] as { durchgefuehrt_am?: string | null } | undefined)?.durchgefuehrt_am
      releaseNurGutachter = !!ts && new Date(ts).getTime() <= cutoff
    }
    if (storno || releaseVoll || releaseNurGutachter) {
      betroffen++
      console.log(
        `[precheck ⚠] FREMDE Row ${r.id} (${r.partner_typ}, claim ${r.claim_id}, ${c.operative_status}) wuerde ${storno ? 'STORNIERT' : 'FREIGEGEBEN'}.`,
      )
    }
  }
  if (betroffen === 0) console.log(`[precheck ✓] ${fremde.length} fremde pending-Rows — KEINE davon release-berechtigt/storno-faellig.`)
  return betroffen
}

async function seed(): Promise<void> {
  const werkstattUser = arg('werkstatt-user')
  if (!werkstattUser) {
    console.error('Pflicht-Arg: --werkstatt-user <uid> (aus throwaway-account.mjs create werkstatt)')
    process.exit(1)
  }
  const { data: w } = await db
    .from('werkstaetten').select('id, user_id, name').eq('user_id', werkstattUser).maybeSingle()
  if (!w) throw new Error(`werkstaetten-Zeile fuer user ${werkstattUser} fehlt`)

  const { error: wUpdErr } = await db
    .from('werkstaetten')
    .update({ provision_aktiv: true, provision_betrag_netto: 150 })
    .eq('id', w.id)
  if (wUpdErr) throw new Error(`werkstatt provision_aktiv: ${wUpdErr.message}`)

  // Inbound-Claim: werkstatt_id gesetzt (INBOUND-Vermittler -> Provision), sv_id +
  // reparatur_werkstatt_id NULL (kein intra-Netzwerk -> keine P3-Suppression),
  // abgeschlossen vor 8 Tagen -> release-berechtigt (Gate: abgeschlossen_am + 7d).
  const vor8Tagen = new Date(Date.now() - 8 * 86400_000).toISOString()
  const { data: claim, error: cErr } = await db
    .from('claims')
    .insert({
      schadentag: '2026-07-20',
      schadenort_plz: '10115',
      schadenort_ort: 'Berlin',
      schadenart: 'haftpflicht',
      schadens_ursache: 'unfall',
      fall_typ: SMOKE_TAG,
      operative_status: 'abgeschlossen',
      abgeschlossen_am: vor8Tagen,
      service_typ: 'komplett',
      sa_unterschrieben: true,
      werkstatt_id: w.id,
      vermittler_typ: 'werkstatt',
    })
    .select('id')
    .single()
  if (cErr || !claim) throw new Error(`claim: ${cErr?.message}`)
  const claimId = claim.id as string

  const { data: prov } = await db
    .from('partner_provisionen')
    .select('id, status, betrag_netto_eur, partner_typ')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (!prov) throw new Error('Trigger create_werkstatt_provision hat NICHT gemintet')
  if ((prov as { status: string }).status !== 'pending') throw new Error(`Provision nicht pending: ${JSON.stringify(prov)}`)
  console.log(`[seed ✓] Claim ${claimId} · Provision ${(prov as { id: string }).id} pending (${(prov as { betrag_netto_eur: number }).betrag_netto_eur} EUR, Trigger-Mint)`)

  const betroffen = await precheckFremdEffekte([claimId])
  if (betroffen > 0) {
    console.log('[STOP] Fremd-Effekte — Cron-Schuss NICHT abfeuern. Cleanup fahren und mit Aaron klaeren.')
  } else {
    console.log(`[bereit] Cron-Schuss kann gefeuert werden: SELECT public.cron_trigger_release_provisionen();`)
    console.log(`[next] --phase assert --claim ${claimId}`)
  }
}

async function assertPhase(): Promise<void> {
  const claimId = arg('claim')
  if (!claimId) { console.error('Pflicht-Arg: --claim <id>'); process.exit(1) }
  const deadline = Date.now() + 60_000
  let last: unknown = null
  while (Date.now() < deadline) {
    // Fehler HART behandeln — ein PostgREST-Fehler (z.B. falscher Spaltenname) liefert
    // data=null und saehe sonst wie "Row fehlt" aus (J9-Lehre: silent-null im Poll).
    const { data, error } = await db
      .from('partner_provisionen')
      .select('id, status, storno_grund, hold_until, betrag_netto_eur')
      .eq('claim_id', claimId)
      .maybeSingle()
    if (error) throw new Error(`assert query: ${error.message}`)
    last = data
    if ((data as { status?: string } | null)?.status === 'freigegeben') {
      console.log(`[assert ✓] pending -> freigegeben ueber den ECHTEN Cron-Pfad: ${JSON.stringify(data)}`)
      return
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error(`ASSERT-FAIL: Provision nicht freigegeben binnen 60s — zuletzt: ${JSON.stringify(last)}`)
}

async function cleanup(): Promise<void> {
  const { data: claims } = await db.from('claims').select('id').eq('fall_typ', SMOKE_TAG)
  const ids = (claims ?? []).map((c: { id: string }) => c.id)
  if (ids.length > 0) {
    await db.from('partner_provisionen').delete().in('claim_id', ids)
    await db.from('faelle_claim_bridge').delete().in('claim_id', ids)
    await db.from('claims').delete().in('id', ids)
  }
  // Mitteilungen an throwaway-Profile raeumen (FK blockt sonst den Account-Cleanup — J9-Lehre).
  const { data: prof } = await db
    .from('profiles')
    .select('id')
    .like('email', 'throwaway-%@claimondo.test')
  const pids = (prof ?? []).map((p: { id: string }) => p.id)
  if (pids.length > 0) {
    await db.from('mitteilungen').delete().in('empfaenger_id', pids)
  }
  console.log(`[cleanup] ${ids.length} Wegwerf-Claims (+Provisionen/Bridge) entfernt; Mitteilungen der throwaway-Profile geraeumt.`)
}

async function main(): Promise<void> {
  const phase = arg('phase')
  if (phase === 'seed') return seed()
  if (phase === 'assert') return assertPhase()
  if (phase === 'cleanup') return cleanup()
  console.error('Pflicht-Arg: --phase seed|assert|cleanup')
  process.exit(1)
}

main().catch((err) => {
  console.error('[release-scharf ✗]', err instanceof Error ? err.message : err)
  process.exit(1)
})
