// AAR-939: Geteilter 2FA-Self-Service-Block (Server-Component). Holt das eigene
// profile + rendert die unveränderten Cards. Session-scoped: zeigt/ändert NUR die
// Faktoren des eingeloggten Users (kein Cross-User-Daten) — daher für jeden
// authentifizierten User datensicher; der Portal-Role-Guard ist rein kosmetisch.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ShieldCheckIcon } from 'lucide-react'
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
import { TotpEnrollCard } from '@/components/auth/TotpEnrollCard'
import VertrauteGeraeteSection from '@/components/shared/VertrauteGeraeteSection'
import { PhoneLoginCard } from '@/components/auth/PhoneLoginCard'

export async function KontoSicherheitPanel() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_telefon, telefon')
    .eq('id', user.id)
    .single()

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon className="w-4 h-4 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">
            Zwei-Faktor-Authentifizierung
          </h2>
        </div>
        <p className="text-xs text-claimondo-ondo">
          Schütze Ihr Konto mit einem zweiten Faktor — SMS-Code oder Authenticator-App. Beides ist
          optional und kann jederzeit geändert oder entfernt werden.
        </p>
        <TwoFaPhoneChange
          aktuelleTwofaTelefon={profile?.twofa_telefon ?? null}
          fallbackTelefon={profile?.telefon ?? null}
        />
        <TotpEnrollCard />
        <VertrauteGeraeteSection />
      </div>
      <PhoneLoginCard aktuellePhone={user.phone || null} />
    </div>
  )
}
