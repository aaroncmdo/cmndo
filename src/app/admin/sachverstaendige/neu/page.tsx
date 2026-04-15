import { redirect } from 'next/navigation'

// AAR-151: /admin/sachverstaendige/neu redirectet jetzt auf den Anlegen-
// Wizard. Die alte Onboarding-Status-Tabelle (ehemals /admin/sv-onboarding)
// ist nicht mehr Bestandteil der Navigation — der Status wird inline in der
// Karten-Sidebar (Badges für portal_zugang + vertrag) angezeigt.
// Legacy-Bookmarks auf /admin/sv-onboarding und /admin/sachverstaendige/neu
// landen via dieser Redirect-Kaskade direkt im Anlege-Wizard.
export default function SvNeuLegacyRedirect() {
  redirect('/admin/sachverstaendige/anlegen')
}
