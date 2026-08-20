import type { Db } from '../anreicherung/schreiben'
import { erzeugeToken } from './token'

/**
 * Der Praesentationslink — was der Sachverstaendige nach dem Gespraech bekommt.
 *
 * ⚠ Streng getrennt vom Auswertungslink: zwei Tabellen, zwei Tokens, aus dem
 * einen laesst sich der andere nicht ableiten (Design-Spec § 5.3). Der Grund
 * ist die Einwandbehandlung — wer liest, wie seine eigenen Einwaende
 * vorweggenommen werden, fuehrt kein Gespraech mehr, er beendet eines.
 *
 * ⚠ Verhaeltnis zu R-E: unberuehrt. R-E verbietet, dass Massnahmen
 * AUTOMATISCH in einer oeffentlichen Antwort erscheinen. Dieser Link ist
 * bewusst erzeugt, befristet und widerrufbar.
 */

export type PlanlinkErgebnis =
  | { ok: true; token: string; gueltigBis: string }
  | { ok: false; error: string }

export type PruefErgebnis =
  | { ok: true; checkId: string; gueltigBis: string; aufrufe: number }
  | { ok: false; grund: 'unbekannt' | 'abgelaufen' | 'widerrufen' }

type Zeile = {
  token: string
  check_id: string
  gueltig_bis: string
  widerrufen_am: string | null
  aufrufe: number
}

/** Wie lange ein frisch erzeugter Link gilt — wie der DB-Vorgabewert. */
export const GUELTIG_TAGE = 30

/**
 * Holt den gueltigen Planlink eines Checks — oder legt einen neuen an.
 *
 * ⚠ Idempotent NUR fuer gueltige, nicht widerrufene Links. Ein abgelaufener
 * oder zurueckgezogener Link wird NICHT wiederbelebt: ein Widerruf, den ein
 * erneuter Klick aufhebt, ist keiner. Stattdessen entsteht ein neuer Token,
 * und der alte bleibt tot — wer ihn noch hat, kommt nicht mehr hinein.
 */
export async function erzeugePlanlink(
  db: Db,
  checkId: string,
  userId: string,
  jetzt: Date,
): Promise<PlanlinkErgebnis> {
  const { data: vorhanden, error: leseFehler } = await db
    .from('levelup_praesentationen')
    .select('token,check_id,gueltig_bis,widerrufen_am,aufrufe')
    .eq('check_id', checkId)
    .is('widerrufen_am', null)
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (leseFehler) return { ok: false, error: `Link nicht lesbar: ${leseFehler.message}` }

  const alt = vorhanden as Zeile | null
  if (alt && !alt.widerrufen_am && Date.parse(alt.gueltig_bis) > jetzt.getTime()) {
    return { ok: true, token: alt.token, gueltigBis: alt.gueltig_bis }
  }

  const token = erzeugeToken()
  const gueltigBis = new Date(jetzt.getTime() + GUELTIG_TAGE * 86_400_000).toISOString()

  const { data, error } = await db
    .from('levelup_praesentationen')
    .insert({ check_id: checkId, token, erstellt_von: userId, gueltig_bis: gueltigBis })
    .select()
    .single()

  if (error || !data) {
    return { ok: false, error: `Link nicht anlegbar: ${error?.message ?? 'kein Ergebnis'}` }
  }
  return { ok: true, token, gueltigBis }
}

/**
 * Prueft einen Planlink.
 *
 * ⚠ Der Grund wird UNTERSCHIEDEN, weil er im Text steht, den der
 * Sachverstaendige liest: „abgelaufen" laedt zum Nachfragen ein,
 * „zurueckgezogen" nicht. Ein unbekannter Token bekommt dagegen dieselbe
 * Antwort wie jeder andere ungueltige — sonst waere die Seite ein Orakel zum
 * Erraten gueltiger Links.
 */
export async function pruefePlanlink(db: Db, token: string, jetzt: Date): Promise<PruefErgebnis> {
  const { data, error } = await db
    .from('levelup_praesentationen')
    .select('token,check_id,gueltig_bis,widerrufen_am,aufrufe')
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return { ok: false, grund: 'unbekannt' }
  const zeile = data as Zeile

  // Zuerst der Widerruf: er ist die aktivere Aussage. Ein zurueckgezogener
  // Link, der zusaetzlich abgelaufen ist, wurde trotzdem zurueckgezogen.
  if (zeile.widerrufen_am) return { ok: false, grund: 'widerrufen' }
  if (Date.parse(zeile.gueltig_bis) <= jetzt.getTime()) return { ok: false, grund: 'abgelaufen' }

  return {
    ok: true,
    checkId: zeile.check_id,
    gueltigBis: zeile.gueltig_bis,
    aufrufe: zeile.aufrufe ?? 0,
  }
}

/**
 * Zieht einen Planlink zurueck.
 *
 * ⚠ Setzt NUR `widerrufen_am` und loescht nichts — die Aufrufzaehlung bleibt
 * als Spur erhalten. Ob der Plan angesehen wurde, ist die einzige Rueckmeldung,
 * die es dazu gibt.
 */
export async function widerrufePlanlink(
  db: Db,
  token: string,
  jetzt: Date,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('levelup_praesentationen')
    .update({ widerrufen_am: jetzt.toISOString() })
    .eq('token', token)
    .select()

  if (error) return { ok: false, error: error.message }
  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: 'Der Link wurde nicht gefunden.' }
  }
  return { ok: true }
}

/** Zaehlt einen Aufruf. Nicht kritisch — ein Fehlschlag darf die Seite nicht aufhalten. */
export async function vermerkeAufruf(db: Db, token: string, aufrufe: number, jetzt: Date): Promise<void> {
  const { error } = await db
    .from('levelup_praesentationen')
    .update({ aufrufe: aufrufe + 1, letzter_aufruf: jetzt.toISOString() })
    .eq('token', token)
    .select()
  if (error) console.error('Aufruf nicht vermerkt:', error.message)
}
