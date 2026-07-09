// Vertrieb-Konsole: Partner-Leads — mountet das bestehende Prospect-CRM (Lane e8aa73d4)
// unter dem Vertrieb-Dach. Re-Export = ALLE Funktionen (Scraping/CSV/Einstufung/Aktivitäts-
// Log/Convert/Onboarding-Termine), keine Duplikation; folgt automatisch künftigen Änderungen
// am CRM. Die alte Route /admin/partner-leads bleibt erreichbar.
export { default } from '@/app/admin/partner-leads/page'
export const dynamic = 'force-dynamic'
