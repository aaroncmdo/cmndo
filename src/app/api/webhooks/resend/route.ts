import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapResendEvent, sollStatusUebernehmen, verifyResendSignatur } from '@/lib/cold-mail/webhook'

// Cold-Mailer S3 — Resend-Webhook: Zustell-/Oeffnungs-/Klick-/Bounce-Tracking.
//
// Resend -> Webhook-Endpoint (Resend-Dashboard): https://app.claimondo.de/api/webhooks/resend
// Secret: RESEND_WEBHOOK_SECRET (Form "whsec_...", kommt aus dem Resend-Dashboard).
//
// Ohne diese Route sind die Sequenz-Bedingungen 'wenn_geoeffnet'/'wenn_nicht_geoeffnet'
// blind — die Engine kann sie, aber niemand wuerde je 'geoeffnet' setzen.

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
    return NextResponse.json({ ok: true, ignoriert: 'kein_cold_mail_send' })
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
