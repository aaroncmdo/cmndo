import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BellIcon } from 'lucide-react'
// AAR-344: 2FA-Nummer-Änderung (Self-Service)
import { TwoFaPhoneChange } from '@/components/auth/TwoFaPhoneChange'

export default async function ProfilPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    // AAR-344: twofa_telefon mitladen
    .select('vorname, nachname, email, telefon, twofa_telefon')
    .eq('id', user.id)
    .single()

  const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') : user.email ?? ''

  return (
    <div className="w-full px-4 py-6 max-w-xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-[#0D1B3E]">Mein Profil</h1>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-3">
        <div><span className="text-sm text-gray-500">Name</span><p className="text-[#0D1B3E] font-medium">{name || '—'}</p></div>
        <div><span className="text-sm text-gray-500">E-Mail</span><p className="text-[#0D1B3E]">{profile?.email ?? user.email ?? '—'}</p></div>
        {profile?.telefon && <div><span className="text-sm text-gray-500">Telefon</span><p className="text-[#0D1B3E]">{profile.telefon}</p></div>}
      </div>

      {/* AAR-344: 2FA-Nummer-Änderungs-Flow */}
      <TwoFaPhoneChange
        aktuelleTwofaTelefon={profile?.twofa_telefon ?? null}
        fallbackTelefon={profile?.telefon ?? null}
      />

      {/* AAR-500 N5: Einstieg in Einstellungen (Benachrichtigungs-Präferenzen) */}
      <Link
        href="/kunde/einstellungen"
        className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-[#4573A2]"
      >
        <span className="flex items-center gap-3">
          <span className="shrink-0 w-9 h-9 rounded-xl bg-[#f8f9fb] text-[#4573A2] border border-[#e4e7ef] flex items-center justify-center">
            <BellIcon width={16} height={16} />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[#0D1B3E]">Benachrichtigungen</span>
            <span className="block text-xs text-[#4573A2]">Ruhezeiten · Kanäle · Feintuning</span>
          </span>
        </span>
        <span className="text-xs text-[#4573A2]">Öffnen →</span>
      </Link>
    </div>
  )
}
