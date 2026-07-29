// Werkstatt-Onboarding-Aktivierungs-Drip — Merge-Var- und Template-Key-Typen.
// Konsumiert von copy-schemas.ts, den 6 Templates (SvVorstellung.tsx etc.) und
// spaeter merge/send (Task 8/11).

export type SvProfil = { name: string; region: string; photoUrl?: string; contact?: string }

export type WerkstattMergeVars = {
  werkstattName: string
  ansprechpartner: string // Nicolas
  tel: string
  portalLink: string
  sv?: SvProfil | null // nur fuer sv_vorstellung aufgeloest
}

export const TEMPLATE_KEYS = ['willkommen', 'nutzen', 'sv_vorstellung', 'kundenstory', 'bonus', 'reaktivierung'] as const
export type TemplateKey = (typeof TEMPLATE_KEYS)[number]
