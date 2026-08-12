import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import {
  istHaenger,
  ermittleImStatusSeit,
  tageImStatus,
  baueHaengerTaskText,
  HAENGER_SCHWELLE_TAGE,
  HAENGER_TASK_CODE,
} from '@/lib/claims/haenger-detektor'

// Ops-Test 12.08. (I1): Haenger-Detektor.
//
// Taeglich. Findet Claims, die laenger als HAENGER_SCHWELLE_TAGE ohne Statusbewegung
// UND ohne aktiven Termin dastehen, und legt pro Fall EINEN Dispatch-Task an.
//
// ANLASS: CLM-2026-01011 hing 14 Tage unbemerkt. Die Erhebung ergab 14 solcher Faelle
// (7-27 Tage). Der SLA-Tracker faengt sie nicht — er ist rein reaktiv ueber
// sla_tracking-Zeilen, und 9 der 14 hatten gar keine.
//
// ⚠ REGISTRIERUNG: Diese Route laeuft NICHT von allein. Sie muss in der VPS-Crontab
// eingetragen werden (siehe docs/vps-crontab.md). Vorschlag (VPS laeuft auf UTC):
//   30 6 * * *  /usr/local/bin/cron-call.sh /api/cron/haenger-detektor
// = 08:30 MESZ, also vor dem Arbeitsbeginn im Dispatch.

/** Sicherung gegen Task-Lawinen: mehr als das legt ein Lauf nie an. */
const MAX_TASKS_PRO_LAUF = 25

/** Termin-Status, die als "aktiver Termin" zaehlen (= der Fall wartet planmaessig). */
const AKTIVE_TERMIN_STATUS = ['reserviert', 'bestaetigt', 'verlegt', 'verlegung_pending']

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const jetzt = new Date()

  // 1) Aktive Claims. Die Grob-Filterung (abgeschlossen_am) passiert in der DB, die
  //    Feinentscheidung in der puren istHaenger — eine Quelle fuer die Regel.
  const { data: claims, error: claimErr } = await db
    .from('claims')
    .select('id, claim_nummer, operative_status, abgeschlossen_am, created_at, geschaedigter_user_id')
    .is('abgeschlossen_am', null)
  if (claimErr) {
    console.error('[haenger-detektor] Claims laden fehlgeschlagen:', claimErr.message)
    return NextResponse.json({ ok: false, error: claimErr.message }, { status: 500 })
  }
  if (!claims || claims.length === 0) {
    return NextResponse.json({ ok: true, geprueft: 0, haenger: 0, tasks: 0 })
  }

  const claimIds = claims.map((c) => c.id as string)

  // 2) Seit wann steht der Claim im AKTUELLEN Status? Bewusst NICHT "juengste Transition":
  //    ein Uebergang, der zurueckfaellt, ist keine Bewegung (siehe ermittleImStatusSeit).
  const { data: transitions } = await db
    .from('phase_transitions')
    .select('claim_id, created_at, to_phase')
    .in('claim_id', claimIds)
  const transitionsByClaim = new Map<string, Array<{ to_phase: string | null; created_at: string | null }>>()
  for (const t of transitions ?? []) {
    const id = t.claim_id as string | null
    if (!id) continue
    const liste = transitionsByClaim.get(id)
    const eintrag = { to_phase: (t.to_phase as string | null) ?? null, created_at: (t.created_at as string | null) ?? null }
    if (liste) liste.push(eintrag)
    else transitionsByClaim.set(id, [eintrag])
  }
  const imStatusSeitById = new Map<string, string>()
  for (const c of claims) {
    const id = c.id as string
    imStatusSeitById.set(
      id,
      ermittleImStatusSeit(
        transitionsByClaim.get(id) ?? [],
        (c.operative_status as string | null) ?? null,
        c.created_at as string,
      ),
    )
  }

  // 3) Aktive Termine. Der Bezug haengt je nach Alter an claim_id, fall_id ODER bezug_id
  //    — alle drei beruecksichtigen, sonst gilt ein terminierter Fall faelschlich als Haenger.
  const { data: termine } = await db
    .from('gutachter_termine')
    .select('claim_id, fall_id, bezug_id')
    .is('cancelled_at', null)
    .in('status', AKTIVE_TERMIN_STATUS)
  const mitAktivemTermin = new Set<string>()
  for (const t of termine ?? []) {
    for (const key of ['claim_id', 'fall_id', 'bezug_id'] as const) {
      const v = t[key] as string | null
      if (v) mitAktivemTermin.add(v)
    }
  }

  // 4) Kunde (Name/E-Mail) fuer die Test-/Smoke-Heuristik.
  const kundenIds = Array.from(
    new Set(claims.map((c) => c.geschaedigter_user_id as string | null).filter((v): v is string => !!v)),
  )
  const kundeById = new Map<string, { name: string | null; email: string | null }>()
  if (kundenIds.length > 0) {
    const { data: profile } = await db
      .from('profiles')
      .select('id, vorname, nachname, email')
      .in('id', kundenIds)
    for (const p of profile ?? []) {
      kundeById.set(p.id as string, {
        name: [p.vorname, p.nachname].filter(Boolean).join(' ') || null,
        email: (p.email as string | null) ?? null,
      })
    }
  }

  // 5) Haenger bestimmen (pure Regel).
  const haenger = claims.filter((c) => {
    const id = c.id as string
    const kunde = c.geschaedigter_user_id ? kundeById.get(c.geschaedigter_user_id as string) : undefined
    return istHaenger(
      {
        imStatusSeit: imStatusSeitById.get(id) ?? (c.created_at as string),
        hatAktivenTermin: mitAktivemTermin.has(id),
        operativeStatus: (c.operative_status as string | null) ?? null,
        abgeschlossenAm: (c.abgeschlossen_am as string | null) ?? null,
        kundeName: kunde?.name ?? null,
        kundeEmail: kunde?.email ?? null,
      },
      jetzt,
    )
  })

  if (haenger.length === 0) {
    return NextResponse.json({ ok: true, geprueft: claims.length, haenger: 0, tasks: 0 })
  }

  // 6) DEDUP — pro Claim hoechstens EIN offener Haenger-Task. Ohne diesen Schritt baut
  //    ein taeglicher Cron denselben Berg, der am 12.08. schon einmal aufgeraeumt werden
  //    musste (226 identische Tasks auf einem Claim, Migration 20260812145105).
  const haengerIds = haenger.map((c) => c.id as string)
  const { data: vorhandene } = await db
    .from('tasks')
    .select('claim_id')
    .eq('task_code', HAENGER_TASK_CODE)
    .neq('status', 'erledigt')
    .in('claim_id', haengerIds)
  const hatBereitsTask = new Set((vorhandene ?? []).map((t) => t.claim_id as string).filter(Boolean))

  const offen = haenger.filter((c) => !hatBereitsTask.has(c.id as string))
  const zuAnlegen = offen.slice(0, MAX_TASKS_PRO_LAUF)

  let angelegt = 0
  for (const c of zuAnlegen) {
    const id = c.id as string
    const tage = tageImStatus(imStatusSeitById.get(id) ?? (c.created_at as string), jetzt)
    const { titel, beschreibung } = baueHaengerTaskText({
      claimNummer: (c.claim_nummer as string | null) ?? null,
      operativeStatus: (c.operative_status as string | null) ?? null,
      tage,
    })
    try {
      await createLinkedTask({
        titel,
        beschreibung,
        // 'dringend', NICHT 'hoch': tasks_prioritaet_check erlaubt nur
        // ['normal','dringend','kritisch'] — ein ungueltiges Literal wuerde vom CHECK
        // still verworfen (der Cron meldete "ok" bei 0 angelegten Tasks).
        prioritaet: 'dringend',
        claim_id: id,
        typ: 'dispatch',
        task_code: HAENGER_TASK_CODE,
        empfaenger_rolle: 'dispatch',
        trigger_event: 'haenger-detektor',
        auto_erstellt: true,
      })
      angelegt++
    } catch (err) {
      // Ein fehlgeschlagener Task darf den Lauf nicht abbrechen — der naechste Claim
      // soll trotzdem gemeldet werden.
      console.error('[haenger-detektor] Task-Anlage fehlgeschlagen fuer', id, err)
    }
  }

  const uebersprungen = offen.length - zuAnlegen.length
  if (uebersprungen > 0) {
    // Kein stilles Kappen: wenn der Deckel greift, muss das sichtbar sein.
    console.warn(`[haenger-detektor] ${uebersprungen} Haenger wegen MAX_TASKS_PRO_LAUF nicht gemeldet`)
  }

  return NextResponse.json({
    ok: true,
    geprueft: claims.length,
    haenger: haenger.length,
    bereits_gemeldet: hatBereitsTask.size,
    tasks: angelegt,
    uebersprungen,
    schwelle_tage: HAENGER_SCHWELLE_TAGE,
    geprueft_am: jetzt.toISOString(),
  })
}
