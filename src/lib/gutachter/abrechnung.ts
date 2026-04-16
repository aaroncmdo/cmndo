// AAR-293: Helper für SV-Abrechnungs-Berechnung + EUR-Format.
// DB-Schema (verifiziert via information_schema):
// - faelle.gutachten_betrag (numeric) — SV-Honorar (brutto)
// - gutachter_abrechnungen.leadpreis (numeric)
// - gutachter_abrechnungen.preistyp (text) — z. B. 'inklusive_paket' / 'individuell'
// - gutachter_abrechnungen.abgerechnet_am (timestamptz) — wenn gesetzt → ausgezahlt
// - faelle.kanzlei_uebergeben_am (timestamptz)
// - faelle.zahlung_eingegangen_am (timestamptz)

export type SvAbrechnungInput = {
  /** aus faelle.gutachten_betrag */
  honorar?: number | null
  /** aus gutachter_abrechnungen.leadpreis */
  leadpreis?: number | null
  /** aus gutachter_abrechnungen.preistyp */
  preistyp?: string | null
  /** aus gutachter_abrechnungen.abgerechnet_am — wenn gesetzt: an SV überwiesen */
  abgerechnetAm?: string | null
}

/** Netto-Auszahlung = Honorar - Leadpreis (wenn beide vorhanden). */
export function berechneSvNetto(input: SvAbrechnungInput | null): number | null {
  if (!input) return null
  if (typeof input.honorar === 'number' && typeof input.leadpreis === 'number') {
    return input.honorar - input.leadpreis
  }
  return null
}

export function formatEuro(wert: number | null | undefined): string {
  if (wert == null || Number.isNaN(wert)) return '—'
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(wert)
}

/** Tage seit ISO-Timestamp (gerundet, niemals negativ). */
export function tageSeit(von: string | null | undefined, bis: Date = new Date()): number | null {
  if (!von) return null
  const vonDate = new Date(von)
  const diffMs = bis.getTime() - vonDate.getTime()
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
}
