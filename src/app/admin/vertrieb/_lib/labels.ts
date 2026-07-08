// src/app/admin/vertrieb/_lib/labels.ts
// Geteilte UI-Labels für den Roster + das Detail (DRY). Umlaute echt.
import type { VertriebKind } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

export const KIND_LABEL: Record<VertriebKind, string> = {
  sv: 'Sachverständige',
  makler: 'Makler',
  werkstatt: 'Werkstatt',
  'partner-lead': 'Partner-Lead',
  'sv-lead': 'SV-Lead',
}

/** Was ist bei dieser Stufe der nächste Schritt? (workflow-getriebener Hinweis fürs Detail) */
export const STUFE_HINT: Record<VertriebStufe, string> = {
  neu: 'Neuer Kontakt — Erstansprache & Qualifizierung.',
  kontaktiert: 'Kontaktiert — jetzt Onboarding anstoßen.',
  onboarding: 'Im Onboarding — offene Schritte abschließen (Vertrag / Verifizierung / Freischaltung).',
  aktiv: 'Aktiver Partner — läuft.',
  pausiert: 'Pausiert / inaktiv — reaktivieren oder Grund klären.',
  gesperrt: 'Gesperrt — Grund prüfen, ggf. entsperren.',
  verloren: 'Verloren / kalt — keine Aktion nötig.',
}
