/**
 * Die kanonische Liste der Dokument-Typen, die im System VERGEBEN werden koennen.
 *
 * ANLASS (28.08.2026): `fall_dokumente.dokument_typ` ist freier Text — **kein CHECK-Constraint,
 * keine Union, keine Registry**. Jeder Schreiber konnte einen beliebigen String setzen. Folge:
 *
 *  * Die Pflichtdokumente-Matrix forderte `unfallbericht_polizei`; geschrieben wird
 *    `polizeibericht`. Der Abgleich `!vorhandene.has(typ)` meldete das Dokument deshalb
 *    **dauerhaft als fehlend** — auch wenn es laengst hochgeladen war.
 *  * Von ALLEN Typen der Matrix existierte real genau einer (`fahrzeugschein`).
 *  * Im Code stehen Dubletten nebeneinander: `schadensfoto` (6×) und `schadensfotos` (2×),
 *    `polizeibericht` und `polizeiliche_unfallmitteilung`.
 *
 * ⭐ Diese Datei ist die **eine Quelle**. Wer eine Pflicht auf einen Typ formuliert, der hier
 * nicht steht, fordert ein Dokument an, das niemand hochladen kann — und blockiert damit einen
 * Fall, statt ihn voranzubringen. `npm run check:dokument-typen` erzwingt das.
 *
 * ⚠ Die Liste ist aus dem erhoben, was der Code HEUTE schreibt (`grep "dokument_typ: '…'"`),
 * nicht aus einem Wunschbild. Ein neuer Typ gehoert zuerst hierhin, dann in die Schreibstelle.
 */

/** Kunden-/Fall-Dokumente, die im Flow oder von Mitarbeitenden hochgeladen werden. */
export const FALL_DOKUMENT_TYPEN = [
  'fahrzeugschein',
  'polizeibericht',
  'polizeiliche_unfallmitteilung',
  'schadensfoto',
  'schadensfotos',
  'unfallfotos',
  'unfallort_foto',
  'gegner_fahrzeug_foto',
  'gegner_unterschrift',
  'sachschaden_foto',
  'sachschaden_rechnung',
  'fuehrerschein',
  'sicherungsabtretung',
  'vertrag',
  'gutachten',
  'rechnung_gutachten',
  'kostenvoranschlag',
  'reparaturauftrag',
  'schlussrechnung',
  'technische_stellungnahme',
  'anschlussschreiben',
  'abrechnung_intern',
  'freigabe_bank',
  'lexdrive_bot_output',
  'whatsapp-foto',
  'sonstiges',
] as const

/** SV-Nachweise (eigener Ablauf: `pflichtdokumente`-Tabelle, nicht `fall_dokumente`). */
export const SV_DOKUMENT_TYPEN = [
  'sv_berufshaftpflicht',
  'sv_gewerbeanmeldung',
] as const

export type FallDokumentTyp = (typeof FALL_DOKUMENT_TYPEN)[number]

const ALLE = new Set<string>([...FALL_DOKUMENT_TYPEN, ...SV_DOKUMENT_TYPEN])

/** Kann dieser Typ im System ueberhaupt vergeben werden? */
export function istBekannterDokumentTyp(typ: string): boolean {
  return ALLE.has(typ)
}

/**
 * ⚠ BEKANNTE ALTLASTEN — hier dokumentiert statt stillschweigend geduldet:
 *
 *  * `schadensfoto` vs. `schadensfotos` — dieselbe Sache, zwei Namen. Eine Zusammenlegung
 *    muss die Bestandszeilen mitnehmen (6 bzw. 2 Schreibstellen im Code, 5 Zeilen auf prod);
 *    deshalb stehen vorerst beide hier.
 *  * `polizeibericht` vs. `polizeiliche_unfallmitteilung` — fachlich zwei Dokumente
 *    (Bericht der Polizei vs. die Mitteilung an die Beteiligten), umgangssprachlich oft
 *    dasselbe. Pflichtregeln nutzen `polizeibericht`.
 *  * Im Code steht eine Schreibstelle mit `dokument_typ: 'x'` — ein Platzhalter, der auf prod
 *    landen kann. Nicht in dieser Liste, damit der Ratchet ihn nicht legitimiert.
 */
export const BEKANNTE_DUBLETTEN = [
  ['schadensfoto', 'schadensfotos'],
  ['polizeibericht', 'polizeiliche_unfallmitteilung'],
] as const
