import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TwoFaClient from './TwoFaClient'

// KFZ-184: 2FA SMS-Code Eingabe nach Email+Passwort Login.

export default async function TwoFaPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null

  // Kein User = kein Login = zurueck zum Login
  if (!user) redirect('/login')

  // Wenn Google-Login: 2FA ueberspringen
  if (user.app_metadata?.provider === 'google') redirect('/')

  // Profile laden fuer Telefon-Anzeige
  const { data: profile } = await supabase
    .from('profiles')
    .select('twofa_telefon, telefon, twofa_aktiviert')
    .eq('id', user.id)
    .single()

  // 2FA nicht aktiviert: direkt durch
  if (profile?.twofa_aktiviert === false) redirect('/')

  const telefon = profile?.twofa_telefon ?? profile?.telefon
  const maskedPhone = telefon
    ? telefon.slice(0, 4) + '****' + telefon.slice(-3)
    : null

  return <TwoFaClient maskedPhone={maskedPhone} />
}
