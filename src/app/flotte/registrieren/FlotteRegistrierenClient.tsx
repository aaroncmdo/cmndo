'use client'

// Flotten-Self-Signup-Formular (Muster MaklerRegistrierenClient, kompakt).
// Einladungs-Token aus ?einladung= wird als FormData-Feld durchgereicht (Redemption
// best-effort in der Action — ein Token-Fehler bricht die Registrierung nie).

import { useState, useTransition } from 'react'
import { Button, Card } from '@/components/primitives'
import { TextField } from '@/components/shared/forms/TextField'
import { registriereFlotteSelf } from './actions'

export function FlotteRegistrierenClient({ einladung = null }: { einladung?: string | null }) {
  const [firma, setFirma] = useState('')
  const [vorname, setVorname] = useState('')
  const [email, setEmail] = useState('')
  const [telefon, setTelefon] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const fd = new FormData()
    fd.set('firma_name', firma)
    fd.set('vorname', vorname)
    fd.set('email', email)
    fd.set('telefon', telefon)
    if (einladung) fd.set('einladung', einladung)
    startTransition(async () => {
      const res = await registriereFlotteSelf(fd)
      if (res.ok) setSuccess(true)
      else setError(res.error)
    })
  }

  if (success) {
    return (
      <Card p={6}>
        <h2 className="mb-2 text-lg font-bold text-claimondo-navy">Willkommen bei Claimondo!</h2>
        <p className="text-sm text-claimondo-shield">
          Ihr Flotten-Konto ist angelegt — die Zugangsdaten sind unterwegs an{' '}
          <span className="font-semibold text-claimondo-navy">{email}</span>. Nach dem ersten
          Login verwalten Sie Ihre Fahrzeuge und Netzwerkkarten unter „Flotte".
          {einladung ? ' Sie sind automatisch mit Ihrem Einlader vernetzt.' : ''}
        </p>
      </Card>
    )
  }

  return (
    <Card p={6}>
      <div className="flex flex-col gap-4">
        <TextField
          label="Firmenname *"
          placeholder="Muster Logistik GmbH"
          value={firma}
          onChange={(e) => setFirma(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Vorname (Ansprechpartner) *"
            placeholder="Max"
            value={vorname}
            onChange={(e) => setVorname(e.target.value)}
          />
          <TextField
            label="Telefon"
            placeholder="0151 23456789"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
          />
        </div>
        <TextField
          label="E-Mail *"
          type="email"
          placeholder="fuhrpark@muster-logistik.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error ? <p className="text-body-sm text-danger">{error}</p> : null}
        <Button variant="navy" onClick={submit} loading={pending}>
          Kostenlos registrieren
        </Button>
        <p className="text-body-xs text-claimondo-shield">
          Mit dem Absenden stimmst du unseren Nutzungsbedingungen und der Datenschutzerklärung zu.
        </p>
      </div>
    </Card>
  )
}
