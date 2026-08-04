// Regel-4-Prod-Smoke P5/J9: Dunning -> Deaktivierung ueber den ECHTEN pg_cron-Pfad
// (SELECT public.cron_trigger_netzwerk_abo_dunning() wird zwischen den Phasen via MCP
// gefeuert — Muster netzwerk-release-scharf-smoke.mts). K15: keine echten Stripe-Calls —
// die Wegwerf-Row ist SUB-LOS (stripe_subscription_id NULL), der Karenz-Schnitt testet
// damit zugleich den Review-Fix M-3 (gekuendigt haengt nicht am Cancel).
//
// EIN Seed mit ueberfaellig_seit = -15d testet ALLES in einem Schuss:
//   tage=15 >= Stufen 1/5/10 -> 3 Reminder-Rows  UND  >= KARENZ 14 -> status='gekuendigt'.
// Zweiter Schuss = Idempotenz (Row nicht mehr ueberfaellig -> gar nicht selektiert).
//
// Phasen:
//   --phase seed --sv-user <uid>   Abo-Row ueberfaellig (sub-los, ueberfaellig_seit -15d)
//                                  + Fremd-Effekt-Precheck (keine FREMDEN ueberfaellig-Rows)
//   --phase assert --sv <svId>     3 Reminder + status=gekuendigt + ueberfaellig_seit NULL
//   --phase cleanup                Abo-Row + Reminder + email_log-frei (Wegwerf-Domain)

import { createClient } from '@supabase/supabase-js'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('ENV fehlt — --env-file=.env.local?')
  process.exit(1)
}
if (!url.includes('paizkjajbuxxksdoycev')) {
  console.error(`ABBRUCH: nicht das echte prod (${url})`)
  process.exit(1)
}
const db = createClient(url, key, { auth: { persistSession: false } })

const REMINDER_TYPEN = [
  'netzwerk_abo_ueberfaellig_1d',
  'netzwerk_abo_ueberfaellig_5d',
  'netzwerk_abo_ueberfaellig_10d',
]

async function seed(): Promise<void> {
  const svUser = arg('sv-user')
  if (!svUser) { console.error('Pflicht-Arg: --sv-user <uid>'); process.exit(1) }
  const { data: sv } = await db.from('sachverstaendige').select('id').eq('profile_id', svUser).maybeSingle()
  if (!sv?.id) throw new Error('sachverstaendige-Row fehlt')
  const svId = sv.id as string

  // Fremd-Effekt-Precheck: der Cron fasst NUR status='ueberfaellig' an.
  const { data: fremde } = await db
    .from('sv_netzwerk_abonnements').select('sv_id').eq('status', 'ueberfaellig').neq('sv_id', svId)
  if (fremde?.length) {
    console.log(`[STOP] ${fremde.length} FREMDE ueberfaellig-Row(s) — Schuss wuerde sie anfassen.`)
    process.exit(1)
  }

  const vor15Tagen = new Date(Date.now() - 15 * 86400_000).toISOString()
  const { error } = await db.from('sv_netzwerk_abonnements').upsert(
    {
      sv_id: svId,
      status: 'ueberfaellig',
      stripe_subscription_id: null, // sub-los -> kein Stripe-Call, testet M-3
      ueberfaellig_seit: vor15Tagen,
      aktualisiert_am: new Date().toISOString(), // Beweis: Uhr laeuft auf ueberfaellig_seit, NICHT hierauf
    },
    { onConflict: 'sv_id' },
  )
  if (error) throw new Error(`seed: ${error.message}`)
  console.log(`[seed ✓] Abo ${svId} ueberfaellig seit -15d (sub-los). 0 fremde ueberfaellig-Rows.`)
  console.log('[bereit] Schuss: SELECT public.cron_trigger_netzwerk_abo_dunning();')
  console.log(`[next] --phase assert --sv ${svId}`)
}

async function assertPhase(): Promise<void> {
  const svId = arg('sv')
  if (!svId) { console.error('Pflicht-Arg: --sv <svId>'); process.exit(1) }
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    const { data: abo, error } = await db
      .from('sv_netzwerk_abonnements')
      .select('status, ueberfaellig_seit')
      .eq('sv_id', svId)
      .maybeSingle()
    if (error) throw new Error(`assert abo: ${error.message}`)
    const { data: reminders } = await db
      .from('sv_payment_reminders').select('reminder_typ').eq('sv_id', svId)
    const typen = new Set((reminders ?? []).map((r: { reminder_typ: string }) => r.reminder_typ))
    const alleReminder = REMINDER_TYPEN.every((t) => typen.has(t))
    if ((abo as { status?: string } | null)?.status === 'gekuendigt' && alleReminder) {
      console.log(
        `[assert ✓] 3 gestaffelte Reminder (${[...typen].join(', ')}) + Karenz-Schnitt: status='gekuendigt', ueberfaellig_seit=${(abo as { ueberfaellig_seit?: string | null }).ueberfaellig_seit} (erwartet null)`,
      )
      if ((abo as { ueberfaellig_seit?: string | null }).ueberfaellig_seit !== null) {
        throw new Error('ueberfaellig_seit wurde beim Karenz-Schnitt nicht genullt')
      }
      return
    }
    await new Promise((r) => setTimeout(r, 3000))
  }
  throw new Error('ASSERT-FAIL: Dunning-Ergebnis nicht binnen 60s (Reminder+gekuendigt)')
}

async function cleanup(): Promise<void> {
  // Wegwerf-SVs via throwaway-Email identifizieren, deren Abo-/Reminder-Reste raeumen.
  const { data: prof } = await db.from('profiles').select('id').like('email', 'throwaway-%@claimondo.test')
  const uids = (prof ?? []).map((p: { id: string }) => p.id)
  if (uids.length) {
    const { data: svs } = await db.from('sachverstaendige').select('id').in('profile_id', uids)
    const svIds = (svs ?? []).map((s: { id: string }) => s.id)
    if (svIds.length) {
      await db.from('sv_payment_reminders').delete().in('sv_id', svIds)
      await db.from('sv_netzwerk_abonnements').delete().in('sv_id', svIds)
    }
  }
  console.log('[cleanup] Abo-Rows + Reminder der throwaway-SVs geraeumt.')
}

async function main(): Promise<void> {
  const phase = arg('phase')
  if (phase === 'seed') return seed()
  if (phase === 'assert') return assertPhase()
  if (phase === 'cleanup') return cleanup()
  console.error('Pflicht-Arg: --phase seed|assert|cleanup')
  process.exit(1)
}

main().catch((err) => {
  console.error('[dunning-smoke ✗]', err instanceof Error ? err.message : err)
  process.exit(1)
})
