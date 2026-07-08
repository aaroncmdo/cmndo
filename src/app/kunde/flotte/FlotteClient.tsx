'use client'

// Sub-Projekt 2 (Kunde-Portal 1+): Firma & Flotte — Client.
// Kein Firmen-Konto -> Firma-Setup; sonst Flotten-Liste + Hinzufuegen/Entfernen.
// Policy-konform: shared/forms/TextField, SectionCard, primitives/Button.

import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { CarIcon, Trash2Icon } from 'lucide-react'
import { TextField } from '@/components/shared/forms/TextField'
import { SectionCard } from '@/components/shared/SectionCard'
import { Button } from '@/components/primitives/Button'
import { speichereFirma, fuegeFahrzeugHinzu, entferneFahrzeug } from './actions'
import type { KundeFirma, FlottenFahrzeug } from '@/lib/kunde/firma-flotte'

export default function FlotteClient({ firma, flotte }: { firma: KundeFirma | null; flotte: FlottenFahrzeug[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [firmaForm, setFirmaForm] = useState({ name: '', rechtsform: '', ustId: '', strasse: '', plz: '', ort: '' })
  const [fzForm, setFzForm] = useState({ kennzeichen: '', hersteller: '', modell: '', notiz: '' })

  async function onSpeichereFirma(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await speichereFirma(firmaForm)
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(res.error)
  }

  async function onFuegeHinzu(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const res = await fuegeFahrzeugHinzu(fzForm)
    setBusy(false)
    if (res.ok) {
      setFzForm({ kennzeichen: '', hersteller: '', modell: '', notiz: '' })
      router.refresh()
    } else setError(res.error ?? 'Fehler')
  }

  async function onEntferne(flottenId: string) {
    setError(null)
    setBusy(true)
    const res = await entferneFahrzeug(flottenId)
    setBusy(false)
    if (res.ok) router.refresh()
    else setError(res.error ?? 'Fehler')
  }

  if (!firma) {
    return (
      <SectionCard title="Firmen-Konto anlegen" subtitle="Für gewerbliche Kunden mit mehreren Fahrzeugen.">
        <form onSubmit={onSpeichereFirma} className="space-y-4">
          <TextField
            label="Firmenname"
            value={firmaForm.name}
            onChange={(e) => setFirmaForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="z. B. Muster GmbH"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Rechtsform (optional)" value={firmaForm.rechtsform} onChange={(e) => setFirmaForm((p) => ({ ...p, rechtsform: e.target.value }))} placeholder="GmbH" />
            <TextField label="USt-IdNr. (optional)" value={firmaForm.ustId} onChange={(e) => setFirmaForm((p) => ({ ...p, ustId: e.target.value }))} placeholder="DE…" />
          </div>
          <TextField label="Straße (optional)" value={firmaForm.strasse} onChange={(e) => setFirmaForm((p) => ({ ...p, strasse: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="PLZ (optional)" value={firmaForm.plz} onChange={(e) => setFirmaForm((p) => ({ ...p, plz: e.target.value }))} inputMode="numeric" maxLength={5} />
            <TextField label="Ort (optional)" value={firmaForm.ort} onChange={(e) => setFirmaForm((p) => ({ ...p, ort: e.target.value }))} />
          </div>
          {error ? <p className="text-sm text-danger-strong">{error}</p> : null}
          <Button type="submit" variant="navy" fullWidth loading={busy}>
            Firmen-Konto anlegen
          </Button>
        </form>
      </SectionCard>
    )
  }

  return (
    <div className="space-y-5">
      <SectionCard title={firma.name} subtitle={[firma.rechtsform, firma.ort].filter(Boolean).join(' · ') || 'Firmen-Konto'}>
        <p className="text-sm text-claimondo-shield">
          {flotte.length} {flotte.length === 1 ? 'Fahrzeug' : 'Fahrzeuge'} in der Flotte.
        </p>
      </SectionCard>

      <SectionCard title="Fahrzeuge">
        {flotte.length === 0 ? (
          <p className="text-sm text-claimondo-shield">Noch keine Fahrzeuge — fügen Sie unten das erste hinzu.</p>
        ) : (
          <ul className="divide-y divide-claimondo-border">
            {flotte.map((v) => (
              <li key={v.flottenId} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-md bg-claimondo-bg">
                  <CarIcon className="h-4 w-4 text-claimondo-ondo" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-claimondo-navy">{v.kennzeichen ?? '—'}</p>
                  <p className="truncate text-xs text-claimondo-shield">
                    {[v.hersteller, v.modell].filter(Boolean).join(' ') || 'Fahrzeug'}
                  </p>
                </div>
                <Button
                  variant="bare"
                  size="icon"
                  ariaLabel="Fahrzeug entfernen"
                  onClick={() => onEntferne(v.flottenId)}
                  iconLeft={<Trash2Icon className="h-4 w-4" />}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Fahrzeug hinzufügen">
        <form onSubmit={onFuegeHinzu} className="space-y-4">
          <TextField
            label="Kennzeichen"
            value={fzForm.kennzeichen}
            onChange={(e) => setFzForm((p) => ({ ...p, kennzeichen: e.target.value }))}
            placeholder="z. B. K-AB 123"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Hersteller (optional)" value={fzForm.hersteller} onChange={(e) => setFzForm((p) => ({ ...p, hersteller: e.target.value }))} placeholder="VW" />
            <TextField label="Modell (optional)" value={fzForm.modell} onChange={(e) => setFzForm((p) => ({ ...p, modell: e.target.value }))} placeholder="Golf" />
          </div>
          {error ? <p className="text-sm text-danger-strong">{error}</p> : null}
          <Button type="submit" variant="navy" fullWidth loading={busy}>
            Hinzufügen
          </Button>
        </form>
      </SectionCard>
    </div>
  )
}
