// Zentrale Rechtsform-Optionen fuer Partner-/Profil-Formulare (BUG-91-Liste,
// vorher component-lokal in gutachter/profil ProfilStammdaten).
// Consumers: ProfilStammdaten (SV), makler/registrieren; Werkstatt-Signup folgt.
// '' = Platzhalter "— wählen —" (kein Wert gesetzt).
export const RECHTSFORM_OPTIONEN = [
  '',
  'Einzelunternehmen',
  'Freiberufler',
  'GbR',
  'OHG',
  'KG',
  'GmbH',
  'GmbH & Co. KG',
  'UG (haftungsbeschränkt)',
  'AG',
] as const

export type Rechtsform = (typeof RECHTSFORM_OPTIONEN)[number]

// Server-seitige Whitelist fuer Form-Inputs (leer zaehlt als "nicht gewaehlt" -> Caller prueft Pflicht).
export function istErlaubteRechtsform(v: string): boolean {
  return (RECHTSFORM_OPTIONEN as readonly string[]).includes(v)
}
