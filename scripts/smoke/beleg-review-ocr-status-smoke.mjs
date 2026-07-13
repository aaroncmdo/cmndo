/**
 * scripts/smoke/beleg-review-ocr-status-smoke.mjs
 *
 * Prod-DB-Beweis für den beleg-review Fix (approveBeleg/rejectBeleg).
 * Nutzt den Service-Role-Client (SDK/DML — KEIN execute_sql, KEIN DDL → Regel 2 ok).
 *
 * Beweist gegen die ECHTE prod-DB:
 *   1. ALT: .update({ ocr_status: 'approved' })  → CHECK-Constraint verwirft (Bug).
 *   2. NEU (approve): _review.status='approved' im JSONB, ocr_status unberührt → Erfolg.
 *   3. NEU (reject):  _review.status='rejected' im JSONB, ocr_status unberührt → Erfolg.
 *
 * Seedet 2 temporäre kunde_upload_ocr-Belege auf test-kunde's Fall und löscht sie
 * am Ende wieder (harte DELETEs). Kein Cleanup-Rückstand.
 *
 * Lauf:  node scripts/smoke/beleg-review-ocr-status-smoke.mjs
 */

import { getServiceDb } from './helpers.mjs'

const TEST_KUNDE = 'test-kunde@claimondo.de'
const db = getServiceDb()

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail++
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function resolveTestFall() {
  const { data: kunde } = await db.from('profiles').select('id').eq('email', TEST_KUNDE).maybeSingle()
  if (!kunde?.id) throw new Error(`${TEST_KUNDE} nicht gefunden`)
  const { data: leads } = await db.from('leads').select('id').eq('kunde_id', kunde.id)
  const leadIds = (leads ?? []).map((l) => l.id)
  if (leadIds.length === 0) throw new Error('Keine Leads für test-kunde')
  const { data: claims } = await db.from('claims').select('id').in('lead_id', leadIds)
  const claimIds = (claims ?? []).map((c) => c.id)
  if (claimIds.length === 0) throw new Error('Keine Claims für test-kunde')
  const { data: bridge } = await db
    .from('faelle_claim_bridge')
    .select('fall_id, claim_id')
    .in('claim_id', claimIds)
    .limit(1)
    .maybeSingle()
  if (!bridge?.fall_id) throw new Error('Keine faelle_claim_bridge-Row für test-kunde')
  return bridge
}

async function seedBeleg(fall_id, claim_id, nummer) {
  const { data, error } = await db
    .from('fall_dokumente')
    .insert({
      fall_id,
      claim_id,
      // bewusst NICHT mietwagen_rechnung → kein claims.mietwagen_rechnung_vorhanden-Seiteneffekt
      dokument_typ: 'werkstatt_rechnung',
      kategorie: 'rechnung',
      quelle: 'kunde_upload_ocr',
      uploaded_by_kunde: true,
      storage_path: `ocr-extrakt/smoke-beleg-review/${nummer}-${Date.now()}-inline`,
      ocr_extracted_data: {
        typ: 'werkstatt_rechnung',
        rechnungsnummer: `SMOKE-${nummer}`,
        rechnungsbetrag_brutto: 119,
      },
      ocr_processed_at: new Date().toISOString(),
      ocr_status: 'done',
      sichtbar_fuer: ['admin', 'kundenbetreuer'],
    })
    .select('id, ocr_status, ocr_extracted_data')
    .single()
  if (error) throw new Error(`Seed ${nummer} fehlgeschlagen: ${error.message}`)
  return data
}

async function main() {
  console.log('▶ beleg-review ocr_status Fix — Prod-DB-Smoke\n')
  const { fall_id, claim_id } = await resolveTestFall()
  console.log(`Fall: ${fall_id}\n`)

  const b1 = await seedBeleg(fall_id, claim_id, 1)
  const b2 = await seedBeleg(fall_id, claim_id, 2)
  const cleanup = [b1.id, b2.id]

  try {
    // 1) ALT-Write muss am CHECK scheitern
    const { error: oldErr } = await db
      .from('fall_dokumente')
      .update({ ocr_status: 'approved' })
      .eq('id', b1.id)
    check(
      'ALT .update({ocr_status:"approved"}) wird vom CHECK verworfen',
      !!oldErr && /ocr_status_check|check constraint|violates/i.test(oldErr.message),
      oldErr ? oldErr.message.slice(0, 80) : 'KEIN Fehler (unerwartet!)',
    )

    // 2) NEU approve: _review im JSONB, ocr_status unberührt
    const approveUpdate = {
      ocr_extracted_data: {
        ...b1.ocr_extracted_data,
        _review: { status: 'approved', reviewed_by: 'smoke', reviewed_at: new Date().toISOString() },
      },
    }
    const { error: apprErr } = await db.from('fall_dokumente').update(approveUpdate).eq('id', b1.id)
    check('NEU approve-Write ohne ocr_status → Erfolg', !apprErr, apprErr?.message ?? 'ok')
    const { data: b1after } = await db
      .from('fall_dokumente')
      .select('ocr_status, ocr_extracted_data')
      .eq('id', b1.id)
      .single()
    check('  → _review.status == approved', b1after?.ocr_extracted_data?._review?.status === 'approved')
    check('  → ocr_status bleibt done (NICHT approved)', b1after?.ocr_status === 'done', `ist: ${b1after?.ocr_status}`)

    // 3) NEU reject
    const rejectUpdate = {
      ocr_extracted_data: {
        ...b2.ocr_extracted_data,
        _review: {
          status: 'rejected',
          reviewed_by: 'smoke',
          reviewed_at: new Date().toISOString(),
          grund: 'smoke-test',
        },
      },
    }
    const { error: rejErr } = await db.from('fall_dokumente').update(rejectUpdate).eq('id', b2.id)
    check('NEU reject-Write ohne ocr_status → Erfolg', !rejErr, rejErr?.message ?? 'ok')
    const { data: b2after } = await db
      .from('fall_dokumente')
      .select('ocr_status, ocr_extracted_data')
      .eq('id', b2.id)
      .single()
    check('  → _review.status == rejected', b2after?.ocr_extracted_data?._review?.status === 'rejected')
    check('  → ocr_status bleibt done (NICHT rejected)', b2after?.ocr_status === 'done', `ist: ${b2after?.ocr_status}`)
  } finally {
    const { error: delErr } = await db.from('fall_dokumente').delete().in('id', cleanup)
    console.log(`\nCleanup: ${delErr ? 'FEHLER ' + delErr.message : `${cleanup.length} Temp-Belege gelöscht`}`)
  }

  console.log(`\n${fail === 0 ? '✅ ALLE' : '❌'} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('SMOKE-FEHLER:', err.message)
  process.exit(1)
})
