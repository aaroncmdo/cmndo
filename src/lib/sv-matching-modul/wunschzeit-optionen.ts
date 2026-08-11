// Ops-Test 11.08.2026 (RC-1): Wunschzeit-Option fuer den Embed — PURE + testbar.
//
// Loest den Inline-IIFE `dreiZeiten` aus app/embed/gutachter-finder/actions.ts ab.
// Der erzeugte aus der Wunschstunde H drei synthetische Uhrzeiten [H, H+2, H-2]
// und ERSETZTE damit die echten Engine-Slots (`mitZeiten`) — ohne Belegung, ohne
// Arbeitszeit, ohne Slot-Raster. Im Ops-Test wurde so 12:00 als frei angeboten,
// obwohl der SV laut verbundenem Kalender um 12:30 belegt war; die Engine lehnte
// die Buchung danach korrekt ab (writes.ts pruefeBelegungStrict) — der Kunde bekam
// trotzdem "Termin reserviert", und es entstand kein Termin.
//
// Neu: genau EINE Option (die tatsaechlich gewuenschte Zeit), die der Aufrufer
// NEBEN die echten Engine-Slots stellt und als Anfrage kennzeichnet — nie als Slot.
// Ob sie ueberhaupt angeboten werden darf, entscheidet istWunschzeitFrei.

import type { SupabaseClient } from '@supabase/supabase-js'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { TERMIN_DAUER_MIN, berechneBlockadeFenster } from '@/lib/dispatch/termin-konstanten'
import { pruefeBelegungStrict } from '@/lib/termine/engine/belegung'

export type WunschzeitOption = {
  /** ISO/UTC */
  start: string
  /** ISO/UTC — start + TERMIN_DAUER_MIN */
  end: string
}

/**
 * Baut aus der Berlin-Wall-Clock des Wunschtermin-Pickers ("YYYY-MM-DDTHH:MM")
 * die eine Wunschzeit-Option. Liefert null bei fehlender/ungueltiger Eingabe
 * (berlinWallClockToUtc wirft bei unparsbarem String — hier bewusst gefangen,
 * damit der Matching-Pfad nie an einer Nutzereingabe zerbricht).
 */
export function baueWunschzeitOption(wunschterminLokal: string | null): WunschzeitOption | null {
  if (!wunschterminLokal) return null
  const [datum, zeit] = wunschterminLokal.split('T')
  if (!datum || !zeit) return null
  try {
    const start = berlinWallClockToUtc(`${datum}T${zeit.slice(0, 5)}`)
    if (Number.isNaN(new Date(start).getTime())) return null
    const end = new Date(new Date(start).getTime() + TERMIN_DAUER_MIN * 60_000).toISOString()
    return { start, end }
  } catch {
    return null
  }
}

/**
 * Ist die Wunschzeit beim SV tatsaechlich frei? Prueft das volle Blockade-Fenster
 * (Termindauer + Puffer beidseitig, via berechneBlockadeFenster) gegen v_belegung —
 * also Buchungen UND externe Kalender-Blocks UND Verfuegbarkeits-Ausnahmen.
 *
 * FAIL-CLOSED: DB-Fehler oder unparsbarer Start => false. Eine faelschlich als frei
 * angebotene Wunschzeit ist genau der Ops-Test-Bug — im Zweifel nicht anbieten.
 */
export async function istWunschzeitFrei(
  svId: string,
  option: WunschzeitOption,
  db?: SupabaseClient,
): Promise<boolean> {
  const fenster = berechneBlockadeFenster(option.start)
  if (!fenster) return false
  const res = await pruefeBelegungStrict(
    { typ: 'sachverstaendiger', id: svId },
    fenster.start,
    fenster.end,
    db,
  )
  return res.ok ? res.frei : false
}
