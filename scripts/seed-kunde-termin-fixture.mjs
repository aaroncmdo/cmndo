/**
 * seed-kunde-termin-fixture.mjs — kunde-sichtbarer SV-Termin (claims-native)
 *
 * Erzeugt EINEN bestätigten SV-Begutachtungstermin auf dem Onboarding-fertigen
 * Claim von test-kunde@claimondo.de — mit KORREKTER claim-nativer Verknüpfung,
 * damit der Termin im Kunde-Portal (/kunde/termine + Fallakte) und im SV-Portal
 * erscheint und der Verlegungs-/Reschedule-Pfad ausgeübt werden kann.
 *
 * WARUM dieser Seeder existiert (Root-Cause 2026-06-29):
 *   /kunde/termine filtert gutachter_termine auf `fall_id` — konkret auf
 *   `v_claim_full.fall_id`, das via faelle_claim_bridge == claim_id ist
 *   (CMM-49: fall_id == claim_id). Die Query filtert NICHT auf `claim_id`.
 *   Ein von Hand geseedeter Termin, der nur `claim_id` setzt (und `fall_id`
 *   stale lässt), ist im Kunde-Portal UNSICHTBAR. Echte Flow-Termine setzen
 *   `fall_id` korrekt (live verifiziert: 19/19). Darum setzt dieser Seeder
 *   `fall_id = bridge.fall_id` (== claim_id für moderne Claims) UND `claim_id`.
 *
 * Idempotent: legt nichts an, wenn der Claim bereits einen aktiven
 * (nicht stornierten) SV-Termin hat.
 *
 * Run:  node scripts/seed-kunde-termin-fixture.mjs
 */

import { createRequire } from 'module'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function ladeEnv() {
  const envPath = join(projectRoot, '.env.local')
  if (!existsSync(envPath)) {
    console.error('[FEHLER] .env.local nicht gefunden unter:', envPath)
    process.exit(1)
  }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
}
ladeEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[FEHLER] NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY nötig')
  process.exit(1)
}

const require = createRequire(import.meta.url)
const { createClient } = require('@supabase/supabase-js')
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const KUNDE_EMAIL = 'test-kunde@claimondo.de'
const SV_EMAIL = 'test-sv@claimondo.de'

async function main() {
  // 1. Kunde -> Onboarding-fertiger Claim
  const { data: kunde } = await db.from('profiles').select('id').eq('email', KUNDE_EMAIL).maybeSingle()
  if (!kunde) { console.error(`[FEHLER] ${KUNDE_EMAIL} nicht gefunden`); process.exit(1) }

  const { data: claim } = await db
    .from('claims')
    .select('id, lead_id')
    .eq('geschaedigter_user_id', kunde.id)
    .eq('onboarding_complete', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!claim) { console.error(`[FEHLER] kein onboarding-fertiger Claim für ${KUNDE_EMAIL}`); process.exit(1) }

  // 1b. Geschädigten-Party sicherstellen — DIE zweite Bedingung der gutachter_termine-Kunde-RLS:
  //     `gutachter_termine_kunde_select_consolidated` = (claim_id IS NOT NULL) AND is_claim_user_party(claim_id),
  //     und is_claim_user_party = EXISTS(claim_parties WHERE user_id=auth.uid() AND ist_aktiv=true).
  //     Dünne Seed-Claims haben nur `claims.geschaedigter_user_id` (Spalte), KEINE claim_parties-Zeile →
  //     der Kunde sieht seine Termine NICHT, obwohl er „Eigentümer" ist. convertLeadToClaim legt die Zeile
  //     an (Schritt 4); für hand-geseedete Claims hier nachziehen.
  const { data: party } = await db
    .from('claim_parties')
    .select('id, ist_aktiv')
    .eq('claim_id', claim.id)
    .eq('rolle', 'geschaedigter')
    .eq('user_id', kunde.id)
    .maybeSingle()
  if (!party) {
    const { error: pErr } = await db.from('claim_parties').insert({
      claim_id: claim.id,
      rolle: 'geschaedigter',
      user_id: kunde.id,
      ist_aktiv: true,
      reihenfolge: 1,
      quelle: 'lead_konvertierung',
    })
    if (pErr) { console.error('[FEHLER] Geschädigten-Party-Insert:', pErr.message); process.exit(1) }
    console.log(`[seed] Geschädigten-Party angelegt (user_id=${kunde.id}) -> is_claim_user_party=true`)
  } else if (!party.ist_aktiv) {
    await db.from('claim_parties').update({ ist_aktiv: true }).eq('id', party.id)
    console.log(`[seed] Geschädigten-Party reaktiviert (ist_aktiv=true)`)
  } else {
    console.log(`[seed] Geschädigten-Party bereits aktiv: ${party.id}`)
  }

  // 2. Bridge-fall_id (== claim_id für moderne Claims) — DIE Spalte, die das Kunde-Portal filtert
  const { data: bridge } = await db
    .from('faelle_claim_bridge')
    .select('fall_id')
    .eq('claim_id', claim.id)
    .maybeSingle()
  const fallId = bridge?.fall_id ?? claim.id

  // 3. Idempotenz
  const { data: vorhanden } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, start_zeit')
    .eq('claim_id', claim.id)
    .neq('typ', 'kb_beratung')
    .is('cancelled_at', null)
    .limit(1)
    .maybeSingle()
  if (vorhanden) {
    console.log(`[seed] Aktiver SV-Termin existiert bereits: ${vorhanden.id} (fall_id=${vorhanden.fall_id})`)
    process.exit(0)
  }

  // 4. test-sv sachverstaendige.id
  const { data: svProfile } = await db.from('profiles').select('id').eq('email', SV_EMAIL).maybeSingle()
  const { data: svSac } = svProfile
    ? await db.from('sachverstaendige').select('id').eq('profile_id', svProfile.id).maybeSingle()
    : { data: null }

  // 5. Termin in +5 Tagen, 10:00–12:00 (lokal grob)
  const start = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
  start.setHours(10, 0, 0, 0)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)

  const { data: termin, error } = await db
    .from('gutachter_termine')
    .insert({
      // ── claim-native Verknüpfung — der Kern dieser Fixture ──
      fall_id: fallId,            // == bridge.fall_id == claim_id → Kunde-Query findet ihn
      claim_id: claim.id,
      bezug_typ: 'claim',
      bezug_id: claim.id,
      lead_id: claim.lead_id ?? null,
      // ── SV-Zuweisung ──
      assignee_typ: 'sachverstaendiger',
      assignee_id: svSac?.id ?? null,
      // ── Termin-Daten ──
      typ: 'sv_begutachtung',
      status: 'bestaetigt',
      start_zeit: start.toISOString(),
      end_zeit: end.toISOString(),
      besichtigungsort_adresse: 'Neumarkt, 50667 Köln',
      // ── NOT-NULL-Pflichtfelder ──
      bezahlt: false,
      verlegung_initiator_kunde: false,
      erinnerung_morgen_gesendet: false,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) { console.error('[FEHLER] Termin-Insert:', error.message); process.exit(1) }

  console.log(`[seed] SV-Termin angelegt: ${termin.id}`)
  console.log(`[seed]   claim_id = ${claim.id}`)
  console.log(`[seed]   fall_id  = ${fallId}  (== claim_id: ${fallId === claim.id})`)
  console.log(`[seed]   start    = ${start.toISOString()}`)
  console.log(`[seed] -> /kunde/termine sollte den Termin jetzt zeigen.`)
  process.exit(0)
}

main().catch(e => { console.error('[KRITISCH]', e?.message ?? e); process.exit(1) })
