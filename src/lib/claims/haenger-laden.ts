// Ladelogik fuer haengende Claims — geteilt zwischen Cron und Admin-Dashboard.
//
// WARUM GETEILT: Die Regel, wann ein Fall "haengt", darf nur EINMAL existieren. Haette das
// Dashboard eine eigene Query, zeigte es frueher oder spaeter etwas anderes an, als der Cron
// meldet — und niemand koennte sagen, welche der beiden Zahlen stimmt. Genau diese Klasse
// (zwei Quellen fuer dieselbe Aussage) hat in dieser Codebase schon mehrfach geblutet.
//
// Aufteilung:
//   • haenger-detektor.ts = PURE Regeln (istHaenger/terminSchuetztNoch/…), unit-getestet
//   • diese Datei         = DB-Zugriff, nutzt die Regeln
//   • Consumer            = api/cron/haenger-detektor (legt Tasks an)
//                           admin/_components/HaengendeFaelleWidget (zeigt sie)

import type { SupabaseClient } from '@supabase/supabase-js'
import { istHaenger, ermittleImStatusSeit, tageImStatus, terminSchuetztNoch } from './haenger-detektor'

// Der Caller reicht einen Admin- oder RLS-Client herein — beide implementieren dieselbe
// supabase-js-API. Generisch wie in convert-lead-to-fall.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

/** Termin-Status, die als "aktiver Termin" zaehlen (= der Fall wartet planmaessig). */
export const AKTIVE_TERMIN_STATUS = ['reserviert', 'bestaetigt', 'verlegt', 'verlegung_pending']

export type HaengenderClaim = {
  id: string
  claimNummer: string | null
  operativeStatus: string | null
  /** Seit wann steht der Fall im AKTUELLEN Status (ISO). */
  imStatusSeit: string
  /** Ganze Tage ohne Bewegung — die Sortier- und Anzeigegroesse. */
  tage: number
}

export type HaengerLadeErgebnis = {
  /** Absteigend nach Wartezeit: wer am laengsten steht, steht vorn. */
  haenger: HaengenderClaim[]
  /** Wie viele aktive Claims insgesamt geprueft wurden. */
  geprueft: number
  /** Gesetzt, wenn ein Read fehlschlug — Caller entscheidet (Cron: 500, Widget: still). */
  error?: string
}

/**
 * Ermittelt alle Claims, die laenger als die Schwelle ohne Statusbewegung UND ohne
 * (noch gueltigen) Termin dastehen.
 *
 * Wirft nicht — ein Lesefehler kommt als `error` zurueck. Ein Dashboard-Widget darf an
 * einer kaputten Query nicht die ganze Seite mitreissen.
 */
export async function ladeHaengendeClaims(
  db: AnySupabase,
  jetzt: Date = new Date(),
): Promise<HaengerLadeErgebnis> {
  // 1) Aktive Claims. Grob-Filter in der DB, Feinentscheidung in der puren istHaenger.
  const { data: claims, error: claimErr } = await db
    .from('claims')
    .select('id, claim_nummer, operative_status, abgeschlossen_am, created_at, geschaedigter_user_id')
    .is('abgeschlossen_am', null)
  if (claimErr) return { haenger: [], geprueft: 0, error: claimErr.message }
  if (!claims || claims.length === 0) return { haenger: [], geprueft: 0 }

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
    const eintrag = {
      to_phase: (t.to_phase as string | null) ?? null,
      created_at: (t.created_at as string | null) ?? null,
    }
    const liste = transitionsByClaim.get(id)
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
  //    `start_zeit` MUSS mit: ein Termin mit aktivem Status galt bis 31.08. unabhaengig von
  //    seiner Zeit als Schutz, wodurch gerade die schlimmsten Faelle aus dem Alarm fielen.
  const { data: termine } = await db
    .from('gutachter_termine')
    .select('claim_id, fall_id, bezug_id, start_zeit')
    .is('cancelled_at', null)
    .in('status', AKTIVE_TERMIN_STATUS)
  const mitAktivemTermin = new Set<string>()
  for (const t of termine ?? []) {
    if (!terminSchuetztNoch(t.start_zeit as string | null, jetzt)) continue
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

  // 5) Haenger bestimmen (pure Regel) + nach Wartezeit sortieren.
  const haenger: HaengenderClaim[] = []
  for (const c of claims) {
    const id = c.id as string
    const imStatusSeit = imStatusSeitById.get(id) ?? (c.created_at as string)
    const kunde = c.geschaedigter_user_id
      ? kundeById.get(c.geschaedigter_user_id as string)
      : undefined
    const trifft = istHaenger(
      {
        imStatusSeit,
        hatAktivenTermin: mitAktivemTermin.has(id),
        operativeStatus: (c.operative_status as string | null) ?? null,
        abgeschlossenAm: (c.abgeschlossen_am as string | null) ?? null,
        kundeName: kunde?.name ?? null,
        kundeEmail: kunde?.email ?? null,
      },
      jetzt,
    )
    if (!trifft) continue
    haenger.push({
      id,
      claimNummer: (c.claim_nummer as string | null) ?? null,
      operativeStatus: (c.operative_status as string | null) ?? null,
      imStatusSeit,
      tage: tageImStatus(imStatusSeit, jetzt),
    })
  }

  // ⭐ Absteigend nach Wartezeit. Nutzt BEIDEN Consumern: das Dashboard zeigt oben, wer am
  // laengsten wartet — und der Cron legt bei erreichtem MAX_TASKS_PRO_LAUF die aeltesten
  // Faelle an statt einer beliebigen Teilmenge.
  haenger.sort((a, b) => b.tage - a.tage)

  return { haenger, geprueft: claims.length }
}
