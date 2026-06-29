// Zentrale Werkstatt-Portal-Routen. Single Source of Truth, damit Cross-Feature-Consumer
// (z.B. der Outbound-Auftrag-Notify der Finder-Session: route_url -> WERKSTATT_ROUTES.auftraege)
// die Ziel-Route importieren statt hardcoden. Dep-frei -> in jedem Kontext importierbar
// (Server-Action, Client, react-email).
export const WERKSTATT_ROUTES = {
  uebersicht: '/werkstatt',
  vermittlungen: '/werkstatt/vermittlungen',
  /** Outbound: der Werkstatt zur Reparatur zugewiesene Faelle (reparatur_werkstatt_id). */
  auftraege: '/werkstatt/auftraege',
} as const
