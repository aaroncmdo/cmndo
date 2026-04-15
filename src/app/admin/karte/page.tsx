import { redirect } from 'next/navigation'

// AAR-123 + AAR-151: /admin/karte ist seit AAR-151 komplett im Sachverständige-
// Hub integriert (ONE VIEW). Die Zwischenroute /admin/sachverstaendige/karte
// wurde in AAR-151 wieder entfernt (die dortige Sub-page.tsx ist gelöscht,
// nur die Client-Components in /karte bleiben als Helpers).
// Legacy-Bookmarks landen deshalb direkt auf dem Hub.
export default function KarteLegacyRedirect() {
  redirect('/admin/sachverstaendige')
}
