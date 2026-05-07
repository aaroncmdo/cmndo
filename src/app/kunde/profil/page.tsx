import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BellIcon } from 'lucide-react'
// AAR-344: 2FA-Nummer-Änderung (Self-Service)
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'
// AAR-703: Edit-Form für Kontakt-Daten (Telefon + zweit_email)
import KundeProfilForm from './KundeProfilForm'
import PageHeader from '@/components/shared/PageHeader'

export default async function ProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    // AAR-344: twofa_telefon, AAR-703: zweit_email mitladen
    .select('vorname, nachname, email, telefon, twofa_telefon, zweit_email')
    .eq('id', user.id)
    .single()

  const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') : user.email ?? ''

  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto space-y-5">
      <PageHeader title="Mein Profil" size="lg" />
      <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-5 space-y-3">
        <div><span className="text-sm text-claimondo-ondo">Name</span><p className="text-claimondo-navy font-medium">{name || '—'}</p></div>
        <div><span className="text-sm text-claimondo-ondo">E-Mail (Login)</span><p className="text-claimondo-navy">{profile?.email ?? user.email ?? '—'}</p></div>
      </div>

      {/* AAR-703: Telefon + zweit_email editierbar */}
      <KundeProfilForm
        initialTelefon={profile?.telefon ?? null}
        initialZweitEmail={profile?.zweit_email ?? null}
      />

      {/* AAR-344: 2FA-Nummer-Änderungs-Flow */}
      <TwoFaPhoneChange
        aktuelleTwofaTelefon={profile?.twofa_telefon ?? null}
        fallbackTelefon={profile?.telefon ?? null}
      />

      {/* AAR-500 N5: Einstieg in Einstellungen (Benachrichtigungs-Präferenzen) */}
      <Link
        href="/kunde/einstellungen"
        className="flex items-center justify-between gap-3 bg-white rounded-xl border border-claimondo-border shadow-sm p-4 hover:border-claimondo-ondo"
      >
        <span className="flex items-center gap-3">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-claimondo-bg text-claimondo-ondo border border-[#e4e7ef] flex items-center justify-center">
            <BellIcon width={16} height={16} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-claimondo-navy">Benachrichtigungen</span>
            <span className="block text-xs text-claimondo-ondo">Ruhezeiten · Kanäle · Feintuning</span>
          </span>
        </span>
        <span className="text-xs text-claimondo-ondo">Öffnen →</span>
      </Link>
    </div>
  )
}
