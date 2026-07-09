// Vertrieb-Konsole: Werkstätten — mountet die bestehende Werkstatt-Verwaltung (Liste)
// unter dem Vertrieb-Dach. Re-Export = identische Funktionen, keine Duplikation.
// Detail /[id] + QR-Pool bleiben unter /admin/werkstaetten (via Zeilen-Links erreichbar);
// die alte Liste-Route bleibt ebenfalls erreichbar.
export { default } from '@/app/admin/werkstaetten/page'
export const dynamic = 'force-dynamic'
