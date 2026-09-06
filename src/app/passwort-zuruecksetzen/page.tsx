'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { KeyIcon, CheckCircle2Icon, AlertTriangleIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LoadingButton } from '@/components/ui/loading-button'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { confirmPasswordReset } from '@/lib/actions/auth/reset-password'

type Phase = 'verifying' | 'ready' | 'expired' | 'success' | 'error'

export default function PasswortZuruecksetzenPage() {
  const [phase, setPhase] = useState<Phase>('verifying')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Recovery-Tokens der (nur in-memory gehaltenen) Client-Session. Welcome-Magic-Links
  // (Werkstatt/SV, admin.generateLink type=recovery) etablieren die Session via URL-Hash OHNE
  // Cookie — wir merken uns die Tokens hier und reichen sie beim Speichern an die Server-Action
  // durch, sonst sieht diese keine Session (siehe confirmPasswordReset).
  const recoveryTokensRef = useRef<{ access_token: string; refresh_token: string } | null>(null)

  // Supabase liest den Recovery-Token automatisch aus dem URL-Hash und
  // etabliert eine temporäre Session. Wir prüfen einmal beim Mount, ob das
  // geklappt hat — wenn nicht, ist der Link abgelaufen oder ungültig.
  useEffect(() => {
    let cancelled = false
    async function check() {
      const supabase = createClient()
      // FIX (Werkstatt-/SV-Welcome): admin.generateLink({ type: 'recovery' }) liefert eine
      // IMPLICIT-Session im URL-Hash (#access_token). Der @supabase/ssr-Client laeuft im
      // PKCE-Modus und verarbeitet den Implicit-Hash NICHT automatisch (nur ?code) → ohne das
      // Folgende etabliert die Session NIE, der User sieht "Link abgelaufen" und das Formular
      // erscheint gar nicht. Wir parsen den Hash daher manuell und etablieren die Session via
      // setSession (schreibt auch das server-lesbare Cookie, das confirmPasswordReset liest).
      // Forgot-Password (?code / PKCE) laeuft unveraendert automatisch weiter.
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const params = new URLSearchParams(window.location.hash.slice(1))
        const access_token = params.get('access_token')
        const refresh_token = params.get('refresh_token')
        if (access_token && refresh_token) {
          await supabase.auth.setSession({ access_token, refresh_token })
          // Token aus der URL entfernen — nicht im Verlauf/Referrer hinterlassen.
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }
      // Kleiner Delay, damit Supabase Zeit hat, die Session zu schreiben.
      await new Promise((r) => setTimeout(r, 200))
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      if (data?.user) {
        // Tokens der Recovery-Session zusaetzlich festhalten (Belt-and-Suspenders): die
        // Server-Action confirmPasswordReset nutzt sie als Fallback, falls das per setSession
        // geschriebene Cookie nicht rechtzeitig server-lesbar ist.
        const { data: sessionData } = await supabase.auth.getSession()
        if (sessionData?.session) {
          recoveryTokensRef.current = {
            access_token: sessionData.session.access_token,
            refresh_token: sessionData.session.refresh_token,
          }
        }
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

    // AAR-auth-haertung (Befund J): Client-UX-Hinweis; serverseitig ist
    // pruefePasswortStaerke autoritativ (>=12 + HIBP-Breach-Check).
    if (password.length < 12) {
      setError('Passwort muss mindestens 12 Zeichen lang sein.')
      return
    }
    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.')
      return
    }

    setSubmitting(true)
    try {
      const result = await confirmPasswordReset(password, recoveryTokensRef.current ?? undefined)
      if (result.success) {
        setPhase('success')
        if (result.redirectTo) {
          // Onboarding (frisch angelegter Account): in der Recovery-Session eingeloggt
          // bleiben und direkt ins Portal — der Magic-Link-Button verspricht "Passwort
          // setzen & einloggen". Hard-Nav vermeidet die RSC-Soft-Nav-Race mit den frisch
          // rotierten Auth-Cookies (CMM-14).
          const ziel = result.redirectTo
          setTimeout(() => {
            window.location.href = ziel
          }, 1200)
        } else {
          // Passwort-vergessen: aus der temporären Recovery-Session ausloggen, damit der
          // User sich beim nächsten Schritt sauber neu mit dem neuen Passwort anmeldet.
          const supabase = createClient()
          await supabase.auth.signOut()
          setTimeout(() => {
            window.location.href = '/login?ok=' + encodeURIComponent('Passwort erfolgreich geändert')
          }, 1500)
        }
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
    <div className="flex min-h-screen items-center justify-center px-5 relative overflow-hidden bg-claimondo-bg">
      {/* Ambient-Gradient Spotlights */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.2), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.12), transparent 70%)',
          ].join(', '),
        }}
      />
      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            <span className="text-claimondo-navy">Claim</span>
            <span className="text-claimondo-ondo">ondo</span>
          </h1>
          <p className="mt-2 text-sm text-claimondo-ondo">Neues Passwort setzen</p>
        </div>

        <div className="bg-white border border-claimondo-border rounded-ios-lg p-8 shadow-claimondo-md">
          {phase === 'verifying' && (
            <p className="text-center text-claimondo-ondo text-sm py-8">Reset-Link wird geprüft …</p>
          )}

          {phase === 'expired' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-ios-md bg-warning-soft flex items-center justify-center mb-4">
                <AlertTriangleIcon className="w-7 h-7 text-warning" />
              </div>
              <p className="text-claimondo-navy font-semibold text-base mb-2">Link abgelaufen</p>
              <p className="text-claimondo-ondo text-sm leading-relaxed mb-4">
                Dieser Reset-Link ist nicht mehr gültig oder wurde bereits
                verwendet.
              </p>
              <Link
                href="/passwort-vergessen"
                className="inline-block w-full py-3 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] text-center"
              >
                Neuen Reset-Link anfordern
              </Link>
            </div>
          )}

          {phase === 'success' && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto rounded-ios-md bg-success-soft flex items-center justify-center mb-4">
                <CheckCircle2Icon className="w-7 h-7 text-success" />
              </div>
              <p className="text-claimondo-navy font-semibold text-base mb-2">
                Passwort erfolgreich geändert
              </p>
              <p className="text-claimondo-ondo text-sm">Sie werden weitergeleitet …</p>
            </div>
          )}

          {phase === 'ready' && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-ios-md bg-claimondo-ondo/10 flex items-center justify-center">
                  <KeyIcon className="w-5 h-5 text-claimondo-ondo" />
                </div>
                <div>
                  <p className="text-claimondo-navy font-medium text-sm">Neues Passwort setzen</p>
                  <p className="text-claimondo-ondo text-xs">Mindestens 12 Zeichen</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-claimondo-navy">
                    Neues Passwort
                  </label>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 12 Zeichen"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    className="w-full px-4 py-3.5 rounded-ios-md border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy placeholder:text-claimondo-ondo/60 text-base tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm" className="text-sm font-medium text-claimondo-navy">
                    Passwort bestätigen
                  </label>
                  <PasswordInput
                    id="confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Passwort wiederholen"
                    required
                    minLength={12}
                    autoComplete="new-password"
                    className="w-full px-4 py-3.5 rounded-ios-md border-[1.5px] border-transparent bg-claimondo-navy/[0.06] text-claimondo-navy placeholder:text-claimondo-ondo/60 text-base tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo"
                  />
                </div>

                {error && (
                  <p className="text-sm text-danger-strong rounded-ios-md bg-danger-soft border border-danger/30 px-4 py-3 text-center">
                    {error}
                  </p>
                )}

                <LoadingButton
                  type="submit"
                  isLoading={submitting}
                  loadingText="Wird gespeichert..."
                  className="w-full py-3.5 rounded-full bg-claimondo-ondo hover:bg-claimondo-shield text-white disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 active:scale-[0.98] transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] mt-1"
                >
                  Passwort speichern
                </LoadingButton>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-claimondo-ondo text-xs mt-6">&copy; 2026 Claimondo GmbH</p>
      </div>
    </div>
  )
}
