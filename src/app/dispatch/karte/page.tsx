// AAR-112: Dispatch-Portal Karte (Read-Only)
// Spiegelt das Verhalten von /admin/karte: Redirect auf die Sachverständige-Liste.
// Die eigentliche Isochrone/Karten-Logik lebt in /dispatch/isochrone (mit Lead-Auswahl).
import { redirect } from 'next/navigation'

export default function DispatchKartePage() {
  redirect('/dispatch/sachverstaendige')
}
