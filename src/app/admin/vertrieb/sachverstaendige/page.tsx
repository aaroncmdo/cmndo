// Vertrieb-Konsole: Sachverständige — mountet die bestehende SV-Verwaltung (Live-Ops-Karte
// + Header + Aktionen) unter dem Vertrieb-Dach. Re-Export = identische Funktionen, keine Duplikation.
//
// ⚠ NICHT LÖSCHEN — routing-load-bearing: /admin/vertrieb hat seit der Migration einen
// @drawer-Parallel-Slot (Cockpit-SV-Detail-Intercept `(.)sachverstaendige/[id]`). Fehlt die
// Index-page DIESES Segments, bricht die Parallel-Route-Komposition und /admin/vertrieb rendert
// nicht mehr (E2E-belegt 13.07.: Löschen liess Tests 3+7 fallen, Restore → grün). Der Karten-
// Inhalt selbst lebt im Cockpit-Karte-Toggle (rolle=SV); diese Route bleibt Segment-Anker +
// Full-Page-Fallback fuer die intercepteten Kind-Routen ([id]/anlegen/basic-freigaben).
export { default } from '@/app/admin/sachverstaendige/page'
export const dynamic = 'force-dynamic'
