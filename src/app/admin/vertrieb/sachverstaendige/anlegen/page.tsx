// Vertrieb-Konsole P3: SV anlegen unter dem Dach (Re-Export).
// F2b Route-Konsolidierung (08.08.): re-exportiert jetzt AnlegenContent -- die
// Legacy-URL /admin/sachverstaendige/anlegen hat keine page.tsx mehr und wird
// per next.config.ts redirects() (308) hierher geleitet.
export { default } from '@/app/admin/sachverstaendige/anlegen/AnlegenContent'
export const dynamic = 'force-dynamic'
