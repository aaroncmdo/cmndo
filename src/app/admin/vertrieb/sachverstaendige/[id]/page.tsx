// Vertrieb-Konsole P3: SV-Detail-Akte unter dem Dach (Re-Export). Ziel des Deep-Links
// „Vollständige Akte öffnen" aus dem Vertrieb-Detail → bleibt in der Konsole.
// F2 Route-Konsolidierung (08.08.): diese Route ist jetzt die kanonische SV-Akte —
// die Legacy-URL /admin/sachverstaendige/[id] existiert nicht mehr als page.tsx und
// wird stattdessen per next.config.ts redirects() (308, UUID-Regex) hierher geleitet.
export { default } from '@/app/admin/sachverstaendige/[id]/SvAkteContent'
export const dynamic = 'force-dynamic'
