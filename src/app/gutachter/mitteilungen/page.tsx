import { redirect } from 'next/navigation'

// AAR-370: /gutachter/mitteilungen ist in /gutachter/posteingang?tab=mitteilungen
// konsolidiert. Diese Route bleibt nur noch als Legacy-Redirect für
// Bookmarks und Deep-Links bestehen.
export default function MitteilungenRedirectPage() {
  redirect('/gutachter/posteingang?tab=mitteilungen')
}
