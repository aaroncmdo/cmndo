// Vertrieb-Konsole P3: Werkstatt-QR-Pool unter dem Dach (Re-Export) — Aaron „QR-Zuweisung
// auch unter ein Dach". Alle QR-Funktionen kommen mit, keine Duplikation.
// F2b Route-Konsolidierung (08.08.): re-exportiert jetzt QrPoolContent -- die Legacy-URL
// /admin/werkstaetten/qr-pool hat keine page.tsx mehr und wird per next.config.ts
// redirects() (308) hierher geleitet.
export { default } from '@/app/admin/werkstaetten/qr-pool/QrPoolContent'
export const dynamic = 'force-dynamic'
