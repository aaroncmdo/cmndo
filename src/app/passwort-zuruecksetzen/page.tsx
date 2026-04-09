'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { KeyIcon, CheckCircle2Icon, AlertTriangleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingButton } from '@/components/ui/loading-button'
import { confirmPasswordReset } from '@/lib/actions/auth/reset-password'

type Phase = 'verifying' | 'ready' | 'expired' | 'success' | 'error'

export default function PasswortZuruecksetzenPage() {
  const [phase, setPhase] = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Supabase liest den Recovery-Token automatisch aus dem URL-Hash und
  // etabliert eine temporäre Session. Wir prüfen einmal beim Mount, ob das
  // geklappt hat — wenn nicht, ist der Link abgelaufen oder ungültig.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const supabase = createClient()
      // Kleiner Delay, damit Supabase Zeit hat, den Hash zu verarbeiten.
      await new Promise((r) => setTimeout(r, 200))
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (data?.user) {
        setPhase('ready')
      } else {
        setPhase('expired')
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein.')
      return
    }
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.')
      return
    }

    setSubmitting(true)
    try {
      const result = await confirmPasswordReset(password)
      if (result.success) {
        setPhase('success')
        // Aus der temporären Recovery-Session ausloggen, damit der User
        // sich beim nächsten Schritt sauber neu mit dem neuen Passwort
        // anmelden kann.
        const supabase = createClient()
        await supabase.auth.signOut()
        // Toast über query param — /login zeigt das oben in der ErrorMessage
        // bzw. wir schicken den User mit ?ok=Passwort... rüber.
        setTimeout(() => {
          window.location.href = '/login?ok=' + encodeURIComponent('Passwort erfolgreich geändert')
        }, 1500)
      } else {
        if (result.error?.toLowerCase().includes('abgelaufen') || result.error?.toLowerCase().includes('ungültig')) {
          setPhase('expired')
        } else {
          setError(result.error ?? 'Unbekannter Fehler')
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-[#f8f9fb]">
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-[#0D1B3E]">Claim</span>
            <span className="text-[#4573A2]">ondo</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">Neues Passwort setzen</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl p-8 shadow-lg">
          {phase === 'verifying' && (
            <p className="text-center text-gray-500 text-sm py-8">Reset-Link wird geprüft …</p>
          )}

          {phase === 'expired' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
                <AlertTriangleIcon className="w-7 h-7 text-amber-500" />
              </div>
              <p className="text-gray-900 font-semibold text-base mb-2">Link abgelaufen</p>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                Dieser Reset-Link ist nicht mehr gültig oder wurde bereits
                verwendet.
              </p>
              <Link
                href="/passwort-vergessen"
                className="inline-block w-full py-3 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white font-semibold text-sm transition-colors"
              >
                Neuen Reset-Link anfordern
              </Link>
            </div>
          )}

          {phase === 'success' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
                <CheckCircle2Icon className="w-7 h-7 text-emerald-500" />
              </div>
              <p className="text-gray-900 font-semibold text-base mb-2">
                Passwort erfolgreich geändert
              </p>
              <p className="text-gray-500 text-sm">Du wirst zum Login weitergeleitet …</p>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#4573A2]/10 flex items-center justify-center">
                  <KeyIcon className="w-5 h-5 text-[#4573A2]" />
                </div>
                <div>
                  <p className="text-gray-900 font-medium text-sm">Neues Passwort setzen</p>
                  <p className="text-gray-500 text-xs">Mindestens 8 Zeichen</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-gray-700">
                    Neues Passwort
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 8 Zeichen"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm" className="text-sm font-medium text-gray-700">
                    Passwort bestätigen
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Passwort wiederholen"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-gray-100 text-gray-900 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-700 transition-all"
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-center">
                    {error}
                  </p>
                )}

                <LoadingButton
                  type="submit"
                  isLoading={submitting}
                  loadingText="Wird gespeichert..."
                  className="w-full py-3.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm active:scale-[0.98] transition-all mt-1"
                >
                  Passwort speichern
                </LoadingButton>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}
