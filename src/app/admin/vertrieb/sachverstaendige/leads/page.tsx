// Vertrieb-Konsole P3: SV-Leads unter dem Dach (Re-Export).
// F2b Route-Konsolidierung (08.08.): NEUE Route -- SV-Leads hatte bisher KEIN
// vertrieb-Pendant (nur Legacy admin/sachverstaendige/leads + admin/sv-leads).
// Re-exportiert LeadsContent; die Legacy-URL /admin/sachverstaendige/leads wird
// per next.config.ts redirects() (308) hierher geleitet.
export { default } from '@/app/admin/sachverstaendige/leads/LeadsContent'
export const dynamic = 'force-dynamic'
