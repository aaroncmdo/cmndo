// src/app/admin/vertrieb/_lib/labels.ts
// Geteilte UI-Labels für den Roster + das Detail (DRY). Umlaute echt.
import type { VertriebKind, VertriebRolle, VertriebTyp } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

export const KIND_LABEL: Record<VertriebKind, string> = {
  sv: 'Sachverständige',
  makler: 'Makler',
  werkstatt: 'Werkstatt',
  'partner-lead': 'Partner-Lead',
  'firmen-flotte': 'Firmen-Flotte',
}

/** P2 Switch-Modell: Rolle- und Typ-Labels. */
export const ROLLE_LABEL: Record<VertriebRolle, string> = {
  sv: 'Sachverständige',
  makler: 'Makler',
  werkstatt: 'Werkstätten',
  'firmen-flotte': 'Firmen-Flotten',
}

export const TYP_LABEL: Record<VertriebTyp, string> = {
  lead: 'Lead',
  partner: 'Partner',
}

/** P4: rollen-spezifisches Detail — was in der Voll-Akte je Rolle verwaltet wird.
 *  Macht das Detail-Cockpit rollen-gerecht (Makler gleichrangig zu SV/Werkstatt). */
export const ROLLE_VERWALTUNG_HINT: Record<VertriebRolle, string> = {
  sv: 'Verifizierung (DAT/BVSK/ÖbUV), Portal-Freischaltung, Vertrag & Qualifikation.',
  makler: 'Gesellschaft/Versicherung, Maklerpool, Provisionsmodell (komplett/nur Gutachter).',
  werkstatt: 'QR-Codes, Fähigkeiten & Ausstattung, Vermittlungs-Konditionen.',
  'firmen-flotte': 'Flottenmanager-Konten, Fahrzeuge, Claimondo-Karten, Schadenverlauf.',
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
