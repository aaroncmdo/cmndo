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

/** Tippen soll sich fluessig anfuehlen: aus "15032026" wird waehrend der Eingabe "15.03.2026". */
export function formatiereDatumEingabe(roh: string): string {
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
