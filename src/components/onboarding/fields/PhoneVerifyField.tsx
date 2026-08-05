'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import type { OnboardingFeld } from '../types'

// AAR-939: Telefon-Verifizierung im Onboarding richtet jetzt direkt einen
// Supabase-MFA-Phone-Faktor ein (Entscheidung Aaron: verifizieren = 2FA-an).
// Ablauf: Nummer eingeben -> enroll+SMS -> Code -> verify (Session aal2) ->
// alte Faktoren wegräumen + Anzeige-Nummer syncen.

export function PhoneVerifyField({ feld, value, onChange, disabled }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  // Prefill: die bei der Registrierung angegebene Nummer (via Loader-Optionen-
  // Injection, Muster calendar-connect) — sonst tippt der User sie doppelt.
  const [telefon, setTelefon] = useState(
    () => feld.optionen?.find((o) => o.value === 'telefonPrefill')?.label ?? '',
  )
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [phase, setPhase] = useState<'eingabe' | 'code' | 'fertig'>(value ? 'fertig' : 'eingabe')
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function senden() {
    setFehler(null)
    if (telefon.trim().length < 5) { setFehler('Bitte eine gültige Telefonnummer eingeben.'); return }
    startTransition(async () => {
      const { enrollePhoneFaktor } = await import('@/lib/auth/twofa/mfa')
      const res = await enrollePhoneFaktor(telefon.trim())
      if (!res.ok) { setFehler(res.error); return }
      setFactorId(res.factorId)
      setChallengeId(res.challengeId)
      setPhase('code')
    })
  }
  function bestaetigen() {
    setFehler(null)
    if (code.trim().length < 6) { setFehler('Bitte den 6-stelligen Code eingeben.'); return }
    if (!factorId || !challengeId) { setFehler('Bitte zuerst einen Code anfordern.'); return }
    startTransition(async () => {
      const { verifyPhoneFaktor, entferneAndereFaktoren, merkeTwofaTelefon } = await import('@/lib/auth/twofa/mfa')
      const res = await verifyPhoneFaktor(factorId, challengeId, code.trim())
      if (!res.ok) { setFehler(res.error); return }
      // Genau einen Faktor behalten + Anzeige-Nummer syncen.
      await entferneAndereFaktoren(factorId)
      await merkeTwofaTelefon(telefon.trim())
      try {
        const { checkAndCacheAvailability } = await import('@/lib/whatsapp/availability')
        const { createClient } = await import('@/lib/supabase/client')
        const u = (await createClient().auth.getUser()).data.user
        if (u) void checkAndCacheAvailability('profile', u.id, telefon.trim())
      } catch { /* non-critical */ }
      setPhase('fertig')
      onChange(new Date().toISOString())
    })
  }

  if (phase === 'fertig') return <p className="text-sm font-semibold text-emerald-700">✓ Telefonnummer bestätigt.</p>
  return (
    <div className="flex flex-col gap-3">
      {phase === 'eingabe' && (<>
        <TextField label={feld.label} type="tel" placeholder={feld.placeholder ?? '+49 151 12345678'}
          value={telefon} onChange={(e) => setTelefon(e.target.value)} hint={feld.hint ?? undefined} disabled={disabled} />
        <Button variant="navy" onClick={senden} loading={pending}>Code senden</Button>
      </>)}
      {phase === 'code' && (<>
        <TextField label="Bestätigungscode" type="text" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button variant="navy" onClick={bestaetigen} loading={pending}>Bestätigen</Button>
      </>)}
      {fehler && <p className="text-sm text-red-700">{fehler}</p>}
    </div>
  )
}
