import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hatErstenFall } from '@/lib/werkstatt-onboarding/erster-fall'
import { naechsterAktiverStep, berechneNextSendAt } from '@/lib/werkstatt-onboarding/advance'
import { buildWerkstattMergeVars } from '@/lib/werkstatt-onboarding/merge-vars'
import { sendeStep } from '@/lib/werkstatt-onboarding/send-step'
import type { TemplateKey } from '@/lib/email/google/templates/aktivierung/types'

// Werkstatt-Onboarding-Drip — taeglicher Cron: arbeitet faellige Enrollments ab. Die
// eigentliche Logik ist in T8-T11 pure/isoliert getestet (erster-fall/advance/merge-vars/
// send-step) — diese Route ist nur der duenne Orchestrator darueber.
//
// Ablauf je faelligem Enrollment (status='aktiv' + next_send_at <= jetzt):
//  1) hatErstenFall? -> status='aktiviert' (Ziel erreicht, Drip stoppt endgueltig).
//  2) keine Email bzw. cold_mail_suppression-Treffer? -> status='gestoppt' (derselbe
//     Opt-out-Mechanismus wie der Cold-Mailer).
//  3) sonst: naechsten AKTIVEN Step senden. sv_vorstellung ohne SV-Match im Umkreis wird
//     SOFORT im selben Tick uebersprungen (advance auf den naechsten Step, kein verlorener
//     Tag Wartezeit auf eine Mail, die eh nie kommt).
//
// Anker fuer next_send_at ist IMMER enrollment.erstellt_am (Sequenz-Start) — NICHT
// werkstaetten.aktiviert_am. Sonst wuerden Backfill-Enrollments (Task 16, erstellt lange
// nach der echten Aktivierung) alle Offsets rueckwirkend auf einmal abfeuern.
//
// Auth-Konvention: Bearer ${CRON_SECRET} (assertCronAuth, fail-closed) — identisch zu
// allen anderen Crons (Muster: send-lead-reminders).

export const dynamic = 'force-dynamic'

const BATCH_CAP = 100

const CONFIG = {
  ansprechpartner: 'Nicolas Kitta',
  tel: process.env.WERKSTATT_ANSPRECHPARTNER_TEL ?? '',
  portalBaseUrl: (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de').replace(/\/$/, ''),
}

type WerkstattJoin = {
  id: string
  name: string
  email: string | null
  adresse_ort: string | null
  lat: number | null
  lng: number | null
}

type EnrollmentDue = {
  id: string
  werkstatt_id: string
  aktueller_step: number
  erstellt_am: string
  werkstaetten: WerkstattJoin | WerkstattJoin[]
}

type StepRow = {
  position: number
  offset_tage: number
  aktiv: boolean
  template_key: TemplateKey
  betreff: string
  preheader: string
  copy: unknown
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const jetzt = new Date()

  async function markEnrollment(id: string, patch: Record<string, unknown>) {
    const { error } = await db.from('werkstatt_onboarding_enrollments').update(patch).eq('id', id)
    if (error) {
      console.error('[werkstatt-onboarding-drip] Status-Update fehlgeschlagen fuer Enrollment', id, error.message)
    }
  }

  const { data: due } = await db
    .from('werkstatt_onboarding_enrollments')
    .select(
      'id, werkstatt_id, aktueller_step, erstellt_am, werkstaetten!inner(id, name, email, adresse_ort, lat, lng)',
    )
    .eq('status', 'aktiv')
    .lte('next_send_at', jetzt.toISOString())
    .limit(BATCH_CAP)

  const { data: stepsData } = await db
    .from('werkstatt_onboarding_steps')
    .select('position, offset_tage, aktiv, template_key, betreff, preheader, copy')
    .order('position')
  const steps = (stepsData ?? []) as StepRow[]

  let gesendet = 0
  let gestoppt = 0

  for (const e of (due ?? []) as EnrollmentDue[]) {
    // Nested-FK (AGENTS.md): !inner liefert i.d.R. ein Objekt, defensiv trotzdem normalisieren.
    const wk = Array.isArray(e.werkstaetten) ? e.werkstaetten[0] : e.werkstaetten
    if (!wk) continue

    // 1) Stop-Signal: erster Fall bereits da -> Ziel erreicht, Drip stoppt endgueltig.
    if (await hatErstenFall(db, e.werkstatt_id)) {
      await markEnrollment(e.id, { status: 'aktiviert', next_send_at: null })
      gestoppt++
      continue
    }

    // 2) Ohne Email ist kein Versand moeglich — stoppen statt endlos taeglich zu retryen.
    if (!wk.email) {
      console.error('[werkstatt-onboarding-drip] Werkstatt ohne Email, stoppe Enrollment:', e.werkstatt_id)
      await markEnrollment(e.id, { status: 'gestoppt', next_send_at: null })
      gestoppt++
      continue
    }
    const email = wk.email

    // 3) Opt-out — derselbe cold_mail_suppression-Mechanismus wie der Cold-Mailer.
    const { count: suppressedCount } = await db
      .from('cold_mail_suppression')
      .select('email', { count: 'exact', head: true })
      .eq('email', email)
    if ((suppressedCount ?? 0) > 0) {
      await markEnrollment(e.id, { status: 'gestoppt', next_send_at: null })
      gestoppt++
      continue
    }

    // 4) Naechsten sendbaren Step abarbeiten. sv_vorstellung ohne SV-Match wird SOFORT
    //    (im selben Tick) uebersprungen statt einen vollen Tag auf einen Send zu warten,
    //    der eh nicht passiert (advance auf den naechsten aktiven Step).
    let cursor = e.aktueller_step
    for (;;) {
      const step = naechsterAktiverStep(steps, cursor)
      if (!step) {
        await markEnrollment(e.id, { status: 'fertig', next_send_at: null })
        break
      }

      const merge = await buildWerkstattMergeVars({
        db,
        werkstatt: wk,
        templateKey: step.template_key,
        config: CONFIG,
      })
      const res = await sendeStep({ empfaengerEmail: email, step, merge })

      const naechster = naechsterAktiverStep(steps, step.position)
      const patch = naechster
        ? {
            aktueller_step: step.position,
            next_send_at: berechneNextSendAt(new Date(e.erstellt_am), naechster).toISOString(),
          }
        : { aktueller_step: step.position, status: 'fertig', next_send_at: null }
      await markEnrollment(e.id, patch)

      if (res.skipped === 'kein_sv') {
        // SV-Mail uebersprungen (kein Match im Umkreis) -> sofort den naechsten Step versuchen.
        cursor = step.position
        continue
      }
      if (res.ok && !res.skipped) gesendet++
      break
    }
  }

  return NextResponse.json({ ok: true, gesendet, gestoppt, faellig: due?.length ?? 0 })
}
