// Registry-Domain fuer den Netzwerkpartner-Abo-Status (sv_netzwerk_abonnements.status).
// Spiegelt den DB-CHECK (inaktiv|aktiv|ueberfaellig|gekuendigt|comped) + den
// UI-Pseudo-Wert 'kein_abo' (SV ohne jede Abo-Row). Paritaet per Test abgesichert.
import type { StatusDef } from '../types'

export const NETZWERK_ABO_DEFS = {
  comped:       { label: 'Netzwerkpartner (comped)', short: 'Comped', slot: 'success' },
  aktiv:        { label: 'Netzwerkpartner (Abo)', short: 'Abo', slot: 'active' },
  ueberfaellig: { label: 'Abo überfällig', short: 'Überfällig', slot: 'warning' },
  gekuendigt:   { label: 'Abo gekündigt', short: 'Gekündigt', slot: 'neutral' },
  inaktiv:      { label: 'Abo inaktiv', short: 'Inaktiv', slot: 'neutral' },
  kein_abo:     { label: 'Kein Netzwerk-Abo', short: 'Kein Abo', slot: 'neutral' },
} satisfies Record<string, StatusDef>
