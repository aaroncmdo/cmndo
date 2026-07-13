// Scratch: Daten-Konsistenz-Audit der abgeleiteten Claim-Views (service-role, umgeht Security-Barrier).
// Vergleicht für Sample-Claims dieselben logischen Felder über v_claim_full / v_faelle_mit_aktuellem_termin
// / v_gutachten_werte / v_claim_phase / v_claim_listing → findet Divergenzen.
//   node --env-file="<repo>/.env.local" scripts/view-consistency-audit.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

async function getRow(view, keyvals) {
  for (const [col, val] of keyvals) {
    if (val == null) continue
    const { data, error } = await sb.from(view).select('*').eq(col, val).limit(1).maybeSingle()
    if (!error && data) return data
    if (error && !/no rows|multiple|column .* does not exist/i.test(error.message)) {
      // erste column-not-exist ignorieren (nächsten Key probieren), sonst loggen
    }
  }
  return null
}

// 6 Sample-Claims (neueste); zusätzlich gezielt welche mit Gutachten.
const { data: withGut } = await sb.from('v_gutachten_werte').select('claim_id').not('reparaturkosten_netto', 'is', null).limit(3)
const gutIds = (withGut ?? []).map((r) => r.claim_id)
const { data: recent } = await sb.from('claims').select('id, lead_id, geschaedigter_user_id, created_at').order('created_at', { ascending: false }).limit(5)
const claimIds = [...new Set([...gutIds, ...(recent ?? []).map((c) => c.id)])].slice(0, 6)
console.log(`Sample-Claims: ${claimIds.length} (davon ${gutIds.length} mit Gutachten-Werten)\n`)

const { data: bridges } = await sb.from('faelle_claim_bridge').select('fall_id, claim_id').in('claim_id', claimIds)
const fallByClaim = Object.fromEntries((bridges ?? []).map((b) => [b.claim_id, b.fall_id]))

const pick = (o, ks) => (o ? ks.map((k) => o[k]).find((v) => v !== undefined && v !== null) ?? (ks.some((k)=>o[k]!==undefined)?null:'∅') : '∅')
const nz = (v) => (v === null || v === undefined ? '·' : v)
let issues = 0

for (const cid of claimIds) {
  const fid = fallByClaim[cid]
  const [vcf, vfmt, vgw, vph, vcl] = await Promise.all([
    getRow('v_claim_full', [['claim_id', cid], ['id', cid], ['fall_id', fid]]),
    getRow('v_faelle_mit_aktuellem_termin', [['claim_id', cid], ['id', fid]]),
    getRow('v_gutachten_werte', [['claim_id', cid]]),
    getRow('v_claim_phase', [['claim_id', cid], ['id', cid]]),
    getRow('v_claim_listing', [['claim_id', cid], ['id', cid], ['fall_id', fid]]),
  ])
  console.log(`── Claim ${cid.slice(0, 8)}  (fall ${fid ? fid.slice(0,8) : '—'}) ──`)
  console.log(`  present: v_claim_full=${!!vcf} v_faelle_termin=${!!vfmt} v_gutachten=${!!vgw} v_claim_phase=${!!vph} v_claim_listing=${!!vcl}`)

  // Kunde-Name cross-view
  const kn = {
    full: [nz(vcf?.kunde_vorname), nz(vcf?.kunde_nachname)].join(' '),
    faelle: [nz(vfmt?.kunde_vorname), nz(vfmt?.kunde_nachname)].join(' '),
    listing: nz(pick(vcl, ['kunde_name', 'kunde_vorname'])) + (vcl?.kunde_nachname ? ' ' + vcl.kunde_nachname : ''),
  }
  const knSet = new Set([kn.full, kn.faelle, kn.listing].filter((x) => x && x !== '· ·' && x !== '∅'))
  const knBad = knSet.size > 1
  if (knBad) issues++
  console.log(`  KUNDE   full="${kn.full}" | faelle="${kn.faelle}" | listing="${kn.listing}"  ${knBad ? '⚠ DIVERGENZ' : 'ok'}`)

  // Gutachten cross-view (full vs faelle-termin vs gutachten-entity)
  const g = {
    full_repk: nz(vcf?.reparaturkosten), faelle_repk: nz(vfmt?.reparaturkosten), ent_repk: nz(vgw?.reparaturkosten_netto),
    full_wm: nz(vcf?.wertminderung), faelle_wm: nz(vfmt?.wertminderung), ent_wm: nz(vgw?.minderwert),
    full_hon: nz(vcf?.gutachter_honorar), faelle_hon: nz(vfmt?.gutachter_honorar), ent_hon: nz(vgw?.gutachten_sv_honorar_netto),
  }
  // Divergenz = Werte weichen ab ODER Präsenz weicht ab (manche View null, andere gesetzt =
  // dasselbe Konzept liegt inkonsistent in den Views vor, z.B. v_claim_full trägt Gutachten nicht).
  const repkAll = [g.full_repk, g.faelle_repk, g.ent_repk]
  const repkPop = repkAll.filter((x) => x !== '·')
  const repkValueBad = new Set(repkPop.map(String)).size > 1
  const repkPresenceBad = repkPop.length > 0 && repkPop.length < repkAll.length
  const repkBad = repkValueBad || repkPresenceBad
  if (repkBad) issues++
  console.log(`  REPK    full=${g.full_repk} | faelle=${g.faelle_repk} | entity=${g.ent_repk}  ${repkValueBad ? '⚠ WERT-DIVERGENZ' : repkPresenceBad ? '⚠ PRÄSENZ-DIVERGENZ (Konzept liegt inkonsistent in Views)' : 'ok'}`)
  console.log(`  WERTMIN full=${g.full_wm} | faelle=${g.faelle_wm} | entity=${g.ent_wm}`)
  console.log(`  HONORAR full=${g.full_hon} | faelle=${g.faelle_hon} | entity=${g.ent_hon}`)

  // Phase cross-view
  const ph = { full: nz(vcf?.main_phase) + '/' + nz(vcf?.sub_phase), faelle: nz(vfmt?.main_phase) + '/' + nz(vfmt?.sub_phase), phase: nz(vph?.main_phase) + '/' + nz(vph?.sub_phase) }
  const phSet = new Set([ph.full, ph.faelle, ph.phase].filter((x) => x !== '·/·'))
  const phBad = phSet.size > 1
  if (phBad) issues++
  console.log(`  PHASE   full=${ph.full} | faelle=${ph.faelle} | v_claim_phase=${ph.phase}  ${phBad ? '⚠ DIVERGENZ' : 'ok'}`)

  // Gegner + service_typ
  const gg = { full: nz(vcf?.gegner_name), faelle: nz(vfmt?.gegner_name) }
  const ggBad = gg.full !== '·' && gg.faelle !== '·' && String(gg.full) !== String(gg.faelle)
  if (ggBad) issues++
  console.log(`  GEGNER  full="${gg.full}" | faelle="${gg.faelle}"  ${ggBad ? '⚠ DIVERGENZ' : 'ok'}`)
  console.log('')
}
console.log(`\n== ${issues} Divergenz-Signale ==`)
