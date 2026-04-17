// AAR-411: EUR-Formatierung. Arbeitet auf Cents (Integer), um Floating-Point-
// Fehler aus dem Weg zu gehen. Entspricht der DB-Konvention (z. B.
// faelle.honorar_cents, rechnungen.betrag_cents).

function toCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (!Number.isFinite(value)) return null
  return Math.round(value)
}

/**
 * Formatiert Cents als EUR: 443500 → "4.435,00 €".
 * null/undefined/NaN → "".
 */
export function formatEUR(cents: number | null | undefined): string {
  const c = toCents(cents)
  if (c === null) return ''
  return (c / 100).toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

/**
 * Kompakte Variante ohne Nachkommastellen: 443500 → "4.435 €".
 * Für Dashboards/Kacheln, wo die Cents stören.
 */
export function formatEURKompakt(cents: number | null | undefined): string {
  const c = toCents(cents)
  if (c === null) return ''
  return (c / 100).toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  })
}

/**
 * Formatiert EUR aus einem Zahl-als-Euro-Wert (nicht Cents).
 * Für ältere Spalten, die Euro als NUMERIC speichern (z. B. regulierung_betrag).
 */
export function formatEURausEuro(euro: number | null | undefined): string {
  if (euro === null || euro === undefined || !Number.isFinite(euro)) return ''
  return euro.toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}
