import type { Db } from '../anreicherung/schreiben'
import { ladeCheck, type Check } from './check'
import type { ModulId } from './registry'

/** F-03: Zeitgrenze fuer einen Lauf. Danach gilt er als abgebrochen. */
export const ZEITGRENZE_MIN = 10

export type Modulzustand = 'wartet' | 'laeuft' | 'fertig' | 'fehler'

export type MessungOpts = {
  jetzt: () => Date
  /** Stoesst den eigentlichen Lauf an — injiziert, damit Tests nicht messen. */
  starte: (token: string) => Promise<void>
}

export type StartErgebnis =
  | { ok: true; status: Check['status'] }
  | { ok: false; error: string }

export type FortschrittErgebnis =
  | { ok: true; status: Check['status']; module: { id: ModulId; zustand: Modulzustand }[] }
  | { ok: false; error: string }

/**
 * F-03 · Messung starten.
 *
 * ⚠ Idempotent, und das ist keine Kosmetik: jeder erneute Lauf kostet echte
 * Places-Abfragen. Ein Doppelklick oder ein Neuladen der Seite darf die Messung
 * nicht zweimal bezahlen.
 *
 * Der Lauf selbst wird angestossen, nicht abgewartet — die Antwort geht sofort
 * an den Browser zurueck, der dann F-04 pollt.
 */
export async function starteMessung(
  db: Db,
  token: string,
  opts: MessungOpts,
): Promise<StartErgebnis> {
  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }

  // Laeuft schon oder ist durch: denselben Zustand melden, nichts neu starten.
  if (check.status !== 'neu') return { ok: true, status: check.status }

  if (check.module_gewaehlt.length === 0) return { ok: false, error: 'kein_modul' }

  const { data: zeilen, error } = await db
    .from('levelup_checks')
    .update({ status: 'laeuft', fehler_text: null })
    .eq('token', token)
    .select()

  if (error) return { ok: false, error: `Start fehlgeschlagen: ${error.message}` }
  if (!zeilen || zeilen.length === 0) return { ok: false, error: 'start_wirkungslos' }

  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'messung_gestartet',
    payload: { module: check.module_gewaehlt },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  // Erst NACH dem wirksamen Status-Write anstossen — sonst liefe eine Messung
  // zu einem Check, der noch auf 'neu' steht, und ein zweiter Aufruf starte sie
  // erneut.
  await opts.starte(token)

  return { ok: true, status: 'laeuft' }
}

/**
 * F-04 · Messfortschritt.
 *
 * ⚠ Ohne Befunddaten. Diese Antwort wird alle zwei Sekunden geholt; sie darf
 * den Befund nicht vorab ausliefern (F-04) und die Massnahmen schon gar nicht
 * (R-E). Deshalb wird aus `befunde` nur abgeleitet, OB etwas vorliegt.
 *
 * Nebenaufgabe: der Waechter fuer die Zeitgrenze. Ohne ihn bliebe ein
 * abgebrochener Lauf fuer immer auf `laeuft`, und die Pruefliste drehte sich
 * endlos — ein Zustand, aus dem der Nutzer nicht herauskommt.
 */
export async function holeFortschritt(
  db: Db,
  token: string,
  opts: MessungOpts,
): Promise<FortschrittErgebnis> {
  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }

  const status = await pruefeZeitgrenze(db, token, check, opts)

  const befunde = (check.befunde ?? {}) as Record<string, unknown>
  const fehlstellen = (check.fehlstellen ?? {}) as Record<string, unknown[]>

  // Die lokale Variable heisst NICHT `module` — Next verbietet den Namen
  // (CommonJS-Kollision, @next/next/no-assign-module-variable). Der Schluessel
  // in der Antwort muss aber `module` bleiben: so steht er in F-04.
  const zustaende = check.module_gewaehlt.map((id) => ({
    id,
    zustand: zustandVon(id, befunde, fehlstellen, status),
  }))

  return { ok: true, status, module: zustaende }
}

function zustandVon(
  id: ModulId,
  befunde: Record<string, unknown>,
  fehlstellen: Record<string, unknown[]>,
  status: Check['status'],
): Modulzustand {
  // Ein Teilergebnis ist FERTIG, nicht fehlerhaft: einzelne Kriterien duerfen
  // fehlen (Fehlstellen), das Modul hat trotzdem gemessen.
  if (befunde[id]) return 'fertig'
  if (fehlstellen[id]?.length) return 'fehler'
  // Ohne Befund und ohne Fehlstelle: wartet noch — oder ist mit dem Lauf
  // gescheitert.
  return status === 'fehler' ? 'fehler' : 'wartet'
}

/**
 * Selbstheilung statt Cron: wer den Fortschritt abfragt, raeumt einen
 * haengenden Lauf gleich mit auf. Das braucht keinen zusaetzlichen Prozess und
 * greift genau dann, wenn jemand hinsieht.
 */
async function pruefeZeitgrenze(
  db: Db,
  token: string,
  check: Check,
  opts: MessungOpts,
): Promise<Check['status']> {
  if (check.status !== 'laeuft') return check.status

  const seit = (check as unknown as { aktualisiert_am?: string }).aktualisiert_am
  if (!seit) return check.status

  const alterMin = (opts.jetzt().getTime() - Date.parse(seit)) / 60_000
  if (!Number.isFinite(alterMin) || alterMin <= ZEITGRENZE_MIN) return check.status

  const text =
    `Die Messung hat die Zeitgrenze von ${ZEITGRENZE_MIN} Minuten überschritten und wurde abgebrochen.`

  const { error } = await db
    .from('levelup_checks')
    .update({ status: 'fehler', fehler_text: text })
    .eq('token', token)
    .select()

  if (error) {
    console.error('Zeitgrenze nicht setzbar:', error.message)
    return check.status
  }
  return 'fehler'
}
