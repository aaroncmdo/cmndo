import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createEmbedBKlaerungTask,
  TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE,
} from '@/lib/termine/embed-b-klaerung-task'
import { CLAIM_TERMINAL_STATUSES } from '@/lib/termine/close-nur-gutachter-termin'

export const dynamic = 'force-dynamic'

// AAR-939 — Resolution-Cron fuer ungeklaerte nur_gutachter/embed-B-Termine.
//
// Findet ueberfaellige nur_gutachter-Termine, die weder durchgefuehrt noch als
// SV-No-Show / SV-Ablehnung markiert sind (= niemand hat reagiert), und legt einen
// Dispatcher-Klaerungs-Task an. KEIN Auto-Charge / kein Auto-Storno — das Billing
// (98044b6b) rechnet die €70 selbst per Default-Cron; dieser Cron entscheidet nur
// den CLAIM-Ausgang (via Dispatcher).
//
// Karenz = end_zeit + 24h (mit dem Billing-Default abgestimmt: nicht frueher
// eskalieren als Billing rechnet). Idempotent ueber createEmbedBKlaerungTask
// (max. ein offener Klaerungs-Task pro Termin) — der Cron darf beliebig oft laufen.
//
// VPS-Crontab (KEIN vercel.json — Memory feedback_vps_crons). Empfohlen: stuendlich.

type AdminClient = ReturnType<typeof createAdminClient>

// AAR-939: einmaliger WA-Ping an den Kunden „Kam dein Gutachter? Im Portal bestätigen".
// Treibt zum bereits funktionierenden Portal-Banner. Baileys-freier-Text (dynamischer
// Link; keine Meta-Template-Restriktion). Non-critical — bei Baileys-Down kein Ping,
// Portal-Banner + Dispatcher-Task greifen unabhaengig.
async function pingKundeTerminCheck(
  db: AdminClient,
  termin: { claim_id: string | null; fall_id: string | null; lead_id: string | null },
): Promise<boolean> {
  let leadId = termin.lead_id
  if (!leadId && termin.fall_id) {
    const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).maybeSingle()
    leadId = (fall?.lead_id as string | null) ?? null
  }
  if (!leadId) return false
  const { data: lead } = await db.from('leads').select('telefon, vorname').eq('id', leadId).maybeSingle()
  const telefon = (lead?.telefon as string | null) ?? null
  if (!telefon) return false
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'
  const link = termin.claim_id ? `${appUrl}/kunde/faelle/${termin.claim_id}` : `${appUrl}/kunde`
  const vorname = (lead?.vorname as string | null) ?? ''
  const message = `Hallo${vorname ? ' ' + vorname : ''}, kam Ihr Gutachter zum vereinbarten Termin? Bitte bestätigen Sie kurz in Ihrem Portal: ${link}`
  const { sendWhatsAppText } = await import('@/lib/whatsapp/baileys-client')
  const res = await sendWhatsAppText(telefon, message)
  return res.ok
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  // end_zeit + 24h vorbei → end_zeit < (now - 24h).
  const karenzCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: termine, error } = await db
    .from('gutachter_termine')
    .select('id, fall_id, lead_id, claim_id, claims:claim_id(service_typ, status)')
    .not('claim_id', 'is', null)
    .lt('end_zeit', karenzCutoff)
    .is('durchgefuehrt_am', null)
    .is('sv_no_show_am', null)
    .is('sv_ablehnung_am', null)
    .not('status', 'in', TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let geprueft = 0
  let tasksErstellt = 0
  let pingsGesendet = 0
  for (const t of termine ?? []) {
    // nur_gutachter-Guard + Claim-nicht-terminal (embed via claim_id; Nested-FK
    // kann Array oder Objekt sein — normalisieren).
    const claim = Array.isArray(t.claims) ? t.claims[0] : t.claims
    const svcTyp = (claim?.service_typ as string | null) ?? null
    const status = (claim?.status as string | null) ?? null
    if (svcTyp !== 'nur_gutachter') continue
    if (status && (CLAIM_TERMINAL_STATUSES as readonly string[]).includes(status)) continue

    geprueft++
    const res = await createEmbedBKlaerungTask(db, {
      terminId: t.id as string,
      fallId: (t.fall_id as string | null) ?? null,
      leadId: (t.lead_id as string | null) ?? null,
      grund: 'keine_rueckmeldung',
    })
    if (res.ok && res.created) {
      tasksErstellt++
      // WA-Ping nur EINMALIG (beim ersten Erfassen = Task neu erstellt). Non-critical.
      try {
        const sent = await pingKundeTerminCheck(db, {
          claim_id: (t.claim_id as string | null) ?? null,
          fall_id: (t.fall_id as string | null) ?? null,
          lead_id: (t.lead_id as string | null) ?? null,
        })
        if (sent) pingsGesendet++
      } catch (err) {
        console.error('[embed-b-cron] WA-Ping (non-critical):', err instanceof Error ? err.message : err)
      }
    }
  }

  return NextResponse.json({ ok: true, geprueft, tasksErstellt, pingsGesendet })
}
