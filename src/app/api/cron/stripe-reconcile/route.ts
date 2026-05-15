import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * AAR-929 Phase 1: Stripe-Drift-Reconcile-Report (read-only).
 *
 * Cross-Check zwischen stripe_events (payment_intent.succeeded /
 * charge.succeeded) und abrechnungen.bezahlt_am.
 *
 * Phase 1 (dieser Code): Nur Report + Admin-Email. KEIN Auto-Heal — auch wenn
 * Drift erkannt wird, schreiben wir nichts. Aaron entscheidet manuell pro Fall.
 *
 * Phase 2 (separates Folge-Ticket): Auto-Heal mit STRIPE_RECONCILE_HEAL=true
 * Env-Var-Gate, wenn Phase 1 lange genug sauber gelaufen ist.
 *
 * Auth: Bearer ${CRON_SECRET}. Schedule (VPS-Crontab nach Aaron-Freigabe):
 * taeglich 06:00 deutsche Zeit, oder manueller curl-Trigger.
 *
 * Anti-Spam: Admin-Email wird nur gesendet wenn Drift > 0. Bei sauberem Lauf
 * stiller Erfolg (JSON-Response mit zero counts).
 */

type DriftEntry = {
  stripe_event_id: string
  stripe_payment_intent_id: string | null
  event_type: string
  empfangen_am: string
  abrechnung_id: string | null
  abrechnung_bezahlt_am: string | null
  drift_typ: 'event_ohne_abrechnung' | 'event_ohne_bezahlt_am' | 'abrechnung_ohne_event'
  hinweis: string
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const drift: DriftEntry[] = []

  // 1) Alle Payment-Success-Events laden
  const { data: events, error: evtErr } = await db
    .from('stripe_events')
    .select('id, stripe_event_id, event_type, payload, empfangen_am')
    .in('event_type', ['payment_intent.succeeded', 'charge.succeeded'])

  if (evtErr) {
    console.error('[AAR-929] stripe_events query:', evtErr.message)
    return NextResponse.json({ error: evtErr.message }, { status: 500 })
  }

  for (const evt of events ?? []) {
    const payload = (evt.payload ?? {}) as Record<string, unknown>
    const data = (payload.data ?? {}) as Record<string, unknown>
    const obj = (data.object ?? {}) as Record<string, unknown>
    const piId = evt.event_type === 'payment_intent.succeeded'
      ? (obj.id as string | undefined) ?? null
      : (obj.payment_intent as string | undefined) ?? null

    if (!piId) {
      drift.push({
        stripe_event_id: evt.stripe_event_id as string,
        stripe_payment_intent_id: null,
        event_type: evt.event_type as string,
        empfangen_am: evt.empfangen_am as string,
        abrechnung_id: null,
        abrechnung_bezahlt_am: null,
        drift_typ: 'event_ohne_abrechnung',
        hinweis: 'Event hat keinen payment_intent.id — payload-Struktur prüfen',
      })
      continue
    }

    // Abrechnung mit diesem PI-Id?
    const { data: abr } = await db
      .from('abrechnungen')
      .select('id, bezahlt_am')
      .eq('stripe_payment_intent_id', piId)
      .maybeSingle()

    if (!abr) {
      drift.push({
        stripe_event_id: evt.stripe_event_id as string,
        stripe_payment_intent_id: piId,
        event_type: evt.event_type as string,
        empfangen_am: evt.empfangen_am as string,
        abrechnung_id: null,
        abrechnung_bezahlt_am: null,
        drift_typ: 'event_ohne_abrechnung',
        hinweis: `Stripe-Event success vorhanden, aber keine Abrechnung mit stripe_payment_intent_id=${piId}`,
      })
      continue
    }

    if (!abr.bezahlt_am) {
      drift.push({
        stripe_event_id: evt.stripe_event_id as string,
        stripe_payment_intent_id: piId,
        event_type: evt.event_type as string,
        empfangen_am: evt.empfangen_am as string,
        abrechnung_id: abr.id as string,
        abrechnung_bezahlt_am: null,
        drift_typ: 'event_ohne_bezahlt_am',
        hinweis: `Abrechnung gefunden, aber bezahlt_am NULL trotz erfolgreichem Stripe-Event`,
      })
    }
  }

  // 2) Umgekehrt: Abrechnungen mit bezahlt_am aber kein PI-Event gefunden?
  // Konsumiert mehr Queries, daher nur fuer bezahlte SV-Abrechnungen der letzten 90 Tage.
  const grenzDatum = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: bezahlte } = await db
    .from('abrechnungen')
    .select('id, stripe_payment_intent_id, bezahlt_am')
    .eq('empfaenger_typ', 'sv')
    .not('bezahlt_am', 'is', null)
    .not('stripe_payment_intent_id', 'is', null)
    .gte('bezahlt_am', grenzDatum)

  for (const abr of bezahlte ?? []) {
    const piId = abr.stripe_payment_intent_id as string | null
    if (!piId) continue

    const { count } = await db
      .from('stripe_events')
      .select('id', { count: 'exact', head: true })
      .in('event_type', ['payment_intent.succeeded', 'charge.succeeded'])
      .filter('payload->data->object->>id', 'eq', piId)

    if (!count || count === 0) {
      // Zweiter Versuch: payment_intent als Sub-Feld (charge.succeeded hat es so)
      const { count: count2 } = await db
        .from('stripe_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_type', 'charge.succeeded')
        .filter('payload->data->object->>payment_intent', 'eq', piId)

      if (!count2 || count2 === 0) {
        drift.push({
          stripe_event_id: '',
          stripe_payment_intent_id: piId,
          event_type: '(nicht in stripe_events)',
          empfangen_am: '',
          abrechnung_id: abr.id as string,
          abrechnung_bezahlt_am: abr.bezahlt_am as string,
          drift_typ: 'abrechnung_ohne_event',
          hinweis: `Abrechnung ${abr.id} als bezahlt markiert mit pi_id=${piId}, aber kein entsprechendes Stripe-Event gefunden`,
        })
      }
    }
  }

  // 3) Admin-Email nur bei Drift > 0
  if (drift.length > 0) {
    try {
      const { sendEmail } = await import('@/lib/email/google/client')
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'aaron.sprafke@claimondo.de'
      const rowsHtml = drift.map((d, i) => `
        <tr>
          <td style="padding:4px 8px;border-bottom:1px solid #e4e7ef">${i + 1}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e4e7ef"><code>${d.drift_typ}</code></td>
          <td style="padding:4px 8px;border-bottom:1px solid #e4e7ef">${d.stripe_payment_intent_id ?? '–'}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e4e7ef">${d.abrechnung_id ?? '–'}</td>
          <td style="padding:4px 8px;border-bottom:1px solid #e4e7ef">${d.hinweis}</td>
        </tr>
      `).join('')

      await sendEmail({
        to: adminEmail,
        subject: `[Stripe-Drift] ${drift.length} Unstimmigkeit(en) zwischen stripe_events und abrechnungen`,
        html: `<p>Hallo Aaron,</p>
<p>der Stripe-Reconcile-Cron hat <strong>${drift.length}</strong> Drift-Eintrag(e) gefunden. Auto-Heal ist deaktiviert (Phase 1 = Report-only).</p>
<table style="border-collapse:collapse;width:100%;font-family:monospace;font-size:12px">
<thead><tr>
  <th align="left" style="padding:4px 8px;border-bottom:2px solid #0D1B3E">#</th>
  <th align="left" style="padding:4px 8px;border-bottom:2px solid #0D1B3E">Drift-Typ</th>
  <th align="left" style="padding:4px 8px;border-bottom:2px solid #0D1B3E">PI-Id</th>
  <th align="left" style="padding:4px 8px;border-bottom:2px solid #0D1B3E">Abrechnung-Id</th>
  <th align="left" style="padding:4px 8px;border-bottom:2px solid #0D1B3E">Hinweis</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<p style="margin-top:16px">Wenn das Muster sich verfestigt: Folge-Ticket für Phase 2 (Auto-Heal mit <code>STRIPE_RECONCILE_HEAL=true</code> Env-Var-Gate) anlegen.</p>`,
        template: 'admin_stripe_drift_report',
        empfaengerTyp: 'admin',
      })
    } catch (err) {
      console.error('[AAR-929] Admin-Email fehlgeschlagen (non-critical):', err)
    }
  }

  console.log(`[AAR-929] stripe-reconcile: drift=${drift.length} events=${events?.length ?? 0} bezahlte=${bezahlte?.length ?? 0}`)
  return NextResponse.json({
    ok: true,
    drift_count: drift.length,
    events_checked: events?.length ?? 0,
    bezahlte_checked: bezahlte?.length ?? 0,
    drift,
  })
}
