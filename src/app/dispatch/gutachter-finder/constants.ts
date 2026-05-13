// AAR-745h (2026-05-13): Shared Status-Labels für GutachterFinder.
// Vorher in Uebersicht- und Detail-Client dupliziert — jetzt EINE Quelle.
//
// Farben nutzen Claimondo-Tokens für Brand-Status (in_bearbeitung,
// sv_kontaktiert) und Tailwind-Semantik (amber/green/red) für Status mit
// klarer Semantik (neu/bestätigt/storniert).

export type GutachterFinderStatus =
  | 'entwurf'
  | 'neu'
  | 'in_bearbeitung'
  | 'sv_kontaktiert'
  | 'termin_bestaetigt'
  | 'abgeschlossen'
  | 'storniert'

export const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  entwurf: { label: 'Offen — anrufen', color: 'bg-orange-100 text-orange-800' },
  neu: { label: 'Neu', color: 'bg-amber-100 text-amber-800' },
  in_bearbeitung: { label: 'In Bearbeitung', color: 'bg-claimondo-ondo/20 text-claimondo-navy' },
  sv_kontaktiert: { label: 'SV kontaktiert', color: 'bg-claimondo-ondo/10 text-claimondo-ondo' },
  termin_bestaetigt: { label: 'Termin bestätigt', color: 'bg-green-100 text-green-700' },
  abgeschlossen: { label: 'Abgeschlossen', color: 'bg-[#f8f9fb] text-claimondo-ondo' },
  storniert: { label: 'Storniert', color: 'bg-red-50 text-red-500' },
}

export const STATUS_FALLBACK = {
  label: '',
  color: 'bg-[#f8f9fb] text-claimondo-ondo',
}
