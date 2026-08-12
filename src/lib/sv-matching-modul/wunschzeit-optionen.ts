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
import { berlinWallClockToUtc, toBerlinWallClock } from '@/lib/google-calendar/timezone'
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
/**
 * Liegt der Termin vollstaendig innerhalb der Arbeitszeit des Wochentags? PURE.
 *
 * Ops-Test 12.08. (Nachbesserung zu #5176): Die Belegungspruefung allein reicht NICHT —
 * ausserhalb der Arbeitszeit gibt es schlicht keine Belegung, also galt 08:00, 18:00 oder
 * ein Samstag als "frei". Prod-Beleg: 10 self_service-Termine liegen ausserhalb der
 * Arbeitszeit (9x 08:00 bei Start 09:00, 1x 17:00 mit Ende 17:40), einer an einem Samstag.
 * Der abgeloeste `dreiZeiten`-Block clampte auf 8..18 Uhr und kannte weder Arbeitszeiten
 * noch blockierte Wochentage.
 *
 * @param wallStart Berlin-Wall-Clock "YYYY-MM-DDTHH:mm[:ss]" (KEIN UTC — der Wochentag
 *                  muss der Berliner sein, sonst kippt er an Tagesgrenzen).
 * @param proWochentag Arbeitszeit-Fenster je JS-Wochentag (0=So..6=Sa), null = frei/blockiert.
 */
export function liegtInArbeitszeit(
  wallStart: string,
  dauerMin: number,
  proWochentag: (dowJs: number) => { vonMin: number; bisMin: number } | null,
): boolean {
  const m = wallStart.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return false
  // Die Wall-Clock als fiktives UTC lesen -> getUTCDay liefert den BERLINER Wochentag
  // (gleiche Konvention wie ranking.ts/wallToMs; die fiktive TZ hebt sich auf).
  const dowJs = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()
  const fenster = proWochentag(dowJs)
  if (!fenster) return false
  const startMin = +m[4] * 60 + +m[5]
  return startMin >= fenster.vonMin && startMin + dauerMin <= fenster.bisMin
}

export async function istWunschzeitFrei(
  svId: string,
  option: WunschzeitOption,
  db?: SupabaseClient,
): Promise<boolean> {
  const fenster = berechneBlockadeFenster(option.start)
  if (!fenster) return false

  // 1. Arbeitszeit + Wochentag — dieselbe Konfig-Quelle wie freieSlots, damit die
  //    angebotene Wunschzeit denselben Regeln unterliegt wie ein echter Engine-Slot.
  const client: SupabaseClient = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const assignee = { typ: 'sachverstaendiger' as const, id: svId }
  try {
    const { konfigFuerAssignee } = await import('@/lib/termine/engine/slots')
    const konfig = await konfigFuerAssignee(client, assignee)
    if (!liegtInArbeitszeit(toBerlinWallClock(option.start), konfig.slotDauerMin, konfig.proWochentag)) {
      return false
    }
  } catch (err) {
    // Fail-closed: laesst sich die Arbeitszeit nicht bestimmen, wird die Zeit NICHT angeboten.
    console.warn('[wunschzeit] Arbeitszeit-Pruefung fehlgeschlagen:', err)
    return false
  }

  // 2. Belegung (Buchungen ∪ externe Kalender-Blocks ∪ Ausnahmen), fail-closed.
  const res = await pruefeBelegungStrict(assignee, fenster.start, fenster.end, client)
  return res.ok ? res.frei : false
}
