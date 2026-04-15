// AAR-186 + AAR-190: Dead-Code-Cleanup.
//
// Historisch enthielt diese Datei drei SV-Anlage-Wege (createSachverstaendiger,
// NeuSvForm, onboardGutachter + OnboardingData + PAKET_CONFIG). Alle drei
// waren obsolet:
//   - NeuSvForm + createSachverstaendiger wurde durch den AnlegenTabs-Wizard
//     (NeuSvDrawer) ersetzt und nirgends mehr importiert (AAR-186).
//   - onboardGutachter + die OnboardingClient-Route in
//     /admin/sachverstaendige/onboarding wurden durch die neuen Wizards in
//     /admin/sachverstaendige/anlegen/* ersetzt (AAR-190).
//
// Aktive SV-Anlage-Pfade jetzt:
//   - /admin/sachverstaendige/anlegen/page.tsx → AnlegenTabs (Solo / Büro /
//     Akademie / Sub-SV Wizards)
//   - anlegen/actions.ts enthält die Backend-Actions (anlegeSv, anlegeBuero,
//     anlegeAkademie, anlegeSubSv, listBueroOrganisationen)
//   - /gutachter/willkommen → Vertrag + Stripe-Checkout
//   - Stripe-Webhook setzt portal_zugang_freigeschaltet=true nach Zahlung
//
// Dieses File ist jetzt absichtlich fast leer — als Marker damit niemand
// versehentlich neue Server-Actions hier einbaut. Weitere SV-Actions gehören
// in anlegen/actions.ts, [id]/actions.ts oder karte/actions.ts.
