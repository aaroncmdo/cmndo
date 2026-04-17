// AAR-450: "Termine"-Liste aus Nav entfernt — Termine sind jetzt direkt in den
// Fall-Karten (Child 2) und in der Fallakte via TerminSectionCard (Child 1)
// sichtbar. Alte Bookmarks/Email-Links auf /kunde/termin landen auf dem
// Dashboard. Die Token-Subroute /kunde/termin/[token] bleibt unverändert —
// wird von externen WhatsApp-Magic-Links für SV-Termin-Tracking genutzt.
import { permanentRedirect } from 'next/navigation'

export default function KundeTerminRedirect() {
  permanentRedirect('/kunde')
}
