// A (AAR-audit-trusted-devices): Einstellungen-Sektion „Vertraute Geräte".
// Server-Komponente: laedt die Geraete des eingeloggten Users (ownership-sicher
// via getMyTrustedDevices) und rendert die Client-Liste mit Einzel-Widerruf.
// In beliebige Einstellungen-Seite einbettbar: `<VertrauteGeraeteSection />`.

import { ShieldCheckIcon } from 'lucide-react'
import { getMyTrustedDevices } from '@/lib/auth/twofa/remember-me'
import TrustedDeviceList from './TrustedDeviceList'

export default async function VertrauteGeraeteSection() {
  const devices = await getMyTrustedDevices()

  return (
    <div className="rounded-ios-xl border border-claimondo-border bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheckIcon className="w-4 h-4 text-claimondo-ondo" />
        <h3 className="text-sm font-semibold text-claimondo-navy">Vertraute Geräte</h3>
      </div>
      <p className="text-xs text-claimondo-ondo/70 mb-3">
        Geräte, auf denen die Zwei-Faktor-Abfrage übersprungen wird. Verlorenes oder fremdes
        Gerät? Hier einzeln widerrufen.
      </p>
      <TrustedDeviceList devices={devices} />
    </div>
  )
}
