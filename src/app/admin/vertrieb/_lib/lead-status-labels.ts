// Vertrieb-CRM P2: Display-Optionen fuer partner_leads.status + einstufung im Lead-Cockpit.
// Spiegelt die validierten Werte aus partner-leads/actions.ts (STATUS_WERTE/EINSTUFUNG_WERTE);
// dort bleibt die Validierungs-Autoritaet. actions.ts ist 'use server' (kann keine Konstanten
// exportieren, AAR-664) und haelt seine STATUS_LABEL bewusst selbst-enthalten — dieses Display-
// Pendant folgt demselben Muster (stabile Domain-Config).
export const LEAD_STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: 'neu', label: 'Neu' },
  { key: 'kontaktiert', label: 'Kontaktiert' },
  { key: 'qualifiziert', label: 'Qualifiziert' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'aktiv', label: 'Aktiv' },
  { key: 'abgelehnt', label: 'Abgelehnt' },
  { key: 'kein_interesse', label: 'Kein Interesse' },
]

export const LEAD_EINSTUFUNG_OPTIONS: { key: string; label: string }[] = [
  { key: 'heiss', label: 'Heiß' },
  { key: 'warm', label: 'Warm' },
  { key: 'kalt', label: 'Kalt' },
]
