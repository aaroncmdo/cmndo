// Ops-Test 11.08. (#13): „datum im amerikanischen zeitformat, sll ins deutsche".
//
// URSACHE (lokalisiert 13.08.): NICHT der Feststellungs-Flow — dessen Datumsfelder stehen
// auf `typ='text'` und rendern als Textfeld. Der Befund kommt von nativen
// `<input type="date">`, deren ANZEIGEFORMAT dem Browser-/OS-Locale folgt. Ein deutscher
// Nutzer mit englischem System sieht MM/DD/YYYY. Das laesst sich nicht per HTML/CSS
// erzwingen: Chrome ignoriert `lang`, nur Firefox respektiert es. Derselbe Grund, aus dem
// der WunschterminPicker (AAR-956) das native Feld ersetzt hat.
//
// WARUM TEXT STATT KALENDER: Ein Unfalldatum liegt in der VERGANGENHEIT und ist bekannt —
// der Nutzer tippt es schneller, als er im Kalender zurueckblaettert. Ein Picker ist bei
// Termin-WAHL richtig (Zukunft, WunschterminPicker), bei Erinnerung falsch.
//
// Der gespeicherte Wert bleibt ISO (YYYY-MM-DD) — identisch zum nativen Feld, also
// kompatibel zu allen bestehenden Schreibpfaden.

/**
 * Tippen soll sich fluessig anfuehlen: aus "15032026" wird waehrend der Eingabe "15.03.2026".
 *
 * ⚠ Regel-4-Prod-Smoke 13.08. — hier steckte ein SCHLIMMERER Bug als der, den dieses
 * Modul beheben sollte: die erste Fassung strippte ALLE Nicht-Ziffern und gruppierte
 * stur 2-2-4. Wer "3.4.2026" tippte — fuer einen deutschen Nutzer die natuerlichste
 * Schreibweise — bekam "34.20.26", und `deZuIso` verwarf das als ungueltig. Das Datum
 * ging damit STILL verloren: kein Fehler, kein Hinweis, nur ein leeres Feld im Lead.
 *
 * Deshalb gilt jetzt: **hat der Nutzer selbst Trennzeichen gesetzt, bestimmt ER die
 * Gruppen.** "3.4.2026" ist der 3. April, nicht Tag 34 in Monat 20. Nur die reine
 * Ziffernfolge wird noch automatisch gruppiert. Gepaddet wird bewusst NICHT waehrend
 * des Tippens (aus "3." wuerde sonst "03." und der Cursor spraenge) — noetig ist das
 * auch nicht, denn `deZuIso` akzeptiert ein- wie zweistellige Tage und Monate.
 */
export function formatiereDatumEingabe(roh: string): string {
  if (/[.,/\-\s]/.test(roh)) {
    const gruppen = roh.split(/[.,/\-\s]+/)
    const tt = (gruppen[0] ?? '').replace(/\D/g, '').slice(0, 2)
    const mm = (gruppen[1] ?? '').replace(/\D/g, '').slice(0, 2)
    const jjjj = (gruppen[2] ?? '').replace(/\D/g, '').slice(0, 4)
    if (gruppen.length <= 1) return tt
    if (gruppen.length === 2) return `${tt}.${mm}`
    // Alles ab der 4. Gruppe faellt weg — ein Datum hat drei Teile.
    return `${tt}.${mm}.${jjjj}`
  }
  const ziffern = roh.replace(/\D/g, '').slice(0, 8)
  if (ziffern.length <= 2) return ziffern
  if (ziffern.length <= 4) return `${ziffern.slice(0, 2)}.${ziffern.slice(2)}`
  return `${ziffern.slice(0, 2)}.${ziffern.slice(2, 4)}.${ziffern.slice(4)}`
}

/** Schaltjahr-korrekte Existenzpruefung — der 31.02. ist kein Datum, auch wenn er sich tippen laesst. */
function istEchterTag(tag: number, monat: number, jahr: number): boolean {
  if (monat < 1 || monat > 12 || tag < 1) return false
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate()
  return tag <= tageImMonat
}

/**
 * "15.03.2026" → "2026-03-15". Liefert null, wenn die Eingabe (noch) kein gueltiges
 * Datum ist — der Aufrufer speichert dann nichts, statt Muell zu schreiben.
 */
export function deZuIso(de: string): string | null {
  const m = de.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const tag = Number(m[1])
  const monat = Number(m[2])
  const jahr = Number(m[3])
  if (!istEchterTag(tag, monat, jahr)) return null
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${jahr}-${p2(monat)}-${p2(tag)}`
}

/** "2026-03-15" → "15.03.2026". Unbrauchbare Eingabe ergibt einen leeren String. */
export function isoZuDe(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return ''
  return `${m[3]}.${m[2]}.${m[1]}`
}

/**
 * Steht im Feld eine ANGEFANGENE, aber noch unvollstaendige Datumseingabe ("15.03.")?
 *
 * Der Unterschied ist nur fuer Felder wichtig, die **automatisch bei Blur speichern**:
 * dort bedeutet ein leerer ISO-Wert zweierlei — der Nutzer hat das Feld GELEERT (dann
 * soll wirklich geloescht werden) oder er ist mitten im Tippen (dann darf der
 * gespeicherte Wert NICHT verschwinden). Ohne diese Unterscheidung nimmt ein Klick
 * neben das Feld das Datum weg, waehrend der Nutzer seinen Text noch davor stehen
 * sieht — dieselbe Klasse stillen Datenverlusts, die schon `formatiereDatumEingabe`
 * einmal produziert hat (Regel-4-Smoke 13.08., „3.4.2026").
 */
export function istUnvollstaendigeEingabe(anzeige: string): boolean {
  const t = anzeige.trim()
  return t !== '' && deZuIso(t) === null
}
