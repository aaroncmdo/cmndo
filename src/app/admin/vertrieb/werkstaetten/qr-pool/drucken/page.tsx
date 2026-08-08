// Vertrieb-Konsole P3: QR-Pool-Druckansicht unter dem Dach (Re-Export).
// F2b Route-Konsolidierung (08.08.): re-exportiert jetzt QrPoolDruckenContent -- die
// Legacy-URL /admin/werkstaetten/qr-pool/drucken hat keine page.tsx mehr und wird per
// next.config.ts redirects() (308) hierher geleitet.
export { default } from '@/app/admin/werkstaetten/qr-pool/drucken/QrPoolDruckenContent'
export const dynamic = 'force-dynamic'
