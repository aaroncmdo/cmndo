'use client'

// AAR-phone-login (Phase 2): Selbst-Service-Karte, mit der JEDE Rolle den
// passwordless Telefon-Login aktiviert/aendert — entkoppelt von 2FA. Zwei Stufen:
// Nummer eingeben -> SMS-Code bestaetigen. Setzt auth.users.phone via phone_change
// (Server-Actions), KEINEN MFA-Faktor.
import { useState, useTransition } from 'react'
import { PhoneIcon, XIcon } from 'lucide-react'
import {
  starteTelefonLoginVerify,
  bestaetigeTelefonLoginVerify,
} from '@/lib/auth/phone-login-actions'
import { Modal } from '@/components/primitives/Modal'
import { Button } from '@/components/primitives/Button'

export function PhoneLoginCard({ aktuellePhone }: { aktuellePhone: string | null }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'input' | 'code'>('input')
  const [neuePhone, setNeuePhone] = useState('')
  const [normalized, setNormalized] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function reset() {
    setStep('input')
    setNeuePhone('')
    setNormalized('')
    setCode('')
    setError(null)
    setSuccess(null)
  }

  function sendCode() {
    setError(null)
    startTransition(async () => {
      const r = await starteTelefonLoginVerify(neuePhone)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setNormalized(neuePhone)
      setStep('code')
    })
  }

  function confirm() {
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeTelefonLoginVerify(normalized, code)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setSuccess('Telefon-Login aktiviert.')
      setTimeout(() => {
        setOpen(false)
        reset()
        window.location.reload()
      }, 1500)
    })
  }

  return (
    <>
      <div className="rounded-ios-xl border border-claimondo-border bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <PhoneIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Telefon-Login</h3>
        </div>
        <p className="text-xs text-claimondo-ondo">
          Melden Sie sich künftig direkt mit Ihrer Telefonnummer an — ohne Passwort. Unabhängig von der
          Zwei-Faktor-Authentifizierung.
        </p>
        <p className="text-xs text-claimondo-ondo mt-1">
          Status:{' '}
          {aktuellePhone ? (
            <span className="font-medium text-claimondo-navy">
              aktiv (<span className="font-mono">{mask(aktuellePhone)}</span>)
            </span>
          ) : (
            <span className="text-claimondo-ondo/70">nicht aktiv</span>
          )}
        </p>
        <Button
          variant="ondo"
          size="sm"
          className="mt-2"
          onClick={() => {
            reset()
            setOpen(true)
          }}
        >
          {aktuellePhone ? 'Nummer ändern' : 'Telefon-Login aktivieren'}
        </Button>
      </div>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        closeOnBackdrop={!pending}
        closeOnEsc={!pending}
        noPadding
        hideCloseButton
        maxWidth={448}
        ariaLabel="Telefon-Login einrichten"
      >
        <div>
          <div className="flex items-center justify-between border-b border-claimondo-border p-4">
            <h2 className="text-base font-semibold text-claimondo-navy">Telefon-Login einrichten</h2>
            <button
              type="button"
              onClick={() => !pending && setOpen(false)}
              className="p-1.5 rounded-ios-md hover:bg-claimondo-bg"
              aria-label="Schließen"
            >
              <XIcon className="w-4 h-4 text-claimondo-ondo" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {step === 'input' && (
              <>
                <p className="text-xs text-claimondo-ondo">
                  Wir senden einen 6-stelligen Code per SMS an Ihre Nummer. Nach der Bestätigung können Sie sich damit einloggen.
                </p>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                    Telefonnummer
                  </label>
                  <input
                    type="tel"
                    value={neuePhone}
                    onChange={(e) => setNeuePhone(e.target.value)}
                    placeholder="+49 151 12345678 oder 0151 12345678"
                    className="w-full text-sm rounded-ios-md border border-claimondo-border px-2 py-2 outline-none focus:border-claimondo-ondo"
                  />
                </div>
              </>
            )}

            {step === 'code' && (
              <>
                <p className="text-xs text-claimondo-ondo">
                  Wir haben einen Code an <span className="font-mono">{mask(normalized)}</span> gesendet.
                  Bitte eingeben, um den Telefon-Login zu aktivieren.
                </p>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                    6-stelliger Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="w-full text-lg font-mono tracking-widest rounded-ios-md border border-claimondo-border px-2 py-2 outline-none focus:border-claimondo-ondo text-center"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep('input')
                    setCode('')
                    setError(null)
                  }}
                  className="text-xs text-claimondo-ondo hover:text-claimondo-navy"
                >
                  ← andere Nummer eingeben
                </button>
              </>
            )}

            {error && (
              <p className="text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-md p-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs text-success-strong bg-success-soft border border-success/30 rounded-ios-md p-2">
                {success}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-claimondo-border p-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => !pending && setOpen(false)}
            >
              Abbrechen
            </Button>
            {step === 'input' ? (
              <Button
                variant="ondo"
                size="sm"
                loading={pending}
                disabled={pending || !neuePhone.trim()}
                onClick={sendCode}
              >
                Code senden
              </Button>
            ) : (
              <Button
                variant="ondo"
                size="sm"
                loading={pending}
                disabled={pending || code.length !== 6}
                onClick={confirm}
              >
                Bestätigen
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

// Lokaler Masker (bewusst dupliziert statt aus TwoFaPhoneChange zu importieren —
// B2-Datei nicht anfassen; der Helfer ist trivial).
function mask(phone: string): string {
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '•••••' + phone.slice(-3)
}
