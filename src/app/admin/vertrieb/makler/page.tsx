// Vertrieb-Konsole: Makler — mountet die bestehende Makler-Verwaltung (Anlage + Liste)
// unter dem Vertrieb-Dach. Re-Export = identische Funktionen, keine Duplikation.
// Die alte Route /admin/makler bleibt erreichbar.
export { default } from '@/app/admin/makler/page'
export const dynamic = 'force-dynamic'
