import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapResendEvent, sollStatusUebernehmen, verifyResendSignatur } from '@/lib/cold-mail/webhook'
import { mapResendEventFuerEmailLog, sollEmailLogStatusUebernehmen } from '@/lib/email/zustellstatus'

// Cold-Mailer S3 — Resend-Webhook: Zustell-/Oeffnungs-/Klick-/Bounce-Tracking.
//
// Resend -> Webhook-Endpoint (Resend-Dashboard): https://app.claimondo.de/api/webhooks/resend
// Secret: RESEND_WEBHOOK_SECRET (Form "whsec_...", kommt aus dem Resend-Dashboard).
//
// Ohne diese Route sind die Sequenz-Bedingungen 'wenn_geoeffnet'/'wenn_nicht_geoeffnet'
// blind — die Engine kann sie, aber niemand wuerde je 'geoeffnet' setzen.
//
// ZWEITER KONSUMENT seit 05.09.2026 — TRANSAKTIONALE Mails (email_log):
// Bis dahin antwortete die Route auf jedes Ereignis ohne cold_mail_send mit 'kein_cold_mail_send' und
// warf es weg. Gemessen auf prod: 542 Mails aus 30 Tagen standen auf 'sent', KEINE auf zugestellt —
// ein Bounce an eine falsche Kundenadresse war unsichtbar, und kein Prod-Smoke konnte belegen, dass
// eine Kunden-Mail ankommt. Die Ereignisse lagen die ganze Zeit an: cold_mail_sends traegt
// 'zugestellt'/'geklickt', der Webhook lief also nachweislich.
// Der Resend-API-Schluessel ist KEIN Ersatz — er ist auf Senden beschraenkt (HTTP 401
// "This API key is restricted to only send emails" auf jedem Lese-Endpunkt).

export const dynamic = 'force-dynamic'

type ResendPayload = {
  type?: string
  data?: { email_id?: string; to?: string[] | string }
}

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET fehlt — Webhook abgelehnt.')
    // 500 (nicht 200): Resend soll retryen, sobald das Secret gesetzt ist.
    return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 500 })
  }

  // ROHER Body — ein re-serialisiertes JSON wuerde die Signatur brechen.
  const body = await request.text()
  const ok = verifyResendSignatur({
    secret,
    svixId: request.headers.get('svix-id') ?? '',
    svixTimestamp: request.headers.get('svix-timestamp') ?? '',
    signaturHeader: request.headers.get('svix-signature') ?? '',
    body,
  })
  if (!ok) {
    console.warn('[resend-webhook] Signatur ungueltig — abgelehnt.')
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 })
  }

  let payload: ResendPayload
  try {
    payload = JSON.parse(body) as ResendPayload
  } catch {
    // Kaputter Body: 200, damit Svix nicht ewig retryt — retry wuerde nichts heilen.
    console.error('[resend-webhook] Body ist kein JSON.')
    return NextResponse.json({ ok: true, ignoriert: 'kein_json' })
  }

  const neuerStatus = mapResendEvent(payload.type ?? '')
  const messageId = payload.data?.email_id
  if (!neuerStatus || !messageId) {
    // z.B. email.delivery_delayed -> bewusst kein Write, aber sauberes 200.
    return NextResponse.json({ ok: true, ignoriert: payload.type ?? 'unbekannt' })
  }

  const db = createAdminClient()

  // Der Send, auf den sich das Event bezieht. Fremde Mails (transaktional ueber
  // dieselbe Resend-Domain) haben hier keinen Treffer -> sauber ignorieren.
  const { data: send, error: qErr } = await db
    .from('cold_mail_sends')
    .select('id, status, lead_id, empfaenger_email')
    .eq('resend_message_id', messageId)
    .maybeSingle()
  if (qErr) {
    // createAdminClient ist ungetypt -> PostgREST-Fehler kommen still als error zurueck.
    console.error('[resend-webhook] Lookup fehlgeschlagen:', qErr)
    return NextResponse.json({ error: 'Lookup fehlgeschlagen' }, { status: 500 })
  }
  if (!send) {
    // Kein Cold-Mail-Send -> transaktionale Mail. Status in email_log nachtragen (Match ueber die
    // Resend-Message-ID, die sendEmail dort speichert). Kein Treffer = fremde Mail derselben Domain.
    const logStatus = mapResendEventFuerEmailLog(payload.type ?? '')
    if (!logStatus) return NextResponse.json({ ok: true, ignoriert: 'kein_cold_mail_send' })

    const { data: log, error: logErr } = await db
      .from('email_log')
      .select('id, status')
      .eq('message_id', messageId)
      // message_id traegt keinen Unique-Constraint (idx_email_log_message_id ist bewusst nicht
      // UNIQUE). Ohne limit(1) wuerde maybeSingle() bei zwei Treffern einen FEHLER liefern -> 500 ->
      // Svix retryt ewig. Der juengste Eintrag ist der richtige.
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (logErr) {
      console.error('[resend-webhook] email_log-Lookup fehlgeschlagen:', logErr)
      return NextResponse.json({ error: 'Lookup fehlgeschlagen' }, { status: 500 })
    }
    // Kein Treffer -> 200, kein Retry. Der haeufige Fall ist eine fremde Mail derselben Domain.
    // BEWUSST in Kauf genommen: Traefe ein 'delivered' ein, BEVOR sendEmail die Zeile geschrieben hat,
    // ginge dieses eine Ereignis verloren. Ein Fehlercode wuerde Svix zwar zur Wiederholung bewegen —
    // aber eben auch fuer jede fremde Mail, tagelang. Das Risiko ist klein (die Zeile entsteht direkt
    // nach dem Senden, die Zustellmeldung braucht laenger) und der Preis der Alternative hoch.
    if (!log) return NextResponse.json({ ok: true, ignoriert: 'kein_email_log_eintrag' })

    if (!sollEmailLogStatusUebernehmen(log.status as string | null, logStatus)) {
      return NextResponse.json({ ok: true, ignoriert: 'status_nicht_hoeher', status: log.status })
    }
    const { error: updErr } = await db.from('email_log').update({ status: logStatus }).eq('id', log.id)
    if (updErr) {
      console.error('[resend-webhook] email_log-Update fehlgeschlagen:', updErr)
      return NextResponse.json({ error: 'Update fehlgeschlagen' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, quelle: 'email_log', status: logStatus })
  }

  // Nur aufwaerts -> out-of-order-Events und Svix-Retries koennen nichts kaputtmachen.
  if (sollStatusUebernehmen(send.status, neuerStatus)) {
    const patch: Record<string, unknown> = { status: neuerStatus }
    const jetzt = new Date().toISOString()
    if (neuerStatus === 'geoeffnet') patch.geoeffnet_am = jetzt
    if (neuerStatus === 'geklickt') patch.geklickt_am = jetzt
    const { error: uErr } = await db.from('cold_mail_sends').update(patch).eq('id', send.id)
    if (uErr) console.error('[resend-webhook] Status-Update fehlgeschlagen:', uErr)
  }

  // Bounce/Beschwerde -> Suppression. Ab jetzt blockt das Opt-out-Gate diese Adresse
  // in JEDEM Pfad (manueller Single-Send UND CRON-Advancer).
  if (neuerStatus === 'bounced' || neuerStatus === 'beschwerde') {
    const grund = neuerStatus === 'bounced' ? 'bounce' : 'beschwerde'
    const { error: sErr } = await db
      .from('cold_mail_suppression')
      .upsert(
        { email: send.empfaenger_email, grund, lead_id: send.lead_id },
        { onConflict: 'email' },
      )
    if (sErr) console.error('[resend-webhook] Suppression-Upsert fehlgeschlagen:', sErr)

    // Laufende Sequenz dieses Leads beenden — sonst wuerde der Advancer weitersenden.
    const { error: eErr } = await db
      .from('cold_mail_enrollments')
      .update({ status: neuerStatus === 'bounced' ? 'bounced' : 'opt_out', next_send_at: null })
      .eq('lead_id', send.lead_id)
      .eq('status', 'aktiv')
    if (eErr) console.error('[resend-webhook] Enrollment-Stop fehlgeschlagen:', eErr)
  }

  return NextResponse.json({ ok: true, status: neuerStatus })
}
