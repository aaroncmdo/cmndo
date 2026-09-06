'use client'

// AAR-344 Pfad A: Self-Service-Komponente zum Einrichten/Ändern der 2FA-Nummer.
// Zwei-Stufen-UI: Nummer eingeben → SMS-Code bestätigen. Funktioniert auf
// admin/gutachter/kunde Profil-Seiten.
// AAR-939: Läuft jetzt über Supabase-MFA (Phone-Faktor) — enroll(neu) + verify,
// danach alte Faktoren wegräumen + Anzeige-Nummer syncen.

import { useState, useTransition } from 'react'
import { ShieldCheckIcon, LoaderIcon, XIcon } from 'lucide-react'
import {
  enrollePhoneFaktor,
  verifyPhoneFaktor,
  entferneAndereFaktoren,
  merkeTwofaTelefon,
} from '@/lib/auth/twofa/mfa'
import { Modal } from '@/components/primitives/Modal'

export function TwoFaPhoneChange({
  aktuelleTwofaTelefon,
  fallbackTelefon,
}: {
  aktuelleTwofaTelefon: string | null
  fallbackTelefon: string | null
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<'input' | 'code'>('input')
  const [neuePhone, setNeuePhone] = useState('')
  const [normalized, setNormalized] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  // B2: Info, wenn die Nummer zwar als SMS-2FA verifiziert wurde, aber der
  // passwordless Telefon-Login nicht aktivierbar war (Nummer bereits vergeben).
  const [loginHinweis, setLoginHinweis] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const aktuell = aktuelleTwofaTelefon ?? fallbackTelefon
  const usingFallback = !aktuelleTwofaTelefon && !!fallbackTelefon

  function reset() {
    setStep('input')
    setNeuePhone('')
    setNormalized('')
    setFactorId(null)
    setChallengeId(null)
    setCode('')
    setError(null)
    setSuccess(null)
    setLoginHinweis(null)
  }

  function sendCode() {
    setError(null)
    startTransition(async () => {
      // Legt einen (neuen) Phone-Faktor an + löst die erste SMS aus.
      const r = await enrollePhoneFaktor(neuePhone)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setFactorId(r.factorId)
      setChallengeId(r.challengeId)
      setNormalized(neuePhone)
      setStep('code')
    })
  }

  function confirm() {
    setError(null)
    if (!factorId || !challengeId) {
      setError('Bitte zuerst einen Code anfordern.')
      return
    }
    startTransition(async () => {
      const r = await verifyPhoneFaktor(factorId, challengeId, code)
      if (!r.ok) {
        setError(r.error)
        return
      }
      // Neuer Faktor verifiziert → alte Nummern wegräumen + Anzeige syncen.
      await entferneAndereFaktoren(factorId)
      const sync = await merkeTwofaTelefon(normalized)
      setSuccess(`2FA-Nummer geändert auf ${mask(normalized)}`)
      // B2: Der auth.users.phone-Sync (Login-per-Nummer) kann fehlschlagen, wenn die
      // Nummer bereits einem anderen Konto zugeordnet ist (UNIQUE). SMS-2FA ist dann
      // trotzdem aktiv — nur der zusätzliche Telefon-Login nicht. Sichtbar machen
      // statt still verschlucken; bei Hinweis das Modal länger offen lassen.
      const loginAus = sync.ok && !sync.phoneLoginAktiviert
      if (loginAus) {
        setLoginHinweis(
          'Der zusätzliche Login per Telefonnummer wurde nicht aktiviert — diese Nummer ist möglicherweise bereits einem anderen Konto zugeordnet. Ihre SMS-2FA funktioniert normal.',
        )
      }
      // Modal nach kurzer Zeit schließen + Page refreshen via reload
      setTimeout(() => {
        setOpen(false)
        reset()
        window.location.reload()
      }, loginAus ? 4500 : 1500)
    })
  }

  return (
    <>
      <div className="rounded-ios-xl border border-claimondo-border bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheckIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">2FA-Telefonnummer</h3>
        </div>
        <p className="text-xs text-claimondo-ondo">
          Aktuelle Nummer: <span className="font-mono">{aktuell ? mask(aktuell) : '—'}</span>
          {usingFallback && (
            <span className="text-claimondo-ondo/70"> (Fallback auf Profil-Telefon)</span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            reset()
            setOpen(true)
          }}
          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy"
        >
          Nummer ändern
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        closeOnBackdrop={!pending}
        closeOnEsc={!pending}
        noPadding
        hideCloseButton
        maxWidth={448}
        ariaLabel="2FA-Nummer ändern"
      >
        <div>
            <div className="flex items-center justify-between border-b border-claimondo-border p-4">
              <h2 className="text-base font-semibold text-claimondo-navy">2FA-Nummer ändern</h2>
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
                    Wir senden einen 6-stelligen Code per SMS an die neue Nummer.
                    Erst nach erfolgreicher Bestätigung wird die Nummer
                    übernommen — Ihre aktuelle Nummer bleibt bis dahin gültig.
                  </p>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 block mb-1">
                      Neue Telefonnummer
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
                    Wir haben einen Code an <span className="font-mono">{mask(normalized)}</span>{' '}
                    gesendet. Bitte eingeben um die Änderung zu bestätigen.
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
              {loginHinweis && (
                <p className="text-xs text-claimondo-ondo bg-claimondo-bg border border-claimondo-border rounded-ios-md p-2">
                  {loginHinweis}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-claimondo-border p-3">
              <button
                type="button"
                onClick={() => !pending && setOpen(false)}
                disabled={pending}
                className="px-3 py-1.5 rounded-ios-md text-xs font-medium border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
              >
                Abbrechen
              </button>
              {step === 'input' ? (
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={pending || !neuePhone.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
                >
                  {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
                  Code senden
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || code.length !== 6}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
                >
                  {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
                  Bestätigen
                </button>
              )}
            </div>
        </div>
      </Modal>
    </>
  )
}

function mask(phone: string): string {
  if (phone.length < 6) return phone
  return phone.slice(0, 4) + '•••••' + phone.slice(-3)
}
