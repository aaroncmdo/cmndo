// Sub-Projekt 4 (Kunde-Portal 1+): Settings konsolidiert nach /kunde/profil.
// Benachrichtigungen + Datenschutz leben jetzt gemeinsam mit dem Profil auf EINER
// erreichbaren Flaeche. Diese Route bleibt als Redirect fuer Legacy-Bookmarks +
// revalidatePath-Kompat bestehen.

import { redirect } from 'next/navigation'

export default function KundeEinstellungenPage() {
  redirect('/kunde/profil')
}
