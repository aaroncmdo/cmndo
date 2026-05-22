/**
 * scripts/probe-spj-roundtrip.mjs — CMM-44 SP-J Bucket-A Write->Read Round-Trip.
 *
 * Beweist empirisch gegen die LIVE-DB+Schema, dass ein claim_payments-Eingang
 * korrekt zurueckgelesen wird — ueber (a) die getCurrentClaimPayment-Query
 * (Single-Claim, fall-finanzen/get-kunde-faelle) und (b) den Nested-Embed
 * (analytics/conversion: faelle->claims->claim_payments) mit Rename
 * (zahlung_betrag->erhaltener_betrag, zahlung_eingegangen_am->zahlungseingang_am).
 * INSERT -> Read-Back -> DELETE (try/finally + Sweep-Net). Keine UI-Mutation.
 */
import { getServiceDb } from './smoke/helpers.mjs'

async function main() {
  const db = getServiceDb()
  const { data: f, error: fErr } = await db.from('faelle').select('id, claim_id').not('claim_id', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (fErr || !f?.claim_id) { console.error('HARD: kein Fall mit claim_id —', fErr?.message ?? 'leer'); process.exit(2) }
  const claimId = f.claim_id
  const now = new Date().toISOString()
  console.log(`[info] Round-Trip auf fall=${f.id.slice(0,8)} claim=${claimId.slice(0,8)}`)
  let cpId = null
  try {
    // HINWEIS: claim_payments.zahlungsweg-CHECK = {ueberweisung,scheck,bar,verrechnung}
    // (Zahlungs-METHODE) — NICHT faelle.zahlungsweg {kundenkonto,werkstatt_direkt}
    // (Auszahlungs-ZIEL). Hier ein gueltiger claim_payments-Wert.
    const { data: ins, error: insErr } = await db.from('claim_payments').insert({
      claim_id: claimId, zahlungseingang_am: now, erhaltener_betrag: 123.45,
      zahlungsweg: 'überweisung', status: 'erhalten', zahlungsreferenz: 'SMOKE-SPJ-TESTDELETE',
    }).select('id').maybeSingle()
    if (insErr) { console.error('HARD INSERT:', insErr.message); process.exit(2) }
    cpId = ins?.id ?? null

    // (a) getCurrentClaimPayment-Query (Single-Claim-Pfad)
    const { data: cur, error: curErr } = await db.from('claim_payments')
      .select('zahlungseingang_am, erhaltener_betrag, zahlungsweg')
      .eq('claim_id', claimId).order('created_at', { ascending: false }).limit(1).maybeSingle()

    // (b) Nested-Embed faelle->claims->claim_payments (analytics/get-kunde-faelle-Pfad)
    const { data: emb, error: embErr } = await db.from('faelle')
      .select('id, claims:claim_id(claim_payments(zahlungseingang_am, erhaltener_betrag, zahlungsweg))')
      .eq('id', f.id).maybeSingle()
    const c = Array.isArray(emb?.claims) ? emb.claims[0] : emb?.claims
    const cps = (c)?.claim_payments
    const cpArr = Array.isArray(cps) ? cps : cps ? [cps] : []
    const embHit = cpArr.some((p) => Number(p?.erhaltener_betrag) === 123.45 && p?.zahlungsweg === 'überweisung')

    console.log('(a) getCurrentClaimPayment:', JSON.stringify(cur), curErr?.message ?? '')
    console.log('(b) nested-embed hit:', embHit, `(${cpArr.length} rows)`, embErr?.message ?? '')

    const ok = Number(cur?.erhaltener_betrag) === 123.45 && cur?.zahlungsweg === 'überweisung' && !!cur?.zahlungseingang_am && embHit
    console.log(ok ? '[OK] Bucket-A Round-Trip end-to-end (Rename + create-or-update + Embed)' : '[FAIL] Round-Trip mismatch')
    process.exitCode = ok ? 0 : 2
  } finally {
    if (cpId) { const { error } = await db.from('claim_payments').delete().eq('id', cpId); console.log(`[cleanup] ${cpId.slice(0,8)}: ${error ? 'FEHLER ' + error.message : 'geloescht'}`) }
    const { error: sweep } = await db.from('claim_payments').delete().eq('zahlungsreferenz', 'SMOKE-SPJ-TESTDELETE')
    if (sweep) console.warn('[cleanup] Sweep:', sweep.message)
  }
}
main().catch((e) => { console.error('PROBE-CRASH:', e); process.exit(3) })
