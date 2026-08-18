// Seed fuer den Regel-4-Smoke der Stille-Write-Serie: legt fuer test-sv EINEN
// Termin im Status 'reserviert' an — den Zustand, den sonst Dispatch mit einem
// Termin-Vorschlag erzeugt. Nur damit ist die Zusage-Flaeche im Gutachter-Profil
// ueberhaupt sichtbar (page.tsx filtert auf reserviert|gegenvorschlag).
//
// Sicherheit: ausschliesslich test-sv@claimondo.de (telefon = NULL) und ein
// Termin OHNE Fall-/Claim-Bezug -> es haengt kein Kundenvorgang daran und es
// geht keine Nachricht raus. Ausgabe: die Termin-Id fuer Spec + Cleanup.
//
// Aufruf:  node --env-file=.env.local scripts/smoke/silent-writes-terminzusage-seed.mjs [--cleanup]
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (--env-file=.env.local?)')
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })
const MARKER = 'Regel-4-Smoke Stille-Writes'

// Zwei getrennte Abfragen: profiles<->sachverstaendige hat mehrere Fremdschluessel,
// ein Embed waere mehrdeutig.
async function svId() {
  const { data: prof, error: profErr } = await db
    .from('profiles')
    .select('id')
    .eq('email', 'test-sv@claimondo.de')
    .single()
  if (profErr) throw new Error(`Profil test-sv nicht gefunden: ${profErr.message}`)
  const { data: sv, error: svErr } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', prof.id)
    .single()
  if (svErr) throw new Error(`sachverstaendige-Datensatz fehlt: ${svErr.message}`)
  return sv.id
}

async function cleanup(id) {
  const { data, error } = await db
    .from('gutachter_termine')
    .delete()
    .eq('assignee_id', id)
    .eq('assignee_typ', 'sachverstaendiger')
    .eq('ablehnungsgrund', MARKER)
    .select('id')
  if (error) throw new Error(`Cleanup fehlgeschlagen: ${error.message}`)
  console.log(`[seed] aufgeraeumt: ${data?.length ?? 0} Termin(e)`)
}

const id = await svId()

if (process.argv.includes('--cleanup')) {
  await cleanup(id)
  process.exit(0)
}

// Vorherige Reste desselben Smokes entfernen (idempotent).
await cleanup(id)

// Weit in der Zukunft -> kollidiert nicht mit echten Terminen (Exclusion-Constraint).
const start = new Date(Date.now() + 400 * 24 * 3600 * 1000)
start.setUTCHours(9, 0, 0, 0)
const ende = new Date(start.getTime() + 40 * 60 * 1000)

const { data, error } = await db
  .from('gutachter_termine')
  .insert({
    assignee_id: id,
    assignee_typ: 'sachverstaendiger',
    start_zeit: start.toISOString(),
    end_zeit: ende.toISOString(),
    status: 'reserviert',
    typ: 'sv_begutachtung',
    ablehnungsgrund: MARKER, // dient hier NUR als Wiedererkennung fuers Cleanup
  })
  .select('id')
  .single()

if (error) {
  console.error(`[seed] Insert fehlgeschlagen: ${error.message}`)
  process.exit(1)
}
console.log(`[seed] Termin angelegt: ${data.id} (${start.toISOString()})`)
