#!/usr/bin/env node
// Einmaliger Backfill: enrollt BESTEHENDE aktive Werkstaetten OHNE ersten Fall in den
// Onboarding-Aktivierungs-Drip. Anker = HEUTE (enrollment.erstellt_am = now) -> Mail 1 heute,
// Mail 2 in 3 Tagen usw. — NICHT rueckwirkend ab altem aktiviert_am.
//
// Lauf:  node --env-file=.env.local scripts/werkstatt-onboarding-backfill.mjs           (dry-run: nur Zaehlung)
//        node --env-file=.env.local scripts/werkstatt-onboarding-backfill.mjs --live     (scharf: legt Enrollments an)
//
// ⚠ SCHARF (--live) loest in den Folgetagen ECHTE Mails an ECHTE Werkstaetten aus, sobald der
//   Cron in der VPS-crontab scharf ist. Voraussetzung: (1) Mail-Copy freigegeben, (2) Route auf
//   prod deployed, (3) Regel-4-Smoke gruen. Bonus-Mail bleibt aktiv=false (Legal-Gate).
import { createClient } from '@supabase/supabase-js'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file=.env.local?).')
  process.exit(1)
}
const LIVE = process.argv.includes('--live')
const db = createClient(URL_, KEY)

const { data: wks, error: wkErr } = await db
  .from('werkstaetten')
  .select('id, name, email')
  .eq('status', 'aktiv')
  .not('email', 'is', null)
if (wkErr) {
  console.error('werkstaetten-Query fehlgeschlagen:', wkErr.message)
  process.exit(1)
}

const { data: step1 } = await db.from('werkstatt_onboarding_steps').select('offset_tage').eq('position', 1).single()
const step1Offset = step1?.offset_tage ?? 0

let kandidaten = 0
let enrolled = 0
for (const w of wks ?? []) {
  // schon einen Fall? -> nicht enrollen (Ziel bereits erreicht)
  const { count: prov } = await db.from('partner_provisionen').select('id', { count: 'exact', head: true }).eq('partner_typ', 'werkstatt').eq('partner_id', w.id)
  if ((prov ?? 0) > 0) continue
  const { count: claim } = await db.from('claims').select('id', { count: 'exact', head: true }).eq('reparatur_werkstatt_id', w.id)
  if ((claim ?? 0) > 0) continue
  // schon enrolled? -> idempotent ueberspringen
  const { count: schon } = await db.from('werkstatt_onboarding_enrollments').select('id', { count: 'exact', head: true }).eq('werkstatt_id', w.id)
  if ((schon ?? 0) > 0) continue

  kandidaten++
  if (LIVE) {
    const { error } = await db.from('werkstatt_onboarding_enrollments').upsert(
      {
        werkstatt_id: w.id,
        aktueller_step: 0,
        next_send_at: new Date(Date.now() + step1Offset * 86400000).toISOString(),
        status: 'aktiv',
      },
      { onConflict: 'werkstatt_id', ignoreDuplicates: true },
    )
    if (error) console.error(`  enroll-Fehler ${w.id} (${w.name}):`, error.message)
    else enrolled++
  }
}

console.log(
  LIVE
    ? `[backfill] SCHARF: ${enrolled}/${kandidaten} Werkstaetten enrolled (Anker=heute; Mail 1 beim naechsten Cron-Lauf).`
    : `[backfill] dry-run: ${kandidaten} Kandidaten (status=aktiv, mit email, kein Fall, noch nicht enrolled). --live zum Anlegen.`,
)
