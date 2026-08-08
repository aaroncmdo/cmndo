// Vertrieb-Konsole: Sachverständige — mountet die bestehende SV-Verwaltung (Live-Ops-Karte
// + Header + Aktionen) unter dem Vertrieb-Dach. Re-Export = identische Funktionen, keine
// Duplikation. F2b Route-Konsolidierung (08.08.): re-exportiert jetzt SvListeContent --
// die Legacy-Route /admin/sachverstaendige hatte schon vorher keine eigene Full-Page mehr
// (PRE-EXISTING Exact-Match-Redirect auf /admin/vertrieb, next.config.ts) und war damit
// bereits shadowed. Hier ohne @drawer-Slot → Pin-Klick fällt auf die Full-Page [id]-Route
// zurück (deep-link-kompatibel, wie im SV-Layout dokumentiert).
export { default } from '@/app/admin/sachverstaendige/SvListeContent'
export const dynamic = 'force-dynamic'
