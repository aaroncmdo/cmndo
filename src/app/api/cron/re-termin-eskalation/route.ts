import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'

export const dynamic = 'force-dynamic'

/**
 * CMM-41: Re-Termin-Eskalations-Cron.
 *
 * Laeuft 1x pro Stunde (vercel.json: `0 * * * *`).
 *
 * Filter: Faelle mit
 *   - no_show_gemeldet_am > 48h alt
 *   - re_termin_token_eingelaufen_am IS NULL (Kunde hat NICHT reagiert)
 *   - re_termin_eskalation_an_kb_am IS NULL (noch nicht eskaliert)
 *   - storniert_am IS NULL (Cron no-show-timeout hat noch nicht storniert)
 *
 * Pro Match:
 *   - Mitteilung an KB: „Kunde reagiert nicht auf Re-Termin-Einladung — bitte
 *     manuell uebernehmen"
 *   - Setzt re_termin_eskalation_an_kb_am = now() (Idempotenz-Marker)
 *
 * Folge: 5-Werktage-Storno-Cron (no-show-timeout) bleibt davon unberuehrt —
 * stornoiert weiterhin am Tag 5 wenn keine Reaktion kam. Diese Eskalation
 * ist die Vor-Storno-Warnung an den KB.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()

  // CMM-47 A.3: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // fall_id statt id; re_termin_token_eingelaufen_am + re_termin_eskalation_an_kb_am +
  // storniert_am sind seit Migration 20260515095400 in der View.
  const { data: faelle, error: faelleErr } = await db
    .from('v_claim_full')
    .select('fall_id, claim_nummer, lead_id, kundenbetreuer_id, no_show_gemeldet_am, re_termin_token')
    .lt('no_show_gemeldet_am', cutoff)
    .not('no_show_gemeldet_am', 'is', null)
    .is('re_termin_token_eingelaufen_am', null)
    .is('re_termin_eskalation_an_kb_am', null)
    .is('storniert_am', null)
    .not('re_termin_token', 'is', null) // Token muss vergeben sein, sonst kein Re-Termin-Flow
    .not('kundenbetreuer_id', 'is', null)

  if (faelleErr) {
    console.error('[re-termin-eskalation] faelle query:', faelleErr.message)
    return NextResponse.json({ error: faelleErr.message }, { status: 500 })
  }

  if (!faelle?.length) {
    return NextResponse.json({ checked: 0, eskaliert: 0 })
  }

  let eskaliert = 0

  for (const fall of faelle) {
    const fallNummer = (fall.claim_nummer as string | null) ?? (fall.fall_id as string).slice(0, 8)

    // Lead-Vorname fuer den Mitteilungs-Inhalt (best-effort)
    let kundenname: string | null = null
    if (fall.lead_id) {
      const { data: lead } = await db
        .from('leads')
        .select('vorname, nachname')
        .eq('id', fall.lead_id as string)
        .single()
      if (lead) {
        const v = (lead.vorname as string | null) ?? ''
        const n = (lead.nachname as string | null) ?? ''
        kundenname = `${v} ${n}`.trim() || null
      }
    }

    const created = await createMitteilung({
      empfaenger_id: fall.kundenbetreuer_id as string,
      empfaenger_rolle: 'kundenbetreuer',
      kategorie: 'task',
      titel: 'Re-Termin: Kunde reagiert nicht',
      inhalt: `Fall ${fallNummer}${kundenname ? ` (${kundenname})` : ''}: Der Kunde hat seit 48h nicht auf die Re-Termin-Einladung reagiert. Bitte direkt kontaktieren — sonst storniert der Cron in 3 Werktagen.`,
      kontext_typ: 'fall',
      kontext_id: fall.fall_id as string,
      prioritaet: 'hoch',
    })

    if (!created) {
      console.error(`[re-termin-eskalation] createMitteilung fehlgeschlagen fuer Fall ${fall.fall_id}`)
      continue
    }

    const { error: updateErr } = await db
      .from('faelle')
      .update({ re_termin_eskalation_an_kb_am: new Date().toISOString() })
      .eq('id', fall.fall_id as string)

    if (updateErr) {
      console.error(`[re-termin-eskalation] Marker-Update fehlgeschlagen fuer Fall ${fall.fall_id}:`, updateErr.message)
      continue
    }

    eskaliert++
  }

  console.log(`[CMM-41] re-termin-eskalation: ${faelle.length} geprueft, ${eskaliert} eskaliert`)

  return NextResponse.json({
    checked: faelle.length,
    eskaliert,
  })
}
