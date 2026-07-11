// F0: Reklamationen-Tab — embedded (kein eigener Header; der Hub-Header liefert Titel + Badge),
// geteilter Content.
import ReklamationenContent from '@/app/admin/reklamationen/ReklamationenContent'

export default function FaelleHubReklamationenPage() {
  return <ReklamationenContent embedded />
}
