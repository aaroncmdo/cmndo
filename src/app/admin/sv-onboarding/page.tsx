import { redirect } from 'next/navigation'

// AAR-123: Pfad-Konsolidierung — /admin/sv-onboarding wurde zu
// /admin/sachverstaendige/neu. Dieser Redirect erhält bestehende Bookmarks
// und externe Links.
export default function SvOnboardingLegacyRedirect() {
  redirect('/admin/sachverstaendige/neu')
}
