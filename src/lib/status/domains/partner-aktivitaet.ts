// Registry-Domain fuer den Partner-Aktivitaets-Feed (Cockpit). Label + Farb-Slot je typ.
// Die 12 Keys spiegeln PARTNER_AKTIVITAET_TYPEN (Paritaet per Test abgesichert).
import type { StatusDef } from '../types'

export const PARTNER_AKTIVITAET_DEFS = {
  anruf:           { label: 'Anruf', slot: 'active' },
  notiz:           { label: 'Notiz', slot: 'neutral' },
  email:           { label: 'E-Mail', slot: 'active' },
  einstufung:      { label: 'Einstufung', slot: 'active' },
  sonstiges:       { label: 'Sonstiges', slot: 'neutral' },
  freigeschaltet:  { label: 'Freigeschaltet', slot: 'success' },
  gesperrt:        { label: 'Gesperrt', slot: 'danger' },
  verifiziert:     { label: 'Verifiziert', slot: 'success' },
  vertrag:         { label: 'Vertrag', slot: 'success' },
  lead_zugewiesen: { label: 'Lead zugewiesen', slot: 'active' },
  provision:       { label: 'Provision', slot: 'success' },
  statuswechsel:   { label: 'Statuswechsel', slot: 'neutral' },
} satisfies Record<string, StatusDef>
