// Vertrieb-Konsole P3: SV-Basic-Freigaben unter dem Dach (Re-Export).
// F2b Route-Konsolidierung (08.08.): re-exportiert jetzt BasicFreigabenContent --
// die Legacy-URL /admin/sachverstaendige/basic-freigaben hat keine page.tsx mehr
// und wird per next.config.ts redirects() (308) hierher geleitet.
export { default } from '@/app/admin/sachverstaendige/basic-freigaben/BasicFreigabenContent'
export const dynamic = 'force-dynamic'
