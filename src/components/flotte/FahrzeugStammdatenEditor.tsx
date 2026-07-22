'use client'

// Fahrzeug-Stammdaten auf der Detailseite: Ansicht (dl) + Inline-Bearbeitung durch
// den Flottenmanager. Deckt beides ab — bestehende Werte korrigieren UND fehlende
// Details nachtragen (leeres Feld -> Wert setzen). Speichern laeuft ueber die
// flottenmanager-gescopte Server-Action `speichereFahrzeugStammdaten` (Ownership +
// Validierung serverseitig in updateFahrzeugStammdaten).

import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import type { FahrzeugStammdatenForm } from '@/lib/flotte/mutate-flotte'

export type FahrzeugStammdatenWerte = {
  kennzeichen: string | null
  hersteller: string | null
  modell: string | null
  fin: string | null
  hsn: string | null
  tsn: string | null
  farbe: string | null
  kilometerstand: number | null
  notiz: string | null
}

function ausWerten(w: FahrzeugStammdatenWerte): FahrzeugStammdatenForm {
  return {
    kennzeichen: w.kennzeichen ?? '',
    hersteller: w.hersteller ?? '',
    modell: w.modell ?? '',
    fin: w.fin ?? '',
    hsn: w.hsn ?? '',
    tsn: w.tsn ?? '',
    farbe: w.farbe ?? '',
    kilometerstand: w.kilometerstand != null ? String(w.kilometerstand) : '',
    notiz: w.notiz ?? '',
  }
}

function Zeile({ label, wert }: { label: string; wert: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-claimondo-shield">{label}</dt>
      <dd className="font-medium text-claimondo-navy text-right">{wert && wert.trim() ? wert : '–'}</dd>
    </div>
  )
}

export function FahrzeugStammdatenEditor({
  vehicleId,
  werte,
  onSpeichern,
}: {
  vehicleId: string
  werte: FahrzeugStammdatenWerte
  onSpeichern: (
    vehicleId: string,
    form: FahrzeugStammdatenForm,
  ) => Promise<{ ok: boolean; error?: string }>
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [form, setForm] = useState<FahrzeugStammdatenForm>(() => ausWerten(werte))

  function bearbeiten() {
    // Immer aus den aktuellen (ggf. nach router.refresh() aktualisierten) Werten starten.
    setForm(ausWerten(werte))
    setFehler(null)
    setEditing(true)
  }

  function abbrechen() {
    setForm(ausWerten(werte))
    setFehler(null)
    setEditing(false)
  }

  const set =
    (k: keyof FahrzeugStammdatenForm) =>
    (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }))

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFehler(null)
    const res = await onSpeichern(vehicleId, form)
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      router.refresh()
    } else {
      setFehler(res.error ?? 'Speichern fehlgeschlagen.')
    }
  }

  const kmText = werte.kilometerstand != null ? `${werte.kilometerstand.toLocaleString('de-DE')} km` : null

  return (
    <SectionCard
      title="Stammdaten"
      headerAction={
        editing ? null : (
          <Button variant="ghost" size="sm" onClick={bearbeiten}>
            Bearbeiten
          </Button>
        )
      }
    >
      {editing ? (
        <form onSubmit={speichern}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label="Kennzeichen"
              value={form.kennzeichen}
              onChange={set('kennzeichen')}
              className="sm:col-span-2"
              autoFocus
            />
            <TextField label="Hersteller" value={form.hersteller ?? ''} onChange={set('hersteller')} />
            <TextField label="Modell" value={form.modell ?? ''} onChange={set('modell')} />
            <TextField
              label="FIN"
              value={form.fin ?? ''}
              onChange={set('fin')}
              maxLength={17}
              inputClassName="uppercase"
              hint="17 Zeichen, ohne I, O, Q"
              className="sm:col-span-2"
            />
            <TextField label="HSN" value={form.hsn ?? ''} onChange={set('hsn')} maxLength={4} />
            <TextField label="TSN" value={form.tsn ?? ''} onChange={set('tsn')} maxLength={3} />
            <TextField label="Farbe" value={form.farbe ?? ''} onChange={set('farbe')} />
            <TextField
              label="Kilometerstand"
              value={form.kilometerstand ?? ''}
              onChange={set('kilometerstand')}
              inputMode="numeric"
              hint="in km"
            />
            <TextField
              label="Notiz"
              value={form.notiz ?? ''}
              onChange={set('notiz')}
              className="sm:col-span-2"
            />
          </div>
          {fehler ? <p className="mt-3 text-sm text-danger-strong">{fehler}</p> : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={abbrechen} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" variant="navy" size="sm" loading={saving}>
              Speichern
            </Button>
          </div>
        </form>
      ) : (
        <dl className="space-y-3 text-sm">
          <Zeile label="Kennzeichen" wert={werte.kennzeichen} />
          <Zeile label="Hersteller" wert={werte.hersteller} />
          <Zeile label="Modell" wert={werte.modell} />
          <Zeile label="FIN" wert={werte.fin} />
          <Zeile label="HSN" wert={werte.hsn} />
          <Zeile label="TSN" wert={werte.tsn} />
          <Zeile label="Farbe" wert={werte.farbe} />
          <Zeile label="Kilometerstand" wert={kmText} />
          {werte.notiz ? <Zeile label="Notiz" wert={werte.notiz} /> : null}
        </dl>
      )}
    </SectionCard>
  )
}
