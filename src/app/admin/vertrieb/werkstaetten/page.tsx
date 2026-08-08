// Vertrieb-Konsole: Werkstätten — mountet die bestehende Werkstatt-Verwaltung (Liste)
// unter dem Vertrieb-Dach. Re-Export = identische Funktionen, keine Duplikation.
// F2b Route-Konsolidierung (08.08.): re-exportiert jetzt WsListeContent -- die Legacy-
// Route /admin/werkstaetten hatte schon vorher keine eigene Full-Page mehr (PRE-EXISTING
// Exact-Match-Redirect auf /admin/vertrieb, next.config.ts) und war damit bereits
// shadowed. Detail /[id] + QR-Pool sind ebenfalls kanonisch unter /admin/vertrieb/
// werkstaetten/* (F2/F2b), Legacy-URLs redirecten dorthin.
export { default } from '@/app/admin/werkstaetten/WsListeContent'
export const dynamic = 'force-dynamic'
