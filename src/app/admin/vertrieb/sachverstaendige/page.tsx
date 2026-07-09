// Vertrieb-Konsole: Sachverständige — mountet die bestehende SV-Verwaltung (Live-Ops-Karte
// + Header + Aktionen) unter dem Vertrieb-Dach. Re-Export = identische Funktionen, keine
// Duplikation. Die alte Route /admin/sachverstaendige bleibt erreichbar (Deep-Links,
// @drawer-Intercept dort). Hier ohne @drawer-Slot → Pin-Klick fällt auf die Full-Page
// [id]-Route zurück (deep-link-kompatibel, wie im SV-Layout dokumentiert).
export { default } from '@/app/admin/sachverstaendige/page'
export const dynamic = 'force-dynamic'
