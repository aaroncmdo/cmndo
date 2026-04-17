import { redirect } from 'next/navigation'

// AAR-370: /gutachter/nachrichten ist in /gutachter/posteingang?tab=nachrichten
// konsolidiert. Diese Route bleibt nur noch als Legacy-Redirect für
// Bookmarks und Deep-Links bestehen.
export default function NachrichtenRedirectPage() {
  redirect('/gutachter/posteingang?tab=nachrichten')
}
