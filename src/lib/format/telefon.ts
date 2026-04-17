// AAR-411: Telefonnummern-Formatierung für Deutschland.
//
// Normalisiert den Rohwert aus DB/CSV auf E.164 (+49…) und formatiert
// lesbar. Nimmt folgende Varianten:
//   "+491751234567"  → "+49 175 1234567"
//   "01751234567"    → "+49 175 1234567"
//   "0175/1234-567"  → "+49 175 1234567"
//   "1751234567"     → "+49 175 1234567"

/** Reduziert auf Ziffern + führenden Plus. */
function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Nur Ziffern + evtl. führenden Plus behalten
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`
  if (digits.startsWith('0')) return `+49${digits.slice(1)}`
  // Assume German without leading 0
  return `+49${digits}`
}

/**
 * Formatiert eine Telefonnummer für die Anzeige:
 *   "+491751234567" → "+49 175 1234567"
 * Gibt bei null/leerer Eingabe "" zurück.
 */
export function formatTelefon(raw: string | null | undefined): string {
  const e164 = toE164(raw)
  if (!e164) return ''
  // Deutsches Muster: +49 (3 Ziffern Vorwahl/Mobile-Präfix) (Rest)
  // Bewusst einfach gehalten — deutsche Mobile-Präfixe sind 3-stellig, und
  // für Landline ist "+49 XXX XXXXXXX" immer noch lesbar.
  const m = e164.match(/^\+49(\d{3})(\d+)$/)
  if (m) return `+49 ${m[1]} ${m[2]}`
  // Andere Länder: grob gruppieren +XX XXX XXXXXXX
  const other = e164.match(/^\+(\d{1,3})(\d{3})(\d+)$/)
  if (other) return `+${other[1]} ${other[2]} ${other[3]}`
  return e164
}

/**
 * Liefert den tel:-Link oder null. Nutzt E.164 (international), damit
 * Handys immer die richtige Vorwahl wählen.
 */
export function telefonHref(raw: string | null | undefined): string | null {
  const e164 = toE164(raw)
  if (!e164) return null
  return `tel:${e164}`
}
