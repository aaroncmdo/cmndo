'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { ShieldCheckIcon, SmartphoneIcon, RefreshCwIcon } from 'lucide-react'
import {
  challengePhoneFaktor,
  enrollePhoneFaktor,
  verifyPhoneFaktor,
  merkeTwofaTelefon,
} from '@/lib/auth/twofa/mfa'
import { createRememberToken } from '@/lib/auth/twofa/remember-me'
import PageHeader from '@/components/shared/PageHeader'

// AAR-939: 2FA-Code-Eingabe auf Basis von Supabase-MFA (Phone-Faktor).
//   mode='challenge' -> bestehenden Faktor verifizieren (SMS beim Mount).
//   mode='enroll'    -> Soft-Enroll: Nummer bestätigen -> SMS -> verifizieren.
// Bei Erfolg hebt Supabase die Session auf aal2; die Middleware lässt dann durch.

type Props = {
  mode: 'challenge' | 'enroll'
  /** challenge: ID des verifizierten Faktors, dessen Challenge wir auslösen */
  factorId?: string
  /** challenge: maskierte Nummer für die Anzeige */
  maskedPhone?: string | null
  /** enroll: vorausgefüllte Nummer (aus twofa_telefon/telefon) */
  prefillPhone?: string | null
  /** Ziel nach erfolgreicher 2FA (roleToPath bzw. validiertes continue) */
  targetPath: string
  /** F3: interne Pflicht-Rolle — "Später einrichten" wird ausgeblendet (non-skippable) */
  mandatory?: boolean
}

function maskPhone(phone: string): string {
  const p = phone.trim()
  if (p.length < 6) return p
  return p.slice(0, 4) + '••••' + p.slice(-3)
}

export default function TwoFaClient({
  mode,
  factorId,
  maskedPhone,
  prefillPhone,
  targetPath,
  mandatory = false,
}: Props) {
  const [phase, setPhase] = useState<'phone' | 'code'>(mode === 'enroll' ? 'phone' : 'code')
  const [phone, setPhone] = useState(prefillPhone ?? '')
  const [activeFactorId, setActiveFactorId] = useState<string | null>(factorId ?? null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Challenge-Modus: SMS automatisch beim Mount auslösen — Single-Attempt-Guard
  // gegen doppeltes Feuern unter React-StrictMode.
  const sentRef = useRef(false)
  useEffect(() => {
    if (mode !== 'challenge' || sentRef.current || !factorId) return
    sentRef.current = true
    challengePhoneFaktor(factorId)
      .then((r) => {
        if (r.ok) {
          setChallengeId(r.challengeId)
          setResendCooldown(60)
        } else {
          setError(r.error)
        }
      })
      .catch(() => setError('SMS-Code konnte nicht gesendet werden.'))
  }, [mode, factorId])

  // Resend-Cooldown-Ticker
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((p) => Math.max(0, p - 1)), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  // Enroll: Nummer absenden → enroll + erste Challenge.
  function sendeEnroll() {
    setError(null)
    if (phone.trim().length < 5) {
      setError('Bitte eine gültige Telefonnummer eingeben.')
      return
    }
    startTransition(async () => {
      const r = await enrollePhoneFaktor(phone.trim())
      if (!r.ok) {
        setError(r.error)
        return
      }
      setActiveFactorId(r.factorId)
      setChallengeId(r.challengeId)
      setPhase('code')
      setResendCooldown(60)
    })
  }

  function handleResend() {
    if (resendCooldown > 0 || !activeFactorId) return
    setError(null)
    startTransition(async () => {
      const r = await challengePhoneFaktor(activeFactorId)
      if (r.ok) {
        setChallengeId(r.challengeId)
        setResendCooldown(60)
      } else {
        setError(r.error)
      }
    })
  }

  function handleVerify() {
    if (code.length !== 6) {
      setError('Bitte 6-stelligen Code eingeben')
      return
    }
    if (!activeFactorId || !challengeId) {
      setError('Bitte zuerst einen Code anfordern.')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await verifyPhoneFaktor(activeFactorId, challengeId, code)
      if (!r.ok) {
        setError(r.error)
        setCode('')
        inputRef.current?.focus()
        return
      }
      // Anzeige-Nummer (Einstellungen) konsistent halten — nur beim Enroll nötig.
      if (mode === 'enroll' && phone.trim()) {
        try {
          await merkeTwofaTelefon(phone.trim())
        } catch {
          /* non-critical: Anzeige-Sync */
        }
      }
      if (rememberMe) {
        await createRememberToken(
          '',
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
          null,
        )
      }
      // AAR-939 enroll-navfix: Hard-Navigate statt router.push. router.push
      // verlässt sich auf den Client-Router-Cache und navigiert nach dem
      // AAL2-Wechsel + der 2. Server-Action (merkeTwofaTelefon) unzuverlässig —
      // der Enroll-Pfad blieb auf /login/2fa hängen, obwohl die Session schon
      // aal2 war (Live-Smoke 18.06., direkter /kunde-Aufruf lud sofort).
      // window.location erzwingt einen frischen Request mit dem aal2-Cookie.
      // Gleiche Lehre wie früher in TwoFaSkipRedirect.
      window.location.href = targetPath
    })
  }

  const versandZiel =
    phase === 'code' ? (mode === 'enroll' ? maskPhone(phone) : maskedPhone) : null

  const beschreibung =
    phase === 'phone'
      ? 'Richte Ihre Anmeldung per SMS-Code ein. Wir senden Ihnen einen 6-stelligen Code an Ihre Telefonnummer.'
      : versandZiel
        ? `Wir haben einen SMS-Code an ${versandZiel} gesendet.`
        : 'SMS-Code wird gesendet …'

  return (
    <div className="min-h-screen flex items-center justify-center bg-claimondo-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <PageHeader
            title="Zwei-Faktor-Authentifizierung"
            description={beschreibung}
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
          {phase === 'phone' ? (
            <div className="mb-4">
              <label className="text-xs text-claimondo-ondo mb-1.5 block">Telefonnummer</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendeEnroll()}
                autoFocus
                placeholder="+49 151 12345678"
                className="w-full text-center text-lg bg-claimondo-bg border border-claimondo-border rounded-ios-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo focus:border-transparent"
              />
            </div>
          ) : (
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
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                autoFocus
                className="w-full text-center text-2xl font-mono tracking-[0.5em] bg-claimondo-bg border border-claimondo-border rounded-ios-md px-4 py-3 focus:outline-none focus:ring-2 focus:ring-claimondo-ondo focus:border-transparent"
                placeholder="000000"
              />
            </div>
          )}

          {phase === 'code' && (
            <label className="flex items-center gap-2.5 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-claimondo-border text-claimondo-ondo focus:ring-claimondo-ondo"
              />
              <span className="text-sm text-claimondo-navy">Diesem Gerät vertrauen (30 Tage)</span>
            </label>
          )}

          {error && (
            <div className="bg-danger-soft border border-danger/30 rounded-ios-md px-3 py-2 text-danger-strong text-xs mb-4">
              {error}
            </div>
          )}

          {phase === 'phone' ? (
            <button
              onClick={sendeEnroll}
              disabled={pending || phone.trim().length < 5}
              className="w-full py-3 rounded-ios-md bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {pending ? 'Wird gesendet …' : 'Code senden'}
            </button>
          ) : (
            <>
              <button
                onClick={handleVerify}
                disabled={pending || code.length !== 6}
                className="w-full py-3 rounded-ios-md bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {pending ? 'Wird geprüft …' : 'Bestätigen'}
              </button>

              <button
                onClick={handleResend}
                disabled={resendCooldown > 0 || pending}
                className="w-full mt-3 py-2 text-xs text-claimondo-ondo hover:text-claimondo-ondo transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
              >
                <RefreshCwIcon className="w-3 h-3" />
                {resendCooldown > 0 ? `Code erneut senden (${resendCooldown}s)` : 'Code erneut senden'}
              </button>
            </>
          )}
        </div>

        {mode === 'enroll' && !mandatory && (
          // Soft-Enroll: überspringbar. Die Middleware lässt faktor-lose User
          // ohnehin durch — der Link macht das ehrlich statt eine Wand vorzutäuschen.
          // F3: Pflicht-Rollen (mandatory) sehen den Skip NICHT — 2FA ist erzwungen.
          <button
            onClick={() => { window.location.href = targetPath }}
            className="w-full mt-4 py-2 text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors text-center"
          >
            Später einrichten
          </button>
        )}

        <p className="text-[10px] text-claimondo-ondo/70 text-center mt-4">
          <SmartphoneIcon className="w-3 h-3 inline mr-1" />
          Kein Code erhalten? Prüfe, ob die Telefonnummer korrekt ist, und fordere ihn erneut an.
        </p>
      </div>
    </div>
  )
}
