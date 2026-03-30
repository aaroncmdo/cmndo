'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  MailIcon,
  SmartphoneIcon,
  CheckCircleIcon,
  ArrowLeftIcon,
} from 'lucide-react'

type Profile = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  authProvider: string
  hasGoogle: boolean
  hasPhone: boolean
}

export default function KundeProfilClient({ profile }: { profile: Profile }) {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneStep, setPhoneStep] = useState<'idle' | 'enter' | 'verify'>('idle')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleConnectGoogle() {
    const supabase = createClient()
    await supabase.auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/kunde/profil` },
    })
  }

  async function handleSendPhoneCode() {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.updateUser({ phone })
      if (err) throw err
      setPhoneStep('verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SMS konnte nicht gesendet werden')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyPhone() {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'phone_change',
      })
      if (err) throw err
      await supabase.from('profiles').update({ telefon: phone }).eq('id', (await supabase.auth.getUser()).data.user!.id)
      setPhoneStep('idle')
      setMsg('Telefonnummer verbunden')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Code ungueltig')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-4 py-8">
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/kunde" className="text-gray-500 hover:text-gray-700 transition-colors">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Mein Profil</h1>
            <p className="text-gray-500 text-sm">Konto und Anmeldemethoden</p>
          </div>
        </div>

        {msg && (
          <div className="bg-green-50 border border-green-800 rounded-xl p-4 text-green-300 text-sm">
            {msg}
          </div>
        )}

        {/* Personal data */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Persoenliche Daten</h2>
          <div className="space-y-3">
            <div>
              <label className="text-gray-500 text-xs">Name</label>
              <p className="text-gray-900 text-sm">{profile.vorname} {profile.nachname}</p>
            </div>
            <div>
              <label className="text-gray-500 text-xs">E-Mail</label>
              <p className="text-gray-900 text-sm">{profile.email}</p>
            </div>
            {profile.telefon && (
              <div>
                <label className="text-gray-500 text-xs">Telefon</label>
                <p className="text-gray-900 text-sm">{profile.telefon}</p>
              </div>
            )}
          </div>
        </div>

        {/* Auth methods */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Anmeldemethoden</h2>
          <div className="space-y-3">
            {/* Email */}
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-100/50">
              <div className="flex items-center gap-3">
                <MailIcon className="w-5 h-5 text-gray-500" />
                <div>
                  <p className="text-gray-900 text-sm font-medium">E-Mail + Passwort</p>
                  <p className="text-gray-500 text-xs">{profile.email}</p>
                </div>
              </div>
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
            </div>

            {/* Google */}
            <div className="flex items-center justify-between py-3 px-4 rounded-xl bg-gray-100/50">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                <div>
                  <p className="text-gray-900 text-sm font-medium">Google</p>
                  <p className="text-gray-500 text-xs">{profile.hasGoogle ? 'Verbunden' : 'Nicht verbunden'}</p>
                </div>
              </div>
              {profile.hasGoogle ? (
                <CheckCircleIcon className="w-5 h-5 text-green-500" />
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-gray-900 text-xs font-medium rounded-lg transition-colors"
                >
                  Verbinden
                </button>
              )}
            </div>

            {/* Phone */}
            <div className="py-3 px-4 rounded-xl bg-gray-100/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SmartphoneIcon className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="text-gray-900 text-sm font-medium">Telefon (SMS)</p>
                    <p className="text-gray-500 text-xs">
                      {profile.hasPhone ? 'Verbunden' : 'Nicht verbunden'}
                    </p>
                  </div>
                </div>
                {profile.hasPhone ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                ) : phoneStep === 'idle' ? (
                  <button
                    onClick={() => setPhoneStep('enter')}
                    className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-gray-900 text-xs font-medium rounded-lg transition-colors"
                  >
                    Verbinden
                  </button>
                ) : null}
              </div>

              {/* Phone connect flow */}
              {phoneStep === 'enter' && (
                <div className="mt-3 space-y-2">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+49 170 1234567"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-600"
                  />
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPhoneStep('idle'); setError(null) }}
                      className="flex-1 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleSendPhoneCode}
                      disabled={loading || !phone}
                      className="flex-1 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
                    >
                      {loading ? 'Sende...' : 'Code senden'}
                    </button>
                  </div>
                </div>
              )}

              {phoneStep === 'verify' && (
                <div className="mt-3 space-y-2">
                  <p className="text-gray-500 text-xs">Code gesendet an {phone}</p>
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-zinc-600"
                  />
                  {error && <p className="text-red-400 text-xs">{error}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setPhoneStep('idle'); setOtp(''); setError(null) }}
                      className="flex-1 py-2 rounded-xl text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-200 transition-colors"
                    >
                      Abbrechen
                    </button>
                    <button
                      onClick={handleVerifyPhone}
                      disabled={loading || otp.length < 6}
                      className="flex-1 py-2 rounded-xl text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40"
                    >
                      {loading ? 'Pruefe...' : 'Bestaetigen'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
