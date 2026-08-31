import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendLeadReminderEmail } from '@/lib/email/lead-reminders'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { createNotification } from '@/lib/notifications'

// AAR-477 C11: Cron-Route — Reminder-Kaskade 2h/24h/72h/168h + Timeout-Marker.
//
// Läuft stündlich (vercel.json), findet offene Self-Service-Leads ohne
// zugehörigen Fall, sendet je nach Alter Reminder 1/2/3/4. Anschließend
// RPC mark_expired_leads() für die 10-Tage-Disqualifikation.
//
// Auth-Konvention: Bearer ${CRON_SECRET} — identisch zu allen anderen
// Crons im Projekt (siehe abrechnung-reminder, whatsapp-erinnerungen usw.).

export const dynamic = 'force-dynamic'

type Candidate = {
  id: string
  /** Null bei Formularen, die keine Adresse erheben (/check, Rueckruf, mcp). */
  email: string | null
  telefon: string | null
  vorname: string | null
  reminder_token: string
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const h2 = new Date(now.getTime() - 2 * 60 * 60 * 1000)
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000)
  const h168 = new Date(now.getTime() - 168 * 60 * 60 * 1000)
  // Kaskaden-Gate (17.07.26): Mindestabstand zwischen zwei Stufen. Die Normalfall-
  // Kadenz (2h/24h/72h/168h ab created_at) bleibt unveraendert — die Original-
  // Abstaende sind alle >= 22h. Greift nur bei Nachzuegern (Bestands-Leads der
  // verbreiterten Kanaele, nie genurtured): statt alle faelligen Stufen im selben
  // Tick zu bekommen (bis zu 4 Mails auf einmal), steigen sie mit r1 ein und
  // laufen eine 20h-Treppe.
  const MIN_STUFEN_ABSTAND_MS = 20 * 60 * 60 * 1000

  // Kohorten-Helper: Lädt Kandidaten für ein bestimmtes Reminder-Fenster.
  // Filter:
  //   - status='neu' und disqualifiziert=false (noch offen)
  //   - source_channel NOT IN (makler-anfrage,manuell) - alle Akquise-Channels nurtueren, nur menschl.-betreute raus
  //   - reminder_N_sent_at IS NULL (nicht schon versendet)
  //   - created_at <= before (alt genug für diese Stufe)
  //   - prevField gesendet + >= MIN_STUFEN_ABSTAND_MS her (Kaskaden-Gate, nur Stufe 2-4)
  //   - keine Faelle mit lead_id = lead.id (nicht konvertiert)
  async function candidates(
    before: Date,
    reminderField: 'reminder_1_sent_at' | 'reminder_2_sent_at' | 'reminder_3_sent_at' | 'reminder_4_sent_at',
    prevField?: 'reminder_1_sent_at' | 'reminder_2_sent_at' | 'reminder_3_sent_at',
  ): Promise<Candidate[]> {
    let query = supabase
      .from('leads')
      .select('id, email, telefon, vorname, reminder_token, source_channel')
      // 'flow-gesendet' gehoert dazu: den Status setzt der ERFOLGREICHE FlowLink-
      // Versand. Wer den Link bekommen und NICHT geklickt hat, ist genau der, den
      // man erinnern muesste — mit `.eq('status','neu')` schloss der geglueckte
      // Versand den Lead aus der Kaskade aus. (Gemessen 31.08.: ein echter
      // /check-Kunde stand auf 'flow-gesendet' und war damit doppelt draussen.)
      .in('status', ['neu', 'flow-gesendet'])
      .eq('disqualifiziert', false)
      .not('source_channel', 'in', '(makler-anfrage,manuell)') // Nurture alle kundengetriebenen Akquise-Channels; nur makler/manuell (menschl. Follow-up) raus. Timeout unten ist channel-agnostisch.
      .is(reminderField, null)
      .lte('created_at', before.toISOString())
      // Frueher `.not('email','is',null)`. Die Kaskade war damit rein E-Mail-basiert —
      // und /check, oeffentlicher Rueckruf und mcp erheben gar keine Adresse. Gemessen
      // ueber 90 Tage: claimondo-check 2 Leads / 0 mit E-Mail, mcp 8 / 0. Diese Quellen
      // konnten die Nurture NIE erreichen, zu 100 % konstruktionsbedingt.
      .or('email.not.is.null,telefon.not.is.null')
    if (prevField) {
      const spaetestens = new Date(now.getTime() - MIN_STUFEN_ABSTAND_MS).toISOString()
      query = query.not(prevField, 'is', null).lte(prevField, spaetestens)
    }
    const { data, error } = await query.limit(50)
    if (error) {
      console.error('[AAR-477] Kandidaten-Query fehlgeschlagen:', reminderField, error.message)
      return []
    }
    if (!data || data.length === 0) return []

    // Lead-IDs, für die bereits ein Fall existiert → ausfiltern
    const leadIds = data.map((l) => l.id)
    // CMM-49: Leads mit bestehendem faelle-backed Claim ausfiltern — claims-direkt
    // (lead_id 0-diff) + Bridge-Intersection (claims Superset faelle; nur faelle-backed,
    // value-preserving live verifiziert: lead_id-Set 78==78, 0 Diff).
    const { data: existingClaims } = await supabase
      .from('claims')
      .select('id, lead_id')
      .in('lead_id', leadIds)
    const existingClaimIds = (existingClaims ?? []).map((c) => c.id as string)
    let bridgedClaimIds = new Set<string>()
    if (existingClaimIds.length) {
      const { data: bridged } = await supabase
        .from('faelle_claim_bridge')
        .select('claim_id')
        .in('claim_id', existingClaimIds)
      bridgedClaimIds = new Set((bridged ?? []).map((b) => b.claim_id as string))
    }
    const skip = new Set(
      (existingClaims ?? [])
        .filter((c) => bridgedClaimIds.has(c.id as string))
        .map((c) => c.lead_id as string | null)
        .filter((x): x is string => !!x),
    )

    return data
      .filter((l) => !skip.has(l.id as string))
      .map((l) => ({
        id: l.id as string,
        email: (l.email as string | null) ?? null,
        telefon: (l.telefon as string | null) ?? null,
        vorname: (l.vorname as string | null) ?? null,
        reminder_token: l.reminder_token as string,
      }))
  }

  const [cohort1, cohort2, cohort3, cohort4] = await Promise.all([
    candidates(h2, 'reminder_1_sent_at'),
    candidates(h24, 'reminder_2_sent_at', 'reminder_1_sent_at'),
    candidates(h72, 'reminder_3_sent_at', 'reminder_2_sent_at'),
    candidates(h168, 'reminder_4_sent_at', 'reminder_3_sent_at'),
  ])

  let sent = 0
  let failed = 0
  let sentWhatsApp = 0
  let stillMarkiert = 0

  // WhatsApp-Nurture nur auf Stufe 2 (24h) und 3 (72h).
  //
  // Bewusst NICHT alle vier Stufen: WhatsApp landet auf dem Sperrbildschirm, E-Mail
  // im Postfach. Vier Nachrichten binnen einer Woche lesen sich dort als Belaestigung
  // — und ein Kunde, der uns blockiert, ist teurer als einer, der nicht antwortet.
  // Stufe 1 (2h) faellt weg, weil der FlowLink-Erstversand meist Minuten vorher
  // rausging; Stufe 4 (7 Tage) faellt weg, weil danach ohnehin der 10-Tage-Timeout
  // greift.
  const WHATSAPP_STUFEN = new Set([2, 3])

  // Der Erinnerungstext. Kurz, mit dem Link — der Kunde hat ihn schon einmal
  // bekommen, das hier ist ein Anstupser, keine Neuvorstellung.
  function whatsappText(vorname: string | null, flowUrl: string): string {
    const anrede = vorname ? `Hallo ${vorname}` : 'Hallo'
    return [
      `${anrede}, Ihre Schadenmeldung bei Claimondo ist noch offen.`,
      '',
      'Hier geht es weiter — der Link ist nur für Sie:',
      flowUrl,
      '',
      'Falls Sie Fragen haben, antworten Sie einfach auf diese Nachricht.',
    ].join('\n')
  }

  /** true = zugestellt, false = Fehler, null = bewusst uebersprungen (Marker trotzdem setzen). */
  async function sendeWhatsAppReminder(lead: Candidate, step: 1 | 2 | 3 | 4): Promise<boolean | null> {
    // Nicht-WhatsApp-Stufen werden MARKIERT, nicht gesendet. Das ist kein Detail:
    // das Kaskaden-Gate verlangt fuer Stufe N, dass reminder_(N-1)_sent_at gesetzt
    // ist. Wer Stufe 1 einfach ueberspringt, erreicht Stufe 2 nie.
    if (!WHATSAPP_STUFEN.has(step)) return null
    if (!lead.telefon) return false

    // ⚠ NICHT den Token roh aus flow_links lesen. Die Links haben eine TTL, und
    // `/flow/[token]` weist einen abgelaufenen ab (page.tsx:91) — ein Reminder mit
    // totem Link ist schlechter als gar keiner: der Kunde klickt und landet auf
    // einer Fehlerseite. Der Reminder greift per Definition SPAET (24h/72h), also
    // ist genau das der wahrscheinliche Fall.
    // ensureCanonicalFlowLinkForLead verwendet den juengsten noch GUELTIGEN Link
    // wieder und stellt sonst einen neuen aus — derselbe Weg wie beim Erstversand.
    const flRes = await ensureCanonicalFlowLinkForLead(lead.id, { admin: supabase })
    if (!flRes.ok) {
      console.warn('[AAR-477] WhatsApp-Reminder ohne FlowLink uebersprungen:', lead.id, flRes.error)
      return false
    }
    const token = flRes.token

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const res = await sendWhatsAppText(lead.telefon, whatsappText(lead.vorname, `${baseUrl}/flow/${token}`))
    if (!res.ok) {
      console.error('[AAR-477] WhatsApp-Reminder fehlgeschlagen:', lead.id, step, res.error)
      return false
    }
    return true
  }

  async function processStep(
    lead: Candidate,
    step: 1 | 2 | 3 | 4,
    field: 'reminder_1_sent_at' | 'reminder_2_sent_at' | 'reminder_3_sent_at' | 'reminder_4_sent_at',
  ) {
    // Kanal folgt dem, was der Lead hergibt: E-Mail bleibt der Normalfall, WhatsApp
    // greift fuer die Formulare, die keine Adresse erheben (/check, Rueckruf, mcp).
    const perWhatsApp = !lead.email
    const ok = perWhatsApp
      ? await sendeWhatsAppReminder(lead, step)
      : await sendLeadReminderEmail({ ...lead, email: lead.email as string }, step)
    if (ok === false) {
      failed += 1
      return
    }
    const { error: upErr } = await supabase
      .from('leads')
      .update({ [field]: new Date().toISOString() })
      .eq('id', lead.id)
    if (upErr) {
      console.error('[AAR-477] markSent fehlgeschlagen:', lead.id, field, upErr.message)
      failed += 1
      return
    }
    // Getrennt zaehlen, sonst liest sich eine still markierte Stufe wie ein Versand.
    if (ok === null) stillMarkiert += 1
    else if (perWhatsApp) sentWhatsApp += 1
    else sent += 1
  }

  // Sequenziell pro Stufe, parallel zwischen den Stufen wäre möglich, aber
  // der Kohorten-Set ist klein (limit 50) und Resend hat Rate-Limits.
  for (const l of cohort1) await processStep(l, 1, 'reminder_1_sent_at')
  for (const l of cohort2) await processStep(l, 2, 'reminder_2_sent_at')
  for (const l of cohort3) await processStep(l, 3, 'reminder_3_sent_at')
  for (const l of cohort4) await processStep(l, 4, 'reminder_4_sent_at')

  // AAR-1488: 10-Tage-Timeout im selben Tick — vorher die Disqualifikations-
  // Kandidaten holen damit wir nach der RPC eine Notification an Dispatcher
  // schicken koennen. Pre-Fetch + post-RPC-Notification statt RPC-Return-
  // Type aendern (RETURNS void bleibt — Migration vermieden).
  const tenDaysAgoIso = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
  const { data: expiredCandidates } = await supabase
    .from('leads')
    .select('id, vorname, nachname, source_channel, created_at')
    .eq('status', 'neu')
    .eq('disqualifiziert', false)
    .lt('created_at', tenDaysAgoIso)
    .limit(200)

  const { error: rpcErr } = await supabase.rpc('mark_expired_leads')
  if (rpcErr) {
    console.error('[AAR-477] mark_expired_leads RPC fehlgeschlagen:', rpcErr.message)
  }

  // AAR-1488: nach erfolgreicher RPC pro Dispatcher eine zusammenfassende
  // Notification (statt N×M-Spam — bei 5 Disq-Leads × 3 Dispatchern waeren
  // das sonst 15 Notifications). Fire-and-forget; falls Notification fehlt,
  // bleibt die Disqualifikation in der DB (RPC hat schon gewirkt).
  let disqualifiedNotified = 0
  if (!rpcErr && expiredCandidates && expiredCandidates.length > 0) {
    try {
      const { data: dispatcher } = await supabase
        .from('profiles')
        .select('id')
        .in('rolle', ['dispatch', 'admin'])

      if (dispatcher && dispatcher.length > 0) {
        const count = expiredCandidates.length
        const titel = count === 1
          ? '1 Lead nach 10 Tagen auto-disqualifiziert'
          : `${count} Leads nach 10 Tagen auto-disqualifiziert`
        const sampleNames = expiredCandidates
          .slice(0, 5)
          .map((l) => {
            const name = [l.vorname, l.nachname].filter(Boolean).join(' ') || '(ohne Name)'
            const src = (l.source_channel as string | null) ?? '?'
            return `${name} [${src}]`
          })
          .join(', ')
        const overflow = count > 5 ? ` … +${count - 5} weitere` : ''
        const beschreibung = `Timeout-Disqualifikation (mark_expired_leads): ${sampleNames}${overflow}. Liste sichtbar unter /dispatch/leads?filter=disqualifiziert.`

        for (const d of dispatcher) {
          await createNotification(
            d.id as string,
            'leads-auto-disqualifiziert',
            titel,
            beschreibung,
            '/dispatch/leads?filter=disqualifiziert',
          ).catch(() => { /* non-critical */ })
          disqualifiedNotified += 1
        }
      }
    } catch (notifyErr) {
      console.warn(
        '[AAR-1488] Auto-Disqualifikations-Notification fehlgeschlagen:',
        notifyErr instanceof Error ? notifyErr.message : notifyErr,
      )
    }
  }

  return NextResponse.json({
    sent,
    failed,
    // Getrennt ausgewiesen, damit im Cron-Log ablesbar bleibt, ueber welchen Kanal
    // nachgefasst wurde — und wie viele Stufen nur markiert (nicht gesendet) wurden.
    sent_whatsapp: sentWhatsApp,
    still_markiert: stillMarkiert,
    cohorts: {
      r1: cohort1.length,
      r2: cohort2.length,
      r3: cohort3.length,
      r4: cohort4.length,
    },
    expired_rpc: rpcErr ? 'error' : 'ok',
    expired_count: expiredCandidates?.length ?? 0,
    disqualified_notifications_sent: disqualifiedNotified,
  })
}
