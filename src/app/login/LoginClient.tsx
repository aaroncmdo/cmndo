'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { MailIcon, SmartphoneIcon } from 'lucide-react'
import { LoadingButton } from '@/components/ui/loading-button'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { roleToPath } from '@/lib/auth/role-redirect'

// Submit-Button mit useFormStatus damit der Loading-Spinner waehrend der
// Server-Action-Ausfuehrung sichtbar ist (BUG-88).
function EmailSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <LoadingButton
      type="submit"
      isLoading={pending}
      loadingText="Wird angemeldet..."
      className="w-full py-3.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-sm active:scale-[0.98] transition-all mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      Einloggen
    </LoadingButton>
  )
}

type Tab = 'email' | 'telefon' | 'google'

export default function LoginClient({
  loginAction,
}: {
  loginAction: (formData: FormData) => Promise<void>
}) {
  const [tab, setTab] = useState<Tab>('email')
  const [phoneStep, setPhoneStep] = useState<'enter' | 'verify'>('enter')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [phoneLoading, setPhoneLoading] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  async function handlePhoneSend() {
    setPhoneError(null)
    setPhoneLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({ phone })
      if (error) throw error
      setPhoneStep('verify')
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'SMS konnte nicht gesendet werden')
    } finally {
      setPhoneLoading(false)
    }
  }

  async function handlePhoneVerify() {
    setPhoneError(null)
    setPhoneLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({ phone, token: otp, type: 'sms' })
      if (error) throw error
      // Check role and redirect
      const user = (await supabase.auth.getUser())?.data?.user ?? null
      if (user) {
        // Update auth_provider
        await supabase.from('profiles').update({ auth_provider: 'phone', force_password_change: false }).eq('id', user.id)
        const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
        window.location.href = roleToPath(profile?.rolle as string | null | undefined)
      }
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'Code ungueltig')
    } finally {
      setPhoneLoading(false)
    }
  }

  async function handleGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-claimondo-bg rounded-xl p-1">
        <button
          type="button"
          onClick={() => setTab('email')}
          className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'email' ? 'bg-claimondo-shield text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
          }`}
        >
          <MailIcon className="w-3.5 h-3.5" />
          E-Mail
        </button>
        <button
          type="button"
          onClick={() => setTab('telefon')}
          className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'telefon' ? 'bg-claimondo-shield text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
          }`}
        >
          <SmartphoneIcon className="w-3.5 h-3.5" />
          Telefon
        </button>
        <button
          type="button"
          onClick={() => setTab('google')}
          className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            tab === 'google' ? 'bg-claimondo-shield text-white' : 'text-claimondo-ondo hover:text-claimondo-navy'
          }`}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          Google
        </button>
      </div>

      {/* Email tab */}
      {tab === 'email' && (
        <form action={loginAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-claimondo-navy">E-Mail</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="name@beispiel.de"
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-claimondo-bg text-claimondo-navy placeholder-claimondo-shield text-sm focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-claimondo-navy">Passwort</label>
            <PasswordInput
              id="password"
              name="password"
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-claimondo-bg text-claimondo-navy placeholder-claimondo-shield text-sm focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo transition-all"
            />
          </div>

          {/* BUG-83 Befund 7: 'Angemeldet bleiben' Checkbox.
              Default OFF — User muss aktiv anhaken um Persistent Token
              zu bekommen. */}
          <div className="flex items-start gap-2">
            <input
              id="remember"
              name="remember"
              type="checkbox"
              defaultChecked={false}
              className="mt-0.5 w-4 h-4 rounded border-claimondo-border text-claimondo-shield focus:ring-2 focus:ring-claimondo-shield"
            />
            <label htmlFor="remember" className="text-xs text-claimondo-ondo leading-tight">
              Angemeldet bleiben
              <span className="block text-[10px] text-claimondo-ondo/70 mt-0.5">Nur auf privaten Geräten verwenden</span>
            </label>
          </div>

          <EmailSubmitButton />

          {/* BUG-83 Befund 7: Passwort vergessen Link.
              Ziel-Page wird von Hund C angelegt — bis dahin landet der User
              auf einer 404, das ist OK fuer den parallelen Workflow. */}
          <Link
            href="/passwort-vergessen"
            className="text-center text-xs text-claimondo-ondo hover:text-claimondo-shield transition-colors -mt-1"
          >
            Passwort vergessen?
          </Link>
        </form>
      )}

      {/* Phone tab */}
      {tab === 'telefon' && (
        <div className="flex flex-col gap-4">
          {phoneStep === 'enter' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-claimondo-navy">Telefonnummer</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+49 170 1234567"
                  className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-claimondo-bg text-claimondo-navy placeholder-claimondo-shield text-sm focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo transition-all"
                />
              </div>
              {phoneError && (
                <p className="text-sm text-red-400 rounded-xl bg-red-50/50 border border-red-200 px-4 py-3">{phoneError}</p>
              )}
              <LoadingButton
                onClick={handlePhoneSend}
                disabled={!phone}
                isLoading={phoneLoading}
                loadingText="Wird gesendet..."
                className="w-full py-3.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-sm active:scale-[0.98] transition-all mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Code per SMS senden
              </LoadingButton>
            </>
          ) : (
            <>
              <p className="text-claimondo-ondo text-sm">Code gesendet an <span className="text-claimondo-navy">{phone}</span></p>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-claimondo-navy">6-stelliger Code</label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl border border-claimondo-border bg-claimondo-bg text-claimondo-navy placeholder-claimondo-shield text-sm text-center tracking-[0.5em] font-mono focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo transition-all"
                />
              </div>
              {phoneError && (
                <p className="text-sm text-red-400 rounded-xl bg-red-50/50 border border-red-200 px-4 py-3">{phoneError}</p>
              )}
              <LoadingButton
                onClick={handlePhoneVerify}
                disabled={otp.length < 6}
                isLoading={phoneLoading}
                loadingText="Wird geprüft..."
                className="w-full py-3.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white font-semibold text-sm active:scale-[0.98] transition-all mt-1 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Bestätigen
              </LoadingButton>
              <button
                type="button"
                onClick={() => { setPhoneStep('enter'); setOtp(''); setPhoneError(null) }}
                className="text-claimondo-ondo text-sm hover:text-claimondo-navy transition-colors"
              >
                Andere Nummer verwenden
              </button>
            </>
          )}
        </div>
      )}

      {/* Google tab */}
      {tab === 'google' && (
        <div className="flex flex-col gap-4">
          <p className="text-claimondo-ondo text-sm text-center">Mit Ihrem Google-Konto anmelden</p>
          <button
            type="button"
            onClick={handleGoogle}
            className="w-full py-3.5 rounded-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-white font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
            Mit Google anmelden
          </button>
        </div>
      )}
    </div>
  )
}
