import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { hatErstenFall } from '@/lib/werkstatt-onboarding/erster-fall'
import { naechsterAktiverStep } from '@/lib/werkstatt-onboarding/advance'
import { entscheideStepAdvance } from '@/lib/werkstatt-onboarding/cron-step'
import { buildWerkstattMergeVars } from '@/lib/werkstatt-onboarding/merge-vars'
import { sendeStep } from '@/lib/werkstatt-onboarding/send-step'
import type { TemplateKey } from '@/lib/email/google/templates/aktivierung/types'

// Werkstatt-Onboarding-Drip — taeglicher Cron: arbeitet faellige Enrollments ab. Die
// eigentliche Logik ist in T8-T11 pure/isoliert getestet (erster-fall/advance/merge-vars/
// send-step) — diese Route ist nur der duenne Orchestrator darueber. Die Advance-Entscheidung
// nach einem Sende-Versuch (advance vs. hold) ist in entscheideStepAdvance (cron-step.ts)
// ausgelagert und dort unit-getestet (Review-Fix Task 13).
//
// Ablauf je faelligem Enrollment (status='aktiv' + next_send_at <= jetzt, aeltestes zuerst):
//  0) Werkstatt zwischenzeitlich gesperrt (status!=='aktiv')? -> dieser Run ueberspringt sie
//     komplett (kein Send, kein Status-Wechsel — nur bis sie wieder aktiv ist).
//  1) hatErstenFall? -> status='aktiviert' (Ziel erreicht, Drip stoppt endgueltig).
//  2) keine Email bzw. cold_mail_suppression-Treffer? -> status='gestoppt' (derselbe
//     Opt-out-Mechanismus wie der Cold-Mailer).
//  3) sonst: naechsten AKTIVEN Step senden. Der Cursor ruecht NUR vor, wenn der Step
//     gesendet oder LEGITIM uebersprungen wurde (entscheideStepAdvance):
//       - gesendet -> advance zum naechsten Step.
//       - skipped='kein_sv' (kein SV-Match im Umkreis) -> advance UND sofort (im selben
//         Tick) den naechsten Step versuchen, kein verlorener Tag auf eine Mail, die eh
//         nie kommt.
//       - skipped='copy_invalid' -> advance ueber den kaputten Step (ein Retry auf
//         denselben kaputten Zod-Payload wuerde nie erfolgreich sein; schon in
//         send-step.ts geloggt).
//       - echter Sende-Fehlschlag (ok:false ohne skipped, z.B. SMTP down) -> HOLD: kein
//         Advance, next_send_at bleibt unangetastet, die Zeile bleibt faellig fuer den
//         naechsten Cron-Tick (Mirror send-lead-reminders: `if(!ok){failed++; return}`
//         VOR dem Update, statt den Step permanent zu verlieren).
//
// Anker fuer next_send_at ist IMMER enrollment.erstellt_am (Sequenz-Start) — NICHT
// werkstaetten.aktiviert_am. Sonst wuerden Backfill-Enrollments (Task 16, erstellt lange
// nach der echten Aktivierung) alle Offsets rueckwirkend auf einmal abfeuern.
//
// Jedes Enrollment laeuft in einem eigenen try/catch (Review-Fix Task 13, FIX 2): ein
// unerwarteter Throw (z.B. eine Render-Exception, die vor sendeSteps eigenem try/catch
// passiert) isoliert sich auf GENAU dieses Enrollment und loggt — statt den gesamten
// Tages-Batch abzubrechen.
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
  status: string
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

  async function markEnrollment(id: string, patch: Record<string, unknown>, context?: string) {
    const { error } = await db.from('werkstatt_onboarding_enrollments').update(patch).eq('id', id)
    if (error) {
      // FIX 3: bewusst laut geloggt — bei einem Patch NACH erfolgreichem Send (context
      // gesetzt) bleibt der Cursor stehen, obwohl die Mail schon raus ist. Der naechste
      // Cron-Tick versucht denselben Step dann ERNEUT (seltenes Duplicate-Send-Fenster,
      // s. FIX 3 im Review — dasselbe at-least-once-Muster wie send-lead-reminders, hier
      // nur sichtbar gemacht statt re-architektiert).
      console.error(
        '[werkstatt-onboarding-drip] Status-Update fehlgeschlagen fuer Enrollment',
        id,
        context ? `(${context})` : '',
        error.message,
      )
    }
  }

  const { data: due } = await db
    .from('werkstatt_onboarding_enrollments')
    .select(
      'id, werkstatt_id, aktueller_step, erstellt_am, werkstaetten!inner(id, name, email, adresse_ort, lat, lng, status)',
    )
    .eq('status', 'aktiv')
    .lte('next_send_at', jetzt.toISOString())
    .order('next_send_at', { ascending: true }) // FIX 5: aelteste zuerst, keine Starvation unter BATCH_CAP.
    .limit(BATCH_CAP)

  const { data: stepsData } = await db
    .from('werkstatt_onboarding_steps')
    .select('position, offset_tage, aktiv, template_key, betreff, preheader, copy')
    .order('position')
  const steps = (stepsData ?? []) as StepRow[]

  // I3-Fix (Final-Review): eine leere/fehlgeschlagene steps-Query wuerde JEDE faellige Enrollment
  // auf 'fertig' setzen (terminal — nie wieder Mail). Lieber den Lauf abbrechen, OHNE zu mutieren.
  if (steps.length === 0) {
    console.error('[werkstatt-onboarding] steps-Query leer/fehlgeschlagen — Lauf abgebrochen, keine Enrollment-Mutation.')
    return Response.json({ ok: false, error: 'keine aktiven Steps', faellig: due?.length ?? 0 }, { status: 500 })
  }

  let gesendet = 0
  let aktiviert = 0
  let gestoppt = 0
  let fehler = 0

  for (const e of (due ?? []) as EnrollmentDue[]) {
    try {
      // Nested-FK (AGENTS.md): !inner liefert i.d.R. ein Objekt, defensiv trotzdem normalisieren.
      const wk = Array.isArray(e.werkstaetten) ? e.werkstaetten[0] : e.werkstaetten
      if (!wk) continue

      // 0) FIX 6: Werkstatt zwischenzeitlich gesperrt -> diesen Run komplett ueberspringen.
      //    Kein Send, KEIN Status-Wechsel am Enrollment (sie soll weiterlaufen, sobald die
      //    Werkstatt wieder aktiv ist — nur jetzt nicht angeschrieben werden).
      if (wk.status !== 'aktiv') continue

      // 1) Stop-Signal: erster Fall bereits da -> Ziel erreicht, Drip stoppt endgueltig.
      if (await hatErstenFall(db, e.werkstatt_id)) {
        await markEnrollment(e.id, { status: 'aktiviert', next_send_at: null })
        aktiviert++
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

      // 4) Naechsten sendbaren Step abarbeiten. Die Advance-vs-Hold-Entscheidung ist in
      //    entscheideStepAdvance ausgelagert (FIX 1, unit-getestet in cron-step.test.ts).
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
        const decision = entscheideStepAdvance(res, step, steps, new Date(e.erstellt_am))

        if (decision.patch) {
          // context nur beim echten Sende-Erfolg setzen (FIX 3: genau dort ist ein
          // fehlschlagender Patch ein potenzielles Duplicate-Send-Fenster).
          await markEnrollment(
            e.id,
            decision.patch,
            decision.counter === 'gesendet' ? 'nach erfolgreichem Send, moegliches Duplicate-Send-Fenster' : undefined,
          )
        }
        if (decision.counter === 'gesendet') gesendet++
        if (decision.counter === 'fehler') fehler++

        if (decision.retryNextStep) {
          cursor = step.position
          continue
        }
        break
      }
    } catch (err) {
      // FIX 2: Isolation je Enrollment — ein unerwarteter Throw darf nur DIESES
      // Enrollment killen, nicht den gesamten Tages-Batch. Die aeussere for-of-Schleife
      // laeuft nach dem catch mit dem naechsten Enrollment weiter.
      const message = err instanceof Error ? err.message : String(err)
      console.error('[werkstatt-onboarding-drip] Unerwarteter Fehler fuer Enrollment', e.id, message)
      fehler++
    }
  }

  return NextResponse.json({ ok: true, gesendet, aktiviert, gestoppt, fehler, faellig: due?.length ?? 0 })
}
