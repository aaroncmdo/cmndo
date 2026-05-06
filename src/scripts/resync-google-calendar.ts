/**
 * Einmaliger Re-Sync aller aktiven Google-Calendar-Events nach dem
 * Timezone-Fix in PR #530. Geht alle gutachter_termine + admin_termine
 * mit gesetzter google_event_id durch und triggert ein Update — damit
 * der neue toBerlinWallClock()-Pfad greift.
 *
 * Aufruf: npx tsx src/scripts/resync-google-calendar.ts
 *
 * Optional: --only=gutachter|admin   nur eine Kategorie
 *           --sv=<svId>              nur ein bestimmter SV
 *           --dry                    keine Calls, nur Liste ausgeben
 *
 * Lädt .env.local automatisch (gleicher Mechanismus wie password-reset-link.ts).
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let value = m[2]
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch (err) {
    console.error('.env.local konnte nicht geladen werden:', err)
  }
}

const args = process.argv.slice(2)
const onlyArg = args.find((a) => a.startsWith('--only='))?.split('=')[1] as 'gutachter' | 'admin' | undefined
const svFilter = args.find((a) => a.startsWith('--sv='))?.split('=')[1]
const isDryRun = args.includes('--dry')

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const stats = { gutachter: { ok: 0, fail: 0, skip: 0 }, admin: { ok: 0, fail: 0, skip: 0 } }

  if (!onlyArg || onlyArg === 'gutachter') {
    console.log('=== gutachter_termine ===')
    let query = db
      .from('gutachter_termine')
      .select('id, sv_id, fall_id, status, start_zeit, google_event_id')
      .not('google_event_id', 'is', null)
      .in('status', ['reserviert', 'bestaetigt', 'verlegung_pending'])
      .gte('start_zeit', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if (svFilter) query = query.eq('sv_id', svFilter)
    const { data: termine, error } = await query
    if (error) {
      console.error('Query-Fehler:', error.message)
      process.exit(1)
    }
    console.log(`${termine?.length ?? 0} aktive SV-Termine mit google_event_id gefunden`)
    for (const t of termine ?? []) {
      const ref = `${t.id} (sv=${t.sv_id}, ${t.start_zeit})`
      if (!t.fall_id) {
        console.log(`  SKIP ${ref} — ohne fall_id (Pre-FlowLink-Reservierung)`)
        stats.gutachter.skip++
        continue
      }
      if (isDryRun) {
        console.log(`  DRY  ${ref}`)
        stats.gutachter.ok++
        continue
      }
      try {
        const { syncSvTerminToGoogle } = await import('@/lib/google-calendar/sv-termin-sync')
        await syncSvTerminToGoogle(t.id as string, t.fall_id as string)
        console.log(`  OK   ${ref}`)
        stats.gutachter.ok++
      } catch (err) {
        console.error(`  FAIL ${ref}:`, err instanceof Error ? err.message : err)
        stats.gutachter.fail++
      }
    }
  }

  if (!onlyArg || onlyArg === 'admin') {
    console.log('\n=== admin_termine ===')
    const { data: adminTermine, error } = await db
      .from('admin_termine')
      .select('id, zugewiesen_an, status, start_zeit, google_event_id')
      .not('google_event_id', 'is', null)
      .eq('status', 'offen')
      .gte('start_zeit', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    if (error) {
      console.error('Query-Fehler:', error.message)
      process.exit(1)
    }
    console.log(`${adminTermine?.length ?? 0} aktive admin_termine mit google_event_id gefunden`)
    for (const t of adminTermine ?? []) {
      const ref = `${t.id} (zugewiesen_an=${t.zugewiesen_an}, ${t.start_zeit})`
      if (isDryRun) {
        console.log(`  DRY  ${ref}`)
        stats.admin.ok++
        continue
      }
      try {
        const { syncAdminTerminCalendarEvent } = await import('@/lib/google-calendar/admin-event-sync')
        await syncAdminTerminCalendarEvent(t.id as string)
        console.log(`  OK   ${ref}`)
        stats.admin.ok++
      } catch (err) {
        console.error(`  FAIL ${ref}:`, err instanceof Error ? err.message : err)
        stats.admin.fail++
      }
    }
  }

  console.log('\n=== Summary ===')
  console.log('gutachter_termine:', stats.gutachter)
  console.log('admin_termine:    ', stats.admin)
}

main().catch((err) => {
  console.error('Script crashte:', err)
  process.exit(1)
})
