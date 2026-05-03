// AAR-759 Phase 1: Mietwagen-Cron. Läuft täglich, prüft alle Fälle mit
// `mietwagen_hat=true` und emittiert phasen-spezifische Events:
//
//   - Tag 0..limit-5: Rechnung ausstehend (niedrige Frequenz)
//   - Tag limit-3..limit: Abgabe naht (hohe Frequenz)
//   - Tag > limit+puffer: Über Limit (eskaliert)
//
// Events laufen durch AAR-764 Resolver und erzeugen Tasks + Reminder.
// Cron selbst sendet keine Notifications direkt.

import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'

type MietwagenFall = {
  id: string
  mietwagen_hat: boolean | null
  mietwagen_seit_datum: string | null
  mietwagen_limit_tage: number | null
  mietwagen_argumentations_puffer: number | null
  mietwagen_rechnung_vorhanden: boolean | null
  status: string | null
  lead_id: string | null
}

export type MietwagenCronResult = {
  checked: number
  rechnung_ausstehend: number
  abgabe_naht: number
  ueber_limit: number
  errors: string[]
}

export async function runMietwagenCron(): Promise<MietwagenCronResult> {
  const db = createAdminClient()
  const result: MietwagenCronResult = {
    checked: 0,
    rechnung_ausstehend: 0,
    abgabe_naht: 0,
    ueber_limit: 0,
    errors: [],
  }

  const { data: faelle, error } = await db
    .from('faelle')
    .select(
      'id, mietwagen_hat, mietwagen_seit_datum, mietwagen_limit_tage, mietwagen_argumentations_puffer, mietwagen_rechnung_vorhanden, status, lead_id',
    )
    .eq('mietwagen_hat', true)
    .is('abgeschlossen_am', null)
    .not('status', 'eq', 'storniert')
    .limit(500)

  if (error) {
    result.errors.push(`Query: ${error.message}`)
    return result
  }
  if (!faelle?.length) return result

  const now = new Date()
  const today = new Date(now.toDateString())

  for (const fall of faelle as MietwagenFall[]) {
    try {
      result.checked++

      if (!fall.mietwagen_seit_datum) continue

      const seit = new Date(fall.mietwagen_seit_datum)
      const taegeIm = Math.floor((today.getTime() - seit.getTime()) / (1000 * 60 * 60 * 24))
      const limit = fall.mietwagen_limit_tage ?? 14
      const puffer = fall.mietwagen_argumentations_puffer ?? 3
      const restTage = limit - taegeIm
      const limitDatum = new Date(seit.getTime() + limit * 1000 * 60 * 60 * 24).toISOString()

      // Über Limit + Puffer → Eskalation
      if (taegeIm > limit + puffer) {
        await emitEvent(
          'mietwagen.ueber_limit',
          {
            fallId: fall.id,
            tage_ueber: taegeIm - limit,
            limit_datum: limitDatum,
          },
          { fallId: fall.id },
        )
        result.ueber_limit++
        continue
      }

      // Abgabe naht (3 Tage vor Limit bis zum Limit)
      if (restTage >= 0 && restTage <= 3) {
        await emitEvent(
          'mietwagen.abgabe_naht',
          {
            fallId: fall.id,
            tage_rest: restTage,
            limit_datum: limitDatum,
          },
          { fallId: fall.id },
        )
        result.abgabe_naht++
      }

      // Rechnung ausstehend — egal wo im Zeitverlauf, solange keine Rechnung
      // und vor Limit
      if (
        !fall.mietwagen_rechnung_vorhanden &&
        restTage > 3 &&
        taegeIm >= 5 // erst ab Tag 5 nachfragen
      ) {
        // Nur 1× pro Woche emittieren
        if (taegeIm % 7 === 0) {
          await emitEvent(
            'mietwagen.rechnung_ausstehend',
            {
              fallId: fall.id,
              seit_tage: taegeIm,
            },
            { fallId: fall.id },
          )
          result.rechnung_ausstehend++
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`Fall ${fall.id}: ${msg}`)
    }
  }

  return result
}
