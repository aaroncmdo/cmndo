import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { planeNaechstenSchritt, zustandNachSend, type ColdMailStep } from '@/lib/cold-mail/advance'
import { buildMergeVars, renderMerge } from '@/lib/cold-mail/merge'
import { renderColdMailHtml } from '@/lib/cold-mail/render-shell'
import { createOptoutToken } from '@/lib/cold-mail/optout-token'
import { sendColdMail } from '@/lib/cold-mail/send'

// Cold-Mailer S2 — CRON-Advancer. Laeuft stuendlich (VPS-crontab, wie send-lead-reminders):
//   0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
//     https://app.claimondo.de/api/cron/cold-mailer-advance
//
// Findet faellige Enrollments, wertet die Step-Bedingung aus (reine Engine in
// lib/cold-mail/advance.ts), sendet und rueckt die Enrollment weiter.
//
// Auth-Konvention: Bearer ${CRON_SECRET} — identisch zu allen anderen Crons.

export const dynamic = 'force-dynamic'

// Rate-Limit/Deliverability (Spec §11): pro Lauf gedeckelt, damit ein grosser
// Enrollment-Schwung nicht in einer Stunde rausballert und die Domain verbrennt.
const BATCH_CAP = 50

type Faellig = {
  id: string
  lead_id: string
  sequenz_id: string
  aktueller_step: number
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const jetzt = new Date()
  const bilanz = { geprueft: 0, gesendet: 0, uebersprungen: 0, fertig: 0, opt_out: 0, fehler: 0 }

  // Faellige, aktive Enrollments (partial index cms_enr_faellig_idx deckt genau das ab).
  const { data: faellige, error: qErr } = await db
    .from('cold_mail_enrollments')
    .select('id, lead_id, sequenz_id, aktueller_step')
    .eq('status', 'aktiv')
    .lte('next_send_at', jetzt.toISOString())
    .order('next_send_at', { ascending: true })
    .limit(BATCH_CAP)

  if (qErr) {
    // createAdminClient ist ungetypt -> PostgREST-Fehler kommen still als error zurueck.
    console.error('[cold-mailer-advance] Enrollment-Query fehlgeschlagen:', qErr)
    return NextResponse.json({ error: 'Query fehlgeschlagen' }, { status: 500 })
  }

  for (const e of (faellige ?? []) as Faellig[]) {
    bilanz.geprueft++
    try {
      // 1) Steps der Sequenz
      const { data: stepsRaw } = await db
        .from('cold_mail_steps')
        .select('id, position, vorlage_id, delay_tage, bedingung')
        .eq('sequenz_id', e.sequenz_id)
        .order('position', { ascending: true })
      const steps = (stepsRaw ?? []) as ColdMailStep[]

      // 2) Letzter Send dieser Enrollment (Basis der Bedingungs-Auswertung)
      const { data: letzterSend } = await db
        .from('cold_mail_sends')
        .select('status')
        .eq('enrollment_id', e.id)
        .order('gesendet_am', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Auf 'geantwortet' laufen nur NICHT-aktive Enrollments (manueller Toggle setzt den
      // Status) -> hier per Definition false. Explizit uebergeben, damit die Engine
      // unveraendert bleibt, wenn spaeter echte Reply-Detektion dazukommt.
      const plan = planeNaechstenSchritt({
        aktuellerStep: e.aktueller_step,
        steps,
        letzterSend: letzterSend ? { status: letzterSend.status } : null,
        geantwortet: false,
      })

      if (plan.typ === 'fertig') {
        await db.from('cold_mail_enrollments')
          .update({ status: 'fertig', next_send_at: null })
          .eq('id', e.id)
        bilanz.fertig++
        continue
      }

      // 3) Lead + Vorlage laden
      const { data: lead } = await db
        .from('partner_leads')
        .select('id, email, ansprechpartner_email, ansprechpartner_vorname, ansprechpartner_nachname, ansprechpartner_position, firma, ort, rolle')
        .eq('id', e.lead_id)
        .maybeSingle()
      const empfaenger = (lead?.ansprechpartner_email?.trim() || lead?.email?.trim() || '').toLowerCase()
      if (!lead || !empfaenger) {
        // Ohne Empfaenger ist die Enrollment tot — pausieren statt endlos neu zu versuchen.
        await db.from('cold_mail_enrollments')
          .update({ status: 'pausiert', next_send_at: null })
          .eq('id', e.id)
        bilanz.uebersprungen++
        continue
      }

      // 4) Opt-out-Gate — FAIL-CLOSED: bei Fehler NICHT senden.
      const { data: supp, error: suppErr } = await db
        .from('cold_mail_suppression')
        .select('email')
        .eq('email', empfaenger)
        .maybeSingle()
      if (suppErr) {
        console.error('[cold-mailer-advance] Suppression-Pruefung fehlgeschlagen:', suppErr)
        bilanz.fehler++
        continue
      }
      if (supp) {
        await db.from('cold_mail_enrollments')
          .update({ status: 'opt_out', next_send_at: null })
          .eq('id', e.id)
        bilanz.opt_out++
        continue
      }

      const { data: vorlage } = await db
        .from('cold_mail_vorlagen')
        .select('betreff, body_html')
        .eq('id', plan.step.vorlage_id)
        .maybeSingle()
      if (!vorlage) {
        console.error('[cold-mailer-advance] Vorlage fehlt fuer Step', plan.step.id)
        bilanz.fehler++
        continue
      }

      // 5) Merge + Render + Send (dieselben Bausteine wie der manuelle Single-Send)
      const vars = buildMergeVars(lead)
      const betreff = renderMerge(vorlage.betreff, vars)
      const bodyGemergt = renderMerge(vorlage.body_html, vars)
      const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, '')
      const abmeldeUrl = `${base}/partner-abmelden/${createOptoutToken(empfaenger)}`
      const html = await renderColdMailHtml({ bodyHtml: bodyGemergt, abmeldeUrl })

      const res = await sendColdMail({ to: empfaenger, subject: betreff, html, abmeldeUrl, leadId: e.lead_id })
      if (!res.ok) {
        // Send-Fehler: Enrollment NICHT weiterruecken -> naechster Lauf versucht es erneut.
        console.error('[cold-mailer-advance] Send fehlgeschlagen:', res.error)
        bilanz.fehler++
        continue
      }

      // 6) Verlauf + Enrollment weiterruecken
      const { error: logErr } = await db.from('cold_mail_sends').insert({
        enrollment_id: e.id,
        lead_id: e.lead_id,
        step_id: plan.step.id,
        vorlage_id: plan.step.vorlage_id,
        empfaenger_email: empfaenger,
        betreff,
        body_snapshot: html,
        resend_message_id: res.messageId,
        status: 'gesendet',
      })
      if (logErr) console.error('[cold-mailer-advance] Verlauf-Insert fehlgeschlagen (non-fatal):', logErr)

      const zustand = zustandNachSend(steps, plan.step.position, jetzt)
      await db.from('cold_mail_enrollments').update({
        aktueller_step: zustand.aktueller_step,
        next_send_at: zustand.next_send_at?.toISOString() ?? null,
        status: zustand.status,
      }).eq('id', e.id)

      bilanz.gesendet++
    } catch (err) {
      console.error('[cold-mailer-advance] Enrollment', e.id, 'fehlgeschlagen:', err)
      bilanz.fehler++
    }
  }

  return NextResponse.json({ ok: true, ...bilanz, cap: BATCH_CAP })
}
