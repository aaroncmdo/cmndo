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
  status: string | null
  lead_id: string | null
  // CMM-44 SP-B PR2c: mietwagen_*-Felder aus claims (SSoT) via Embed
  claims: {
    mietwagen_seit_datum: string | null
    mietwagen_limit_tage: number | null
    mietwagen_argumentations_puffer: number | null
    mietwagen_rechnung_vorhanden: boolean | null
    abgeschlossen_am: string | null
    hat_mietwagen: boolean | null
  } | null
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

  // CMM-44 SP-A: abgeschlossen_am liegt auf claims (SSoT) — der Abschluss-
  // Filter laeuft jetzt ueber den !inner-Embed claims.abgeschlossen_am IS NULL.
  // CMM-44 SP-A2 (Cluster 2): mietwagen_hat → claims.hat_mietwagen (SSoT).
  // CMM-44 SP-B PR2c: mietwagen_*-Felder ebenfalls auf claims (SSoT).
  const { data: faelle, error } = await db
    .from('faelle')
    .select(
      'id, status, lead_id, claims:claim_id!inner(mietwagen_seit_datum, mietwagen_limit_tage, mietwagen_argumentations_puffer, mietwagen_rechnung_vorhanden, abgeschlossen_am, hat_mietwagen)',
    )
    .eq('claims.hat_mietwagen', true)
    .is('claims.abgeschlossen_am', null)
    .not('status', 'eq', 'storniert')
    .limit(500)

  if (error) {
    result.errors.push(`Query: ${error.message}`)
    return result
  }
  if (!faelle?.length) return result

  const now = new Date()
  const today = new Date(now.toDateString())

  for (const fall of faelle as unknown as MietwagenFall[]) {
    try {
      result.checked++

      // CMM-44 SP-B PR2c: mietwagen_*-Felder aus claims-Embed (Array/Objekt normalisieren)
      const claimEmbed = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

      if (!claimEmbed?.mietwagen_seit_datum) continue

      const seit = new Date(claimEmbed.mietwagen_seit_datum)
      const taegeIm = Math.floor((today.getTime() - seit.getTime()) / (1000 * 60 * 60 * 24))
      const limit = claimEmbed.mietwagen_limit_tage ?? 14
      const puffer = claimEmbed.mietwagen_argumentations_puffer ?? 3
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
        !claimEmbed?.mietwagen_rechnung_vorhanden &&
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
