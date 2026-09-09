// Die korrigierbaren Felder eines Fahrzeugscheins — EINE Quelle fuer alle Oberflaechen.
//
// Ops-Test 11.08. (RC-3): Die Feldmenge stand viermal untereinander im Code, jedes Mal
// mit vier statt zwoelf Feldern — Halteranschrift, FIN, HSN/TSN und Erstzulassung konnte
// der Kunde weder sehen noch richtigstellen. Behoben, aber die Liste lebte danach
// weiterhin NUR im Wizard-Feld (`Zb1UploadField`). Der Schnellstart-Scan im Kunden-
// Onboarding baute daneben eine eigene, wieder auf vier Felder verengte Anzeige auf —
// rein lesend, ohne jede Korrekturmoeglichkeit (gemessen 09.09.2026 auf prod).
//
// Deshalb liegt die Liste jetzt hier: pure, ohne 'use client', ohne Styling. Wer ZB1-Werte
// anzeigt oder korrigieren laesst, importiert sie — ein neues Feld ist EINE Aenderung.
// Die Label-Schluessel zeigen bewusst in den bestehenden `wizard_fields`-Namensraum,
// damit dieselben Uebersetzungen in allen Oberflaechen stehen.

/** Die Felder, die `confirmZb1Korrekturen` entgegennimmt (Reihenfolge = Anzeige). */
export const ZB1_KORREKTUR_FELDER = [
  'kennzeichen',
  'fahrzeug_hersteller',
  'fahrzeug_modell',
  'erstzulassung',
  'fahrzeug_farbe',
  'halter_name',
  'halter_strasse',
  'halter_plz',
  'halter_stadt',
  'fin',
  'hsn',
  'tsn',
] as const

export type Zb1KorrekturFeld = (typeof ZB1_KORREKTUR_FELDER)[number]
export type Zb1Werte = Record<Zb1KorrekturFeld, string>

/** Anzeige-Gruppen. `titelKey`/`labelKey` liegen im i18n-Namensraum `wizard_fields`. */
export const ZB1_GRUPPEN: ReadonlyArray<{
  titelKey: string
  felder: ReadonlyArray<{ feld: Zb1KorrekturFeld; labelKey: string }>
}> = [
  {
    titelKey: 'zb1_gruppe_fahrzeug',
    felder: [
      { feld: 'kennzeichen', labelKey: 'zb1_label_kennzeichen' },
      { feld: 'fahrzeug_hersteller', labelKey: 'zb1_label_hersteller' },
      { feld: 'fahrzeug_modell', labelKey: 'zb1_label_modell' },
      { feld: 'erstzulassung', labelKey: 'zb1_label_erstzulassung' },
      { feld: 'fahrzeug_farbe', labelKey: 'zb1_label_farbe' },
    ],
  },
  {
    titelKey: 'zb1_gruppe_halter',
    felder: [
      { feld: 'halter_name', labelKey: 'zb1_label_halter' },
      { feld: 'halter_strasse', labelKey: 'zb1_label_halter_strasse' },
      { feld: 'halter_plz', labelKey: 'zb1_label_halter_plz' },
      { feld: 'halter_stadt', labelKey: 'zb1_label_halter_stadt' },
    ],
  },
  {
    titelKey: 'zb1_gruppe_technisch',
    felder: [
      { feld: 'fin', labelKey: 'zb1_label_fin' },
      { feld: 'hsn', labelKey: 'zb1_label_hsn' },
      { feld: 'tsn', labelKey: 'zb1_label_tsn' },
    ],
  },
]

export function leereZb1Werte(): Zb1Werte {
  return Object.fromEntries(ZB1_KORREKTUR_FELDER.map((f) => [f, ''])) as Zb1Werte
}

/**
 * Baut die Anzeigewerte aus einer beliebigen Quelle (OCR-Ergebnis, Lead-/Fall-Spalten).
 * Akzeptiert die Schreibweisen beider Welten: der ZB1-Parser liefert `fin_vin` und
 * `halter_vorname`/`halter_nachname`, die Fall-Sicht `fin_vin` bzw. `fin` — der Halter-
 * Name wird fuer die Anzeige zu EINEM Feld zusammengezogen, weil `confirmZb1Korrekturen`
 * ihn beim Schreiben wieder trennt.
 */
export function baueZb1Werte(quelle: Record<string, unknown> | null | undefined): Zb1Werte {
  const werte = leereZb1Werte()
  if (!quelle) return werte
  const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim())

  werte.kennzeichen = text(quelle.kennzeichen)
  werte.fahrzeug_hersteller = text(quelle.fahrzeug_hersteller ?? quelle.hersteller)
  werte.fahrzeug_modell = text(quelle.fahrzeug_modell ?? quelle.modell ?? quelle.modell_haupttyp)
  werte.erstzulassung = text(quelle.erstzulassung)
  werte.fahrzeug_farbe = text(quelle.fahrzeug_farbe ?? quelle.farbe ?? quelle.farbe_klartext)
  werte.halter_strasse = text(quelle.halter_strasse)
  werte.halter_plz = text(quelle.halter_plz)
  werte.halter_stadt = text(quelle.halter_stadt)
  werte.fin = text(quelle.fin ?? quelle.fin_vin)
  werte.hsn = text(quelle.hsn)
  werte.tsn = text(quelle.tsn)

  const halterName = text(quelle.halter_name)
  werte.halter_name = halterName
    ? halterName
    : [text(quelle.halter_vorname), text(quelle.halter_nachname)].filter(Boolean).join(' ')

  return werte
}

/**
 * Nur die Felder, die der Kunde tatsaechlich geaendert hat — leere Eingaben zaehlen als
 * „nicht gesetzt" und ueberschreiben nie einen vorhandenen Wert. Ein Kunde, der ein Feld
 * leert, weil er es nicht kennt, soll damit keinen bekannten Wert loeschen.
 */
export function nurGeaenderte(vorher: Zb1Werte, nachher: Zb1Werte): Partial<Zb1Werte> {
  const diff: Partial<Zb1Werte> = {}
  for (const feld of ZB1_KORREKTUR_FELDER) {
    const neu = (nachher[feld] ?? '').trim()
    if (neu && neu !== (vorher[feld] ?? '').trim()) diff[feld] = neu
  }
  return diff
}
