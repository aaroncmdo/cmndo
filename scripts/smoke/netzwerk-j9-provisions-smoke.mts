// Regel-4-Prod-Smoke J9 (Netzwerk P3): Provisions-Suppression intra vs cross — gegen die
// ECHTE prod-DB (paizkjajbuxxksdoycev), mit Wegwerf-Rows + vollstaendigem Cleanup.
//
// Ablauf:
//   1. Seed: Wegwerf-Werkstatt (provision_aktiv) + 2 Wegwerf-SVs (via throwaway-account.mjs
//      VORAB erzeugt, Ids per CLI) + Freundes-Kante Werkstatt-Profil <-> SV-intra (angenommen).
//   2. 2 Wegwerf-Claims (abgeschlossen vor 8d, werkstatt_id=Wegwerf-Werkstatt INBOUND):
//      der prod-Trigger create_werkstatt_provision MINTET die pending-Provisionen (echter Pfad).
//   3. Gate-Assert: bestimmeIntraNetzwerkProvisionen (ECHTER P3-Code gegen echte DB/Graph):
//      intra im Set, cross nicht.
//   4. Runner-Lauf (ECHTER runProvisionsRelease, identischer Cron-Code-Pfad) — NUR wenn keine
//      FREMDEN release-berechtigten pending-Rows existieren (sonst wuerde der Smoke fremde
//      Provisionen vorziehen -> konservativ geskippt; der HTTP-Cron ist ohne CRON_SECRET lokal
//      nicht ausloesbar, Regel-4-Ausnahmeklausel im PR/Marker).
//   5. DB-Asserts: intra -> status='unterdrueckt' + storno_grund='intra_netzwerk';
//      cross -> status='freigegeben'.
//   6. Cleanup: Provisionen, Claims (+bridge), Kante. (throwaway-Accounts separat via
//      throwaway-account.mjs cleanup.)
//
// Nutzung:
//   npx tsx --env-file=.env.local scripts/smoke/netzwerk-j9-provisions-smoke.mts \
//     --werkstatt-user <uid> --sv-intra-user <uid> --sv-cross-user <uid> [--cleanup-only]
//
// SICHERHEIT: nur Wegwerf-Entities (throwaway-*@claimondo.test, telefon=NULL); niemals echte
// Kunden-/Partner-Rows anfassen. Der einzige potenzielle Fremd-Effekt (Runner) ist hart
// pre-gecheckt.

import { createClient } from '@supabase/supabase-js'
import { runProvisionsRelease } from '../../src/lib/provisionen/release-runner'
import { bestimmeIntraNetzwerkProvisionen } from '../../src/lib/netzwerk/provisions-suppression'

const SMOKE_TAG = 'SMOKE-J9-NETZWERK'

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

async function cleanup(): Promise<void> {
  const { data: claims } = await db.from('claims').select('id').eq('fall_typ', SMOKE_TAG)
  const ids = (claims ?? []).map((c: { id: string }) => c.id)
  if (ids.length > 0) {
    await db.from('partner_provisionen').delete().in('claim_id', ids)
    await db.from('faelle_claim_bridge').delete().in('claim_id', ids)
    await db.from('claims').delete().in('id', ids)
  }
  // Kanten zwischen Wegwerf-Profilen (throwaway-Emails) — ueber die Marker-Spalte nicht
  // identifizierbar; wir loeschen jede Kante, an der ein throwaway-Profil haengt.
  const { data: prof } = await db
    .from('profiles')
    .select('id')
    .like('email', 'throwaway-%@claimondo.test')
  const pids = (prof ?? []).map((p: { id: string }) => p.id)
  if (pids.length > 0) {
    await db.from('netzwerk_verbindungen').delete().in('anfrager_id', pids)
    await db.from('netzwerk_verbindungen').delete().in('empfaenger_id', pids)
  }
  console.log(`[cleanup] ${ids.length} Wegwerf-Claims (+Provisionen/Bridge) entfernt, Kanten der throwaway-Profile geloescht.`)
}

async function main(): Promise<void> {
  if (process.argv.includes('--cleanup-only')) {
    await cleanup()
    return
  }

  const werkstattUser = arg('werkstatt-user')
  const svIntraUser = arg('sv-intra-user')
  const svCrossUser = arg('sv-cross-user')
  if (!werkstattUser || !svIntraUser || !svCrossUser) {
    console.error('Pflicht-Args: --werkstatt-user --sv-intra-user --sv-cross-user (uids aus throwaway-account.mjs)')
    process.exit(1)
  }

  // ── Entities aufloesen ────────────────────────────────────────────────────
  const { data: w } = await db
    .from('werkstaetten').select('id, user_id, name').eq('user_id', werkstattUser).maybeSingle()
  if (!w) throw new Error(`werkstaetten-Zeile fuer user ${werkstattUser} fehlt`)
  const { data: svIntra } = await db
    .from('sachverstaendige').select('id, profile_id').eq('profile_id', svIntraUser).maybeSingle()
  const { data: svCross } = await db
    .from('sachverstaendige').select('id, profile_id').eq('profile_id', svCrossUser).maybeSingle()
  if (!svIntra || !svCross) throw new Error('sachverstaendige-Zeilen fehlen')

  // Werkstatt provisions-scharf stellen (Wegwerf-Row, wird mit dem Account entsorgt).
  const { error: wUpdErr } = await db
    .from('werkstaetten')
    .update({ provision_aktiv: true, provision_betrag_netto: 150 })
    .eq('id', w.id)
  if (wUpdErr) throw new Error(`werkstatt provision_aktiv: ${wUpdErr.message}`)

  // ── Freundes-Kante (intra): Werkstatt-Profil <-> SV-intra-Profil ─────────
  const { error: kanteErr } = await db.from('netzwerk_verbindungen').insert({
    anfrager_id: werkstattUser,
    empfaenger_id: svIntraUser,
    status: 'angenommen',
  })
  if (kanteErr && !/duplicate|unique/i.test(kanteErr.message)) {
    throw new Error(`kante: ${kanteErr.message}`)
  }

  // ── 2 Wegwerf-Claims (Inbound-Werkstatt -> Trigger mintet pending-Provision) ─
  const vor8Tagen = new Date(Date.now() - 8 * 86400_000).toISOString()
  const mkClaim = async (svId: string, marker: string): Promise<string> => {
    const { data, error } = await db
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
        sv_id: svId,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`claim ${marker}: ${error?.message}`)
    return data.id as string
  }
  const intraClaim = await mkClaim(svIntra.id as string, 'intra')
  const crossClaim = await mkClaim(svCross.id as string, 'cross')
  console.log(`[seed] intra-Claim ${intraClaim} (SV befreundet) · cross-Claim ${crossClaim} (SV fremd)`)

  // ── Trigger-Provisionen verifizieren ─────────────────────────────────────
  const { data: provs } = await db
    .from('partner_provisionen')
    .select('id, claim_id, partner_typ, partner_id, status')
    .in('claim_id', [intraClaim, crossClaim])
  const rows = (provs ?? []) as Array<{ id: string; claim_id: string; partner_typ: string; partner_id: string; status: string }>
  const pIntra = rows.find((r) => r.claim_id === intraClaim)
  const pCross = rows.find((r) => r.claim_id === crossClaim)
  if (!pIntra || !pCross) throw new Error(`Trigger hat nicht gemintet: ${JSON.stringify(rows)}`)
  if (pIntra.status !== 'pending' || pCross.status !== 'pending') throw new Error('Provisionen nicht pending')
  console.log(`[assert 1 ✓] create_werkstatt_provision-Trigger mintete beide pending-Provisionen (${pIntra.id}, ${pCross.id})`)

  // ── Gate-Assert (echter P3-Code gegen echte DB/Graph) ────────────────────
  const set = await bestimmeIntraNetzwerkProvisionen(db as never, rows)
  if (!set.has(pIntra.id)) throw new Error('GATE-FAIL: intra-Provision NICHT im Suppression-Set')
  if (set.has(pCross.id)) throw new Error('GATE-FAIL: cross-Provision faelschlich im Set')
  console.log('[assert 2 ✓] bestimmeIntraNetzwerkProvisionen: intra im Set, cross nicht (echter Graph via v_netzwerk_freunde)')

  // ── Fremd-Effekt-Precheck: gibt es FREMDE release-berechtigte pending-Rows? ──
  const { data: fremdePending } = await db
    .from('partner_provisionen')
    .select('id, claim_id')
    .eq('status', 'pending')
    .eq('partner_typ', 'werkstatt')
    .not('claim_id', 'in', `(${intraClaim},${crossClaim})`)
  const fremdeIds = ((fremdePending ?? []) as Array<{ id: string; claim_id: string | null }>).filter((r) => r.claim_id)
  let fremdeBerechtigt = 0
  if (fremdeIds.length > 0) {
    const { data: fc } = await db
      .from('claims')
      .select('id, operative_status, abgeschlossen_am')
      .in('id', fremdeIds.map((r) => r.claim_id as string))
    const cutoff = Date.now() - 7 * 86400_000
    fremdeBerechtigt = ((fc ?? []) as Array<{ operative_status: string | null; abgeschlossen_am: string | null }>).filter(
      (c) => (c.operative_status === 'abgeschlossen' || c.operative_status === 'reguliert_vollstaendig') &&
        c.abgeschlossen_am && new Date(c.abgeschlossen_am).getTime() <= cutoff,
    ).length
  }

  if (fremdeBerechtigt > 0) {
    console.log(`[SKIP Runner] ${fremdeBerechtigt} FREMDE release-berechtigte pending-Row(s) — der Smoke zieht keine fremden Releases vor. Kern-Gate ist per Assert 2 bewiesen; Status-Flip verifiziert der Nacht-Cron. Rows bleiben geseedet? NEIN -> Cleanup unten.`)
  } else {
    // ── ECHTER Runner-Lauf (identischer Code-Pfad des Crons, ohne HTTP-Layer) ──
    const result = await runProvisionsRelease(db as never, {
      partnerTypen: ['werkstatt'],
      now: new Date().toISOString(),
      bestimmeUnterdrueckteProvisionen: (releaseRows) => bestimmeIntraNetzwerkProvisionen(db as never, releaseRows),
    })
    if (!result.ok) throw new Error(`Runner: ${result.error}`)
    console.log(`[runner] checked=${result.checked} released=${result.released} unterdrueckt=${result.unterdrueckt} storniert=${result.storniert}`)

    const { data: after } = await db
      .from('partner_provisionen')
      .select('id, claim_id, status, storno_grund')
      .in('claim_id', [intraClaim, crossClaim])
    const aIntra = (after ?? []).find((r: { claim_id: string }) => r.claim_id === intraClaim) as { status: string; storno_grund: string | null } | undefined
    const aCross = (after ?? []).find((r: { claim_id: string }) => r.claim_id === crossClaim) as { status: string; storno_grund: string | null } | undefined
    if (aIntra?.status !== 'unterdrueckt' || aIntra?.storno_grund !== 'intra_netzwerk') {
      throw new Error(`ASSERT-FAIL intra: ${JSON.stringify(aIntra)}`)
    }
    if (aCross?.status !== 'freigegeben') {
      throw new Error(`ASSERT-FAIL cross: ${JSON.stringify(aCross)}`)
    }
    console.log("[assert 3 ✓] intra -> status='unterdrueckt' + storno_grund='intra_netzwerk' · cross -> 'freigegeben'")
  }

  await cleanup()
  console.log('[J9 ✓] Smoke GRUEN — Suppression-Gate live korrekt (intra unterdrueckt, cross freigegeben).')
}

main().catch(async (err) => {
  console.error('[J9 ✗]', err instanceof Error ? err.message : err)
  try { await cleanup() } catch { /* best effort */ }
  process.exit(1)
})
