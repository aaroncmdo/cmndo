'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { ShieldCheckIcon, KeyRoundIcon } from 'lucide-react'
import { challengePhoneFaktor, verifyPhoneFaktor } from '@/lib/auth/twofa/mfa'
import { createRememberToken } from '@/lib/auth/twofa/remember-me'
import PageHeader from '@/components/shared/PageHeader'

// AAR-939 TOTP: Login-Verifikation eines Authenticator-App-Faktors. Anders als
// der Phone-Pfad gibt es KEIN SMS (kein „gesendet an"-Text, kein Resend-Cooldown)
// — der Code kommt aus der App des Users. Die Challenge wird beim Mount still
// erzeugt (challengePhoneFaktor ist factorId-generisch); verify hebt die Session
// auf aal2, danach lässt die Middleware durch.
//
// SMS-Fallback: hat der User zusätzlich einen Phone-Faktor, zeigt smsFallbackHref
// auf /login/2fa?factor=phone — die Page rendert dann den SMS-Pfad (TwoFaClient).

type Props = {
  /** ID des verifizierten TOTP-Faktors */
  totpFactorId: string
  /** Ziel auf /login/2fa?factor=phone, falls ein Phone-Faktor existiert — sonst null */
  smsFallbackHref: string | null
  /** Ziel nach erfolgreicher 2FA (roleToPath bzw. validiertes continue) */
  targetPath: string
}

export default function TotpChallengeClient({
  totpFactorId,
  smsFallbackHref,
  targetPath,
}: Props) {
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Challenge still beim Mount erzeugen — Single-Attempt-Guard gegen doppeltes
  // Feuern unter React-StrictMode. Kein SMS, kein Cooldown.
  const sentRef = useRef(false)
  useEffect(() => {
    if (sentRef.current) return
    sentRef.current = true
    challengePhoneFaktor(totpFactorId)
      .then((r) => {
        if (r.ok) setChallengeId(r.challengeId)
        else setError(r.error)
      })
      .catch(() => setError('Die Verifizierung konnte nicht gestartet werden.'))
  }, [totpFactorId])

  function handleVerify() {
    if (code.length !== 6) {
      setError('Bitte 6-stelligen Code eingeben')
      return
    }
    if (!challengeId) {
      setError('Einen Moment — Verifizierung wird vorbereitet …')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await verifyPhoneFaktor(totpFactorId, challengeId, code)
      if (!r.ok) {
        setError(r.error)
        setCode('')
        inputRef.current?.focus()
        return
      }
      if (rememberMe) {
        await createRememberToken(
          '',
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
          null,
        )
      }
      // AAR-939 navfix: Hard-Navigate statt router.push (gleiche Lehre wie der
      // Phone-Pfad — router.push blieb nach dem aal2-Wechsel hängen).
      window.location.href = targetPath
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-claimondo-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <PageHeader
            title="Zwei-Faktor-Authentifizierung"
            description="Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein."
            size="lg"
            align="center"
            leadingSlot={
              <div className="w-16 h-16 bg-claimondo-navy rounded-ios-md flex items-center justify-center">
                <ShieldCheckIcon className="w-8 h-8 text-white" />
              </div>
            }
          />
        </div>

        <div className="bg-white rounded-ios-md border border-claimondo-border p-6">
          <div className="mb-4">
            <label className="text-xs text-claimondo-ondo mb-1.5 block">6-stelliger Code</label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => e.key === 'Enter' && challengeId && handleVerify()}
              autoFocus
              className="w-full text-center text-2xl font-mono tracking-[0.5em] bg-claimondo-bg border border-claimondo-border rounded-ios-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo focus:border-transparent"
              placeholder="000000"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-claimondo-border text-claimondo-ondo focus:ring-claimondo-ondo"
            />
            <span className="text-sm text-claimondo-navy">Diesem Gerät vertrauen (30 Tage)</span>
          </label>

          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-ios-md px-3 py-2 text-danger-strong text-xs mb-4">
              {error}
            </div>
          )}

          {/* AAR-2fa-race: Button erst freigeben, wenn die beim Mount async erzeugte
              Challenge da ist. Vorher wurde ein frueher Klick (Code schnell getippt +
              Challenge auf langsamem Cold-Path noch pending) stumm verschluckt
              (handleVerify -> `!challengeId`-Branch „wird vorbereitet"), der User musste
              erneut klicken. Disabled + Label-Wechsel macht das eindeutig. */}
          <button
            onClick={handleVerify}
            disabled={pending || code.length !== 6 || !challengeId}
            className="w-full py-3 rounded-ios-md bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {!challengeId ? 'Wird vorbereitet …' : pending ? 'Wird geprüft …' : 'Bestätigen'}
          </button>

          {smsFallbackHref && (
            // Fallback: der User hat zusätzlich einen Phone-Faktor — die Page
            // rendert auf ?factor=phone den SMS-Pfad.
            <a
              href={smsFallbackHref}
              className="block w-full mt-3 py-2 text-xs text-center text-claimondo-ondo hover:text-claimondo-ondo/80 transition-colors"
            >
              Stattdessen SMS-Code an mein Telefon
            </a>
          )}
        </div>

        <p className="text-[10px] text-claimondo-ondo/70 text-center mt-4">
          <KeyRoundIcon className="w-3 h-3 inline mr-1" />
          Der Code wechselt alle 30 Sekunden in Ihrer Authenticator-App.
        </p>
      </div>
    </div>
  )
}
