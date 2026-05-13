// Pre-Run-Reset — idempotent. Vor JEDEM Iter-Start.
// Purged Test-Mandant-Daten, setzt Flags zurück, neuen flow_link-Token.

import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'

export async function seedReset() {
  // 1. Schema-Drift-Guard zuerst — wenn Drift, gar nicht erst seeden.
  try {
    const out = execSync('npx supabase db diff --linked --schema public', { encoding: 'utf8' })
    if (out.trim() && !out.includes('No schema changes found')) {
      console.error('SCHEMA-DRIFT erkannt — Iter abgebrochen. AGENTS.md Regel 2.')
      console.error(out)
      process.exit(2)
    }
  } catch (err) {
    console.error('supabase db diff fehlgeschlagen:', err.message)
    process.exit(2)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  const email = process.env.SMOKE_TEST_KUNDE_EMAIL
  if (!email) throw new Error('SMOKE_TEST_KUNDE_EMAIL env fehlt')

  // 2. Falls existierend: Fälle, flow_links, nachrichten, gutachter_termine,
  // claims, auftraege für die Test-Mandant-IDs purgen.
  // Reihenfolge wegen FK-Constraints: Children zuerst.
  const { data: leads } = await supabase.from('leads').select('id').eq('email', email)
  const leadIds = (leads ?? []).map((l) => l.id)
  const { data: faelle } = await supabase.from('faelle').select('id').eq('kunde_email', email)
  const fallIds = (faelle ?? []).map((f) => f.id)

  if (fallIds.length) {
    await supabase.from('nachrichten').delete().in('fall_id', fallIds)
    await supabase.from('gutachter_termine').delete().in('fall_id', fallIds)
    await supabase.from('claims').delete().in('fall_id', fallIds)
    await supabase.from('auftraege').delete().in('fall_id', fallIds)
    await supabase.from('flow_links').delete().in('fall_id', fallIds)
  }
  await supabase.from('faelle').delete().eq('kunde_email', email)
  if (leadIds.length) {
    await supabase.from('flow_links').delete().in('lead_id', leadIds)
    await supabase.from('leads').delete().in('id', leadIds)
  }

  // 3. Test-Kunde-Profile-Flags zurücksetzen
  const kundeUserId = process.env.SMOKE_TEST_KUNDE_USER_ID
  if (kundeUserId) {
    await supabase.from('profiles').update({
      twofa_aktiviert: false,
      twofa_email_aktiviert: false,
      force_password_change: false,
    }).eq('id', kundeUserId)
  }

  // 4. TODO: Storage-Cleanup (dokumente/<fallId>/*) — Admin-API
}
