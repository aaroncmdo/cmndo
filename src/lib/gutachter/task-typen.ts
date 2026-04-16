// AAR-291: Task-Typ-Mapping für SV-Portal — verbindet `tasks.task_typ` mit
// UI-Label, CTA und Scroll-/Navigations-Ziel.

export const SV_TASK_TYPEN = {
  'termin-bestaetigen': {
    label: 'Termin bestätigen',
    cta: 'Zum Termin',
    scrollTo: 'termin-aktionen',
    gMapping: 'G-01',
  },
  'termin-gegenvorschlag': {
    label: 'Gegenvorschlag senden',
    cta: 'Anderen Termin vorschlagen',
    scrollTo: 'termin-aktionen',
    gMapping: 'G-01',
  },
  'zb1-upload': {
    label: 'ZB1 hochladen',
    cta: 'Foto machen',
    scrollTo: 'zb1-upload',
    gMapping: null,
  },
  'besichtigung-durchfuehren': {
    label: 'Besichtigung durchführen',
    cta: 'Zum Vor-Ort-Panel',
    scrollTo: 'vor-ort-panel',
    gMapping: 'G-05',
  },
  'dokumente-einsammeln': {
    label: 'Fehlende Dokumente einsammeln',
    cta: 'Dokumente-Checkliste',
    scrollTo: 'dokumente-card',
    gMapping: 'G-06',
  },
  'gutachten-hochladen': {
    label: 'Gutachten hochladen',
    cta: 'Gutachten-Upload',
    scrollTo: 'gutachten-upload',
    gMapping: 'G-07',
  },
  'technische-stellungnahme': {
    label: 'Technische Stellungnahme erstellen',
    cta: 'Zur Stellungnahme',
    navigateTo: '/gutachter/stellungnahme/{fallId}',
    gMapping: null,
  },
  nachbesichtigung: {
    label: 'Nachbesichtigung durchführen',
    cta: 'Nachbesichtigungs-Panel',
    scrollTo: 'nachbesichtigung-card',
    gMapping: null,
  },
  'reklamation-bearbeiten': {
    label: 'Reklamation bearbeiten',
    cta: 'Details ansehen',
    scrollTo: 'reklamation-card',
    gMapping: null,
  },
} as const

export type SvTaskTyp = keyof typeof SV_TASK_TYPEN
export type SvTaskTypDef = (typeof SV_TASK_TYPEN)[SvTaskTyp]
