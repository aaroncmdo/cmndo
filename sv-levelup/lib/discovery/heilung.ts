import type { Db } from '../anreicherung/schreiben'
import { AUSLAND, plzUndOrt } from './schreiben'

/**
 * Bestandsheilung der Lead-Discovery.
 *
 * Ein Lauf schreibt mit den Regeln, die zum Zeitpunkt des Laufs im Code standen.
 * Wird eine Regel spaeter verbessert, ist der CODE geheilt und der BESTAND nicht
 * — die alten Zeilen bleiben, wie sie waren. Dieses Modul zieht sie nach.
 *
 * Zwei Faelle, beide am Deutschland-Lauf vom 20.08. gemessen:
 *
 *   1. 97 auslaendische Betriebe (Oesterreich, Schweiz, Luxemburg, Tschechien).
 *      Der Suchrahmen ist ein Rechteck; das halbe Alpenvorland liegt darin.
 *      Der Filter existiert seit dem Fix — beim Lauf gab es ihn nicht.
 *   2. 111 deutsche Betriebe ohne Ort. „Oelsnitz/Vogtland" und „Dachsberg
 *      (Suedschwarzwald)" sind gewoehnliche amtliche Ortsnamen, aber das alte
 *      Muster liess weder Schraegstrich noch Klammern zu.
 *
 * ⚠ Loeschen ist unumkehrbar. Deshalb ist die Huerde hier HOEHER als beim
 * Verwerfen im Lauf: dort genuegt EIN Verdacht, hier muessen ZWEI unabhaengige
 * Merkmale zusammenkommen — keine deutsche Postleitzahl UND ein Landesname am
 * Ende der Anschrift. Eine deutsche Zeile mit unlesbarer Anschrift faellt damit
 * unter „unklar" und bleibt stehen, statt still zu verschwinden.
 */

export type HeilZeile = {
  id: string
  firma: string | null
  adresse: string | null
  ort: string | null
}

export type Befund =
  | { art: 'ausland'; id: string; text: string }
  | { art: 'ort_nachtragbar'; id: string; plz: string; ort: string; text: string }
  | { art: 'unklar'; id: string; grund: string; text: string }
  | { art: 'in_ordnung'; id: string }

/**
 * Was ist mit dieser Zeile zu tun?
 *
 * Die Reihenfolge ist bedeutungstragend: erst die Frage, ob die Zeile ueberhaupt
 * hierher gehoert, dann die Frage, ob ihre Felder vollstaendig sind. Einen Ort
 * an einer oesterreichischen Anschrift nachzutragen waere Arbeit an einer Zeile,
 * die gleich geloescht wird.
 */
export function beurteileZeile(z: HeilZeile): Befund {
  const text = `${z.firma ?? 'ohne Namen'} — ${z.adresse ?? 'ohne Anschrift'}`

  if (!z.adresse) {
    // Ohne Anschrift laesst sich weder Herkunft noch Ort bestimmen. Nicht
    // loeschen: die Koordinaten koennen brauchbar sein, die Zeile ist nur arm.
    return { art: 'unklar', id: z.id, grund: 'keine Anschrift hinterlegt', text }
  }

  const { plz, ort } = plzUndOrt(z.adresse)
  const auslandsname = AUSLAND.test(z.adresse.trim())

  if (plz === null) {
    if (auslandsname) return { art: 'ausland', id: z.id, text }
    // ⚠ Genau hier greift die zweite Huerde. Eine deutsche Anschrift, deren
    // Postleitzahl das Muster nicht findet, ist ein MUSTER-Fehler und kein
    // Grund zu loeschen — sie gehoert angesehen, nicht entfernt.
    return {
      art: 'unklar',
      id: z.id,
      grund: 'keine deutsche Postleitzahl erkennbar, aber auch kein Landesname',
      text,
    }
  }

  if (auslandsname) {
    // Fuenfstellige Postleitzahl UND Landesname: Frankreich hat beides. Der
    // Landesname ist das staerkere Merkmal — er steht explizit da.
    return { art: 'ausland', id: z.id, text }
  }

  if (z.ort === null && ort !== null) {
    return { art: 'ort_nachtragbar', id: z.id, plz, ort, text }
  }

  return { art: 'in_ordnung', id: z.id }
}

/**
 * ⚠ Die Faecher tragen ihren JEWEILIGEN Befund-Typ, nicht die ganze Union.
 * Sonst muesste jeder Leser die Variante erneut pruefen, obwohl das Fach sie
 * schon beweist — und `plan.ausland[0].plz` waere ein Tippfehler, den der
 * Compiler durchliesse.
 */
export type Plan = {
  ausland: Extract<Befund, { art: 'ausland' }>[]
  nachtragbar: Extract<Befund, { art: 'ort_nachtragbar' }>[]
  unklar: Extract<Befund, { art: 'unklar' }>[]
  inOrdnung: number
}

export function planeHeilung(zeilen: HeilZeile[]): Plan {
  const plan: Plan = { ausland: [], nachtragbar: [], unklar: [], inOrdnung: 0 }
  for (const z of zeilen) {
    const b = beurteileZeile(z)
    if (b.art === 'ausland') plan.ausland.push(b)
    else if (b.art === 'ort_nachtragbar') plan.nachtragbar.push(b)
    else if (b.art === 'unklar') plan.unklar.push(b)
    else plan.inOrdnung++
  }
  return plan
}

/**
 * Loescht eine auslaendische Zeile.
 *
 * ⚠ Die `quelle`-Bedingung ist eine SPERRE, kein Filter. Sie steht in der
 * WHERE-Klausel, damit dieser Pfad einen importierten Bestandslead (DAT, Hand)
 * auch dann nicht treffen kann, wenn der Aufrufer eine falsche Kennung
 * uebergibt. Ein Loeschpfad darf sich nicht darauf verlassen, richtig gerufen
 * zu werden.
 */
export async function loescheAusland(
  db: Db,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('sv_leads')
    .delete()
    .eq('id', id)
    .eq('quelle', 'places_discovery')
    .select()

  if (error) return { ok: false, error: error.message }
  if (!data || (data as unknown[]).length === 0) {
    // ⚠ Kein Fehler, aber auch kein Erfolg: getroffen wurde nichts. Das ist die
    // Klasse „stiller Fehlschlag", die im Projekt schon mehrfach zugeschlagen
    // hat — ein Ergebnis, das niemand liest, sieht aus wie Erfolg.
    return { ok: false, error: 'nicht geloescht — keine Zeile getroffen (falsche Quelle?)' }
  }
  return { ok: true }
}

export async function trageOrtNach(
  db: Db,
  id: string,
  plz: string,
  ort: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await db
    .from('sv_leads')
    .update({ plz, ort })
    .eq('id', id)
    .eq('quelle', 'places_discovery')
    .select()

  if (error) return { ok: false, error: error.message }
  if (!data || (data as unknown[]).length === 0) {
    return { ok: false, error: 'nicht nachgetragen — keine Zeile getroffen' }
  }
  return { ok: true }
}
