// CMM-32: Zentraler Helper für Anrede-Formatierung in WhatsApp/Email/UI.
// Drei Eingaben: anrede ('herr'|'frau'|'divers'|null), vorname, nachname.
//
// Strategie:
// - 'herr' + nachname → "Sehr geehrter Herr Sprafke"
// - 'frau' + nachname → "Sehr geehrte Frau Sprafke"
// - 'divers' oder anrede=null → "Hallo {vorname}" (locker, persönlich)
// - alles fehlt → "Hallo"
//
// formatGruss() liefert die volle Begrüßung inkl. „Hallo"/„Sehr geehrte/r".
// formatPerson() liefert nur den Namen-Teil („Herr Sprafke" / „Aaron").

export type Anrede = 'herr' | 'frau' | 'divers' | null | undefined

export function formatPerson(
  anrede: Anrede,
  vorname: string | null | undefined,
  nachname: string | null | undefined,
): string {
  const v = vorname?.trim() || ''
  const n = nachname?.trim() || ''
  if (anrede === 'herr' && n) return `Herr ${n}`
  if (anrede === 'frau' && n) return `Frau ${n}`
  if (v) return v
  if (n) return n
  return ''
}

/**
 * Liefert die volle Begrüßung. Bei „herr"/„frau" formell („Sehr geehrter
 * Herr Sprafke"), sonst locker („Hallo Aaron").
 */
export function formatGruss(
  anrede: Anrede,
  vorname: string | null | undefined,
  nachname: string | null | undefined,
): string {
  const v = vorname?.trim() || ''
  const n = nachname?.trim() || ''
  if (anrede === 'herr' && n) return `Sehr geehrter Herr ${n}`
  if (anrede === 'frau' && n) return `Sehr geehrte Frau ${n}`
  if (v) return `Hallo ${v}`
  if (n) return `Hallo ${n}`
  return 'Hallo'
}

/** Kurzform für UI-Listen ("Herr Sprafke" / "Aaron Sprafke"). */
export function formatNameKurz(
  anrede: Anrede,
  vorname: string | null | undefined,
  nachname: string | null | undefined,
): string {
  const v = vorname?.trim() || ''
  const n = nachname?.trim() || ''
  if (anrede === 'herr' && n) return `Herr ${n}`
  if (anrede === 'frau' && n) return `Frau ${n}`
  return [v, n].filter(Boolean).join(' ') || ''
}

export const ANREDE_OPTIONS: { value: 'herr' | 'frau' | 'divers'; label: string }[] = [
  { value: 'herr', label: 'Herr' },
  { value: 'frau', label: 'Frau' },
  { value: 'divers', label: 'Divers' },
]
