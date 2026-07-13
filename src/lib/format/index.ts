// AAR-411: Zentraler Einstiegspunkt der Formatter-Bibliothek.
// Verwendung: `import { formatDatum, formatEUR } from '@/lib/format'`
//
// Zustaendigkeit (Redundanz-Programm 2026-07-13): DIESE Lib ist die kanonische
// Quelle fuer INTERNE Portale (Admin/Dispatch/SV/Werkstatt/Kanzlei) — Betraege
// in Cent (formatEUR) + de-DE-Formatierung OHNE Locale-Parameter. Fuer
// KUNDEN-gerichtete, mehrsprachige Oberflaechen (Kunde-Portal, Magic-Links,
// kundengerichtete Emails) ist `@/lib/i18n/format` (Euro + Locale-Parameter)
// zustaendig — NICHT diese Lib. Adoption-Regel: internes Portal -> hier;
// kundensichtbar/i18n -> i18n/format.

export * from './datum'
export * from './currency'
export * from './telefon'
export * from './kennzeichen'
export * from './zeit'
export * from './anrede'
