import { redirect } from 'next/navigation'

// AAR-370: /gutachter/termine wird in /gutachter/kalender (Listen-Toggle)
// integriert. Die Top-Level-Route bleibt als Legacy-Redirect bestehen.
// Sub-Routen /termine/[id]/* (Detail, Navigation, Vor-Ort) bleiben unverändert.
export default function TermineRedirectPage() {
  redirect('/gutachter/kalender?view=liste')
}
