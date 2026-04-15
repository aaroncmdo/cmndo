import { redirect } from 'next/navigation'

// AAR-123: Pfad-Konsolidierung — /admin/karte wurde zu /admin/sachverstaendige/karte.
// Dieser Redirect erhält bestehende Bookmarks und externe Links.
export default function KarteLegacyRedirect() {
  redirect('/admin/sachverstaendige/karte')
}
