import { redirect } from 'next/navigation'

// AAR-370 / AAR-722: /gutachter/nachrichten ist in /gutachter/posteingang
// konsolidiert. Diese Route bleibt nur noch als Legacy-Redirect für
// Bookmarks und Deep-Links bestehen. Query-Param entfernt (Tabs gibt's
// seit AAR-722 nicht mehr — nur noch der Chat-View).
export default function NachrichtenRedirectPage() {
  redirect('/gutachter/posteingang')
}
