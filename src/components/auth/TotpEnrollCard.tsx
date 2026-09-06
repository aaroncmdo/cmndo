'use client'

// AAR-939 TOTP: Self-Service-Karte zum Einrichten/Entfernen einer Authenticator-
// App (TOTP) als optionaler 2. Faktor — additiv neben TwoFaPhoneChange (SMS).
// Läuft über native Supabase-MFA (factorType:'totp'). enroll liefert einen
// fertigen QR-Code (data:svg) + Secret; verify (challenge+verify, factorId-
// generisch) hebt den Faktor auf 'verified'. Status wird beim Mount selbst
// geladen (listeFaktoren) — die Profil-Seiten müssen nichts zusätzlich liefern.

import { useState, useEffect, useTransition } from 'react'
import {
  KeyRoundIcon,
  LoaderIcon,
  XIcon,
  CheckCircle2Icon,
  Trash2Icon,
} from 'lucide-react'
import {
  enrolleTotpFaktor,
  challengePhoneFaktor,
  verifyPhoneFaktor,
  entferneFaktor,
  listeFaktoren,
  type Faktor,
} from '@/lib/auth/twofa/mfa'
import { Modal } from '@/components/primitives/Modal'

export function TotpEnrollCard() {
  const [faktoren, setFaktoren] = useState<Faktor[] | null>(null) // null = lädt
  const [open, setOpen] = useState(false)
  const [enroll, setEnroll] = useState<{ factorId: string; qrCode: string; secret: string } | null>(
    null,
  )
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  async function ladeFaktoren() {
    const r = await listeFaktoren()
    setFaktoren(r.ok ? r.faktoren : [])
  }
  useEffect(() => {
    ladeFaktoren()
  }, [])

  const totp =
    (faktoren ?? []).find((f) => f.type === 'totp' && f.status === 'verified') ?? null

  function startEnroll() {
    setError(null)
    setSuccess(null)
    setCode('')
    setEnroll(null)
    setOpen(true)
    startTransition(async () => {
      // Legt einen unverifizierten TOTP-Faktor an + liefert QR/Secret. Stale
      // unverifizierte TOTP-Faktoren (abgebrochene Versuche) räumt der Wrapper
      // vorher selbst weg.
      const r = await enrolleTotpFaktor()
      if (!r.ok) {
        setError(r.error)
        return
      }
      setEnroll({ factorId: r.factorId, qrCode: r.qrCode, secret: r.secret })
    })
  }

  function confirmEnroll() {
    setError(null)
    if (!enroll) {
      setError('Einen Moment — der QR-Code wird noch erzeugt.')
      return
    }
    if (code.length !== 6) {
      setError('Bitte 6-stelligen Code eingeben')
      return
    }
    startTransition(async () => {
      // Frische Challenge direkt vor dem Verify (TOTP-Challenge ohne SMS).
      const ch = await challengePhoneFaktor(enroll.factorId)
      if (!ch.ok) {
        setError(ch.error)
        return
      }
      const v = await verifyPhoneFaktor(enroll.factorId, ch.challengeId, code)
      if (!v.ok) {
        setError(v.error)
        setCode('')
        return
      }
      setSuccess('Authenticator-App eingerichtet ✓')
      await ladeFaktoren()
      setTimeout(() => {
        setOpen(false)
        setEnroll(null)
        setCode('')
        setSuccess(null)
      }, 1400)
    })
  }

  function removeTotp() {
    if (!totp) return
    setError(null)
    startTransition(async () => {
      const r = await entferneFaktor(totp.id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      await ladeFaktoren()
      setRemoveOpen(false)
    })
  }

  return (
    <>
      <div className="rounded-ios-xl border border-claimondo-border bg-white p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <KeyRoundIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Authenticator-App</h3>
        </div>

        {faktoren === null ? (
          <p className="text-xs text-claimondo-ondo/70">Lädt …</p>
        ) : totp ? (
          <>
            <p className="text-xs text-claimondo-ondo flex items-center gap-1.5">
              <CheckCircle2Icon className="w-3.5 h-3.5 text-success" />
              Eingerichtet — wird beim Login bevorzugt.
            </p>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setRemoveOpen(true)
              }}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg border border-claimondo-border text-claimondo-ondo text-xs font-medium hover:bg-claimondo-bg"
            >
              <Trash2Icon className="w-3 h-3" />
              Entfernen
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-claimondo-ondo">
              Richte eine Authenticator-App (z.&nbsp;B. Google Authenticator, 1Password) als
              zusätzlichen, offline-fähigen 2. Faktor ein.
            </p>
            <button
              type="button"
              onClick={startEnroll}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy"
            >
              Einrichten
            </button>
          </>
        )}
      </div>

      {/* Enroll-Modal: QR + Secret + Code-Bestätigung */}
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        closeOnBackdrop={!pending}
        closeOnEsc={!pending}
        noPadding
        hideCloseButton
        maxWidth={448}
        ariaLabel="Authenticator-App einrichten"
      >
        <div>
          <div className="flex items-center justify-between border-b border-claimondo-border p-4">
            <h2 className="text-base font-semibold text-claimondo-navy">
              Authenticator-App einrichten
            </h2>
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
            {!enroll ? (
              <p className="text-xs text-claimondo-ondo flex items-center gap-1.5">
                <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                QR-Code wird erzeugt …
              </p>
            ) : (
              <>
                <p className="text-xs text-claimondo-ondo">
                  1. Scanne diesen QR-Code in Ihrer Authenticator-App:
                </p>
                <div className="flex justify-center">
                  {/* qr_code von Supabase ist bereits ein data:image/svg+xml — kein
                      eigenes QR-Rendering nötig; next/image bringt für data-URLs nichts. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={enroll.qrCode}
                    alt="QR-Code für die Authenticator-App"
                    className="w-44 h-44 rounded-ios-md border border-claimondo-border bg-white"
                  />
                </div>
                <p className="text-[10px] text-claimondo-ondo/70 text-center">
                  Kein Scan möglich? Code manuell eingeben:
                </p>
                <p className="text-center font-mono text-xs bg-claimondo-bg rounded-ios-md py-1.5 px-2 select-all break-all">
                  {enroll.secret}
                </p>
                <p className="text-xs text-claimondo-ondo pt-1">
                  2. Gib den 6-stelligen Code aus der App ein:
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && confirmEnroll()}
                  placeholder="123456"
                  className="w-full text-lg font-mono tracking-widest rounded-ios-md border border-claimondo-border px-2 py-2 outline-none focus:border-claimondo-ondo text-center"
                />
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
            <button
              type="button"
              onClick={() => !pending && setOpen(false)}
              disabled={pending}
              className="px-3 py-1.5 rounded-ios-md text-xs font-medium border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={confirmEnroll}
              disabled={pending || !enroll || code.length !== 6}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-md bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-navy disabled:opacity-50"
            >
              {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
              Bestätigen
            </button>
          </div>
        </div>
      </Modal>

      {/* Entfernen-Bestätigung */}
      <Modal
        open={removeOpen}
        onClose={() => !pending && setRemoveOpen(false)}
        closeOnBackdrop={!pending}
        closeOnEsc={!pending}
        noPadding
        hideCloseButton
        maxWidth={400}
        ariaLabel="Authenticator-App entfernen"
      >
        <div>
          <div className="border-b border-claimondo-border p-4">
            <h2 className="text-base font-semibold text-claimondo-navy">
              Authenticator-App entfernen?
            </h2>
          </div>
          <div className="p-4">
            <p className="text-xs text-claimondo-ondo">
              Sie verlieren diesen 2. Faktor. Falls keine SMS-Nummer hinterlegt ist, ist Ihr Konto
              danach nur noch per Passwort geschützt.
            </p>
            {error && (
              <p className="mt-3 text-xs text-danger-strong bg-danger-soft border border-danger/30 rounded-ios-md p-2">
                {error}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-claimondo-border p-3">
            <button
              type="button"
              onClick={() => !pending && setRemoveOpen(false)}
              disabled={pending}
              className="px-3 py-1.5 rounded-ios-md text-xs font-medium border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={removeTotp}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-ios-md bg-danger text-white text-xs font-medium hover:bg-danger/90 disabled:opacity-50"
            >
              {pending && <LoaderIcon className="w-3 h-3 animate-spin" />}
              Entfernen
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
