// CMM-50 END-TO-END Smoke: beweist die ganze Kette gegen die Live-DB —
//   50.0 (RPC -> vehicles-Row) + 50.1 (Secondary-UPDATE Snapshot + Casts)
//   + 50.3a (3 repointete Views surfacen die vehicle-Daten via COALESCE+JOIN).
// Haengt ein Test-Vehicle KURZ an einen echten Claim, prueft die Views, und
// revertiert IMMER (finally) + loescht das Test-Vehicle. Kein bleibender Change.
//   cwd = Haupt-Repo (.env.local).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const env = (k) => readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '')
const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } })
const TEST_FIN = 'WDB50E2ECMM300012'
let exitCode = 0
const ok = (b, m) => { console.log(`   ${b ? '✓' : '✗'} ${m}`); if (!b) exitCode = 2 }

async function main() {
  let claimId = null, fallId = null, origVid = undefined, vid = null
  try {
    await db.from('vehicles').delete().eq('fin', TEST_FIN)

    // 50.0: RPC legt vehicles-Row an
    const { data: rid, error: rpcErr } = await db.rpc('upsert_vehicle_by_fin', {
      p_fin: TEST_FIN, p_kennzeichen: 'B-E2E-1', p_hersteller: 'SMOKE-CMM503', p_modell: 'E2E-Modell',
    })
    vid = rid
    console.log('50.0 — Write-Path (RPC):')
    ok(!rpcErr && typeof vid === 'string', `vehicles-Row + UUID (${vid})`)

    // 50.1: Secondary-UPDATE Snapshot-Restfelder + Casts
    const { error: updErr } = await db.from('vehicles').update({
      bauart: 'TestBauart', baujahr_monat: '2021-01-01', farbe_klartext: 'E2E-Blau', farbcode: 'E2E9',
      erstzulassung: '2020-06-15', fahrzeug_ausstattung: { e2e: true }, kennzeichen_buchstaben: 'XY',
      fin_quelle: 'e2e_smoke', fin_extrahiert_am: new Date().toISOString(),
    }).eq('id', vid)
    console.log('50.1 — Schema-Lücke + Secondary-UPDATE:')
    ok(!updErr, 'Snapshot-Restfelder (bauart/baujahr_monat/farbcode/…) geschrieben')

    // 50.2: business-Spalten existieren auf claims (Schreib-fähig)
    console.log('50.2 — business→claims:')
    const { error: bizErr } = await db.from('claims').select('leasinggeber_name, finanzierung_bank').limit(1)
    ok(!bizErr, 'claims.leasinggeber_name + finanzierung_bank existieren/lesbar')

    // Claim + zugehörige faelle holen (für die View-Keys)
    const { data: fr } = await db.from('faelle').select('id, claim_id').not('claim_id', 'is', null).limit(1).single()
    fallId = fr?.id; claimId = fr?.claim_id
    if (!claimId) { ok(false, 'Kein Claim mit faelle gefunden — View-Smoke übersprungen'); return }
    const { data: cr } = await db.from('claims').select('vehicle_id').eq('id', claimId).single()
    origVid = cr?.vehicle_id ?? null

    // Test-Vehicle KURZ an den Claim haengen
    await db.from('claims').update({ vehicle_id: vid }).eq('id', claimId)

    // 50.3a: Views surfacen die vehicle-Daten via COALESCE+JOIN
    console.log(`50.3a — View-Repoint (Claim ${claimId} kurz verlinkt):`)
    const { data: vcf } = await db.from('v_claim_full').select('kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_typ').eq('id', claimId).single()
    ok(vcf?.fahrzeug_hersteller === 'SMOKE-CMM503', `v_claim_full.fahrzeug_hersteller = ${vcf?.fahrzeug_hersteller}`)
    ok(vcf?.kennzeichen === 'B-E2E-1', `v_claim_full.kennzeichen = ${vcf?.kennzeichen}`)
    ok(vcf?.fahrzeug_typ === 'TestBauart', `v_claim_full.fahrzeug_typ (←vehicles.bauart) = ${vcf?.fahrzeug_typ}`)
    const { data: kv } = await db.from('faelle_kunde_view').select('kennzeichen, fahrzeug_hersteller, fahrzeug_baujahr').eq('id', fallId).single()
    ok(kv?.fahrzeug_hersteller === 'SMOKE-CMM503', `faelle_kunde_view.fahrzeug_hersteller = ${kv?.fahrzeug_hersteller}`)
    ok(kv?.fahrzeug_baujahr === 2021, `faelle_kunde_view.fahrzeug_baujahr (←EXTRACT YEAR baujahr_monat) = ${kv?.fahrzeug_baujahr}`)
    const { data: sv } = await db.from('faelle_sv_view').select('kennzeichen, fahrzeug_hersteller').eq('id', fallId).single()
    ok(sv?.fahrzeug_hersteller === 'SMOKE-CMM503', `faelle_sv_view.fahrzeug_hersteller = ${sv?.fahrzeug_hersteller}`)
  } finally {
    // IMMER revertieren + cleanup
    if (claimId !== null && origVid !== undefined) {
      await db.from('claims').update({ vehicle_id: origVid }).eq('id', claimId)
      const { data: chk } = await db.from('claims').select('vehicle_id').eq('id', claimId).single()
      console.log('Cleanup:')
      ok((chk?.vehicle_id ?? null) === (origVid ?? null), `claims.vehicle_id zurückgesetzt auf ${origVid}`)
    }
    await db.from('vehicles').delete().eq('fin', TEST_FIN)
    const { count } = await db.from('vehicles').select('id', { count: 'exact', head: true }).eq('fin', TEST_FIN)
    ok(count === 0, `Test-Vehicle entfernt (verbleibend ${count})`)
    const { count: total } = await db.from('vehicles').select('id', { count: 'exact', head: true })
    console.log(`   vehicles total nach Smoke: ${total} (Baseline 0)`)
  }
  console.log(exitCode === 0 ? '\n✅ CMM-50 E2E-SMOKE PASS — 50.0→50.1→50.3a Kette wirkt live; Views surfacen vehicle-Daten.' : `\n❌ EXIT ${exitCode}`)
}
main().then(() => process.exit(exitCode)).catch((e) => { console.error(e); process.exit(2) })
