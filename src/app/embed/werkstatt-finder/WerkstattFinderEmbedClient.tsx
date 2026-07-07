'use client'

// Oeffentlicher Werkstatt-Embed-Finder (Client). Flow: initiale Suche (lat/lng/plz aus
// der iframe-URL) -> echte Partner-Werkstaetten in der Naehe -> Pick + Kurz-Kontakt ->
// erstelleWerkstattFinderLead legt einen Lead an (Reparateur-Zuweisung nur wenn gewaehlt
// UND Test-Guard passt) und liefert einen FlowLink-Token -> Redirect in den bestehenden
// /flow (der die Strecke Haftpflicht/Selbstzahler verzweigt). Supply-Gate: 0 Treffer ->
// Absenden ohne Werkstatt erlaubt (Dispatcher matcht).

import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives/Button'
import { TextField } from '@/components/shared/forms/TextField'
import { WerkstattFinderMap } from '@/components/kunde/WerkstattFinderMap'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import { sucheEchteWerkstaetten, erstelleWerkstattFinderLead } from './actions'

type Props = { initialLat?: number; initialLng?: number; initialPlz?: string }

export function WerkstattFinderEmbedClient({ initialLat, initialLng, initialPlz }: Props) {
  const [rows, setRows] = useState<WerkstattFinderRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ vorname: '', nachname: '', email: '', telefon: '' })
  const [sending, setSending] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    setLoading(true)
    sucheEchteWerkstaetten({ lat: initialLat, lng: initialLng, plz: initialPlz })
      .then((r) => {
        if (aktiv) setRows(r)
      })
      .catch(() => {
        if (aktiv) setRows([])
      })
      .finally(() => {
        if (aktiv) setLoading(false)
      })
    return () => {
      aktiv = false
    }
  }, [initialLat, initialLng, initialPlz])

  const center =
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null
  const gewaehlt = rows.find((r) => r.id === selectedId) ?? null

  async function absenden() {
    setFehler(null)
    if (!form.email.trim()) {
      setFehler('Bitte E-Mail angeben.')
      return
    }
    setSending(true)
    const res = await erstelleWerkstattFinderLead({
      vorname: form.vorname || null,
      nachname: form.nachname || null,
      email: form.email,
      telefon: form.telefon || null,
      werkstattId: selectedId,
      lat: initialLat ?? null,
      lng: initialLng ?? null,
      ort: gewaehlt?.adresse_ort ?? null,
    })
    setSending(false)
    if (res.ok) {
      window.location.href = `/flow/${res.token}`
    } else {
      setFehler(res.error)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-heading-md text-claimondo-navy">Werkstatt in deiner Nähe finden</h1>
      <WerkstattFinderMap
        werkstaetten={rows}
        center={center}
        onSelect={setSelectedId}
        selectedId={selectedId}
        loading={loading}
      />
      {!loading && rows.length === 0 && (
        <p className="text-body-sm text-claimondo-slate">
          Wir haben aktuell keine Partner-Werkstatt in direkter Nähe — kein Problem: gib deine
          Kontaktdaten an, wir finden die passende Werkstatt für dich.
        </p>
      )}
      <div className="space-y-3">
        <TextField
          label="Vorname"
          value={form.vorname}
          onChange={(e) => setForm({ ...form, vorname: e.target.value })}
        />
        <TextField
          label="Nachname"
          value={form.nachname}
          onChange={(e) => setForm({ ...form, nachname: e.target.value })}
        />
        <TextField
          label="E-Mail"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <TextField
          label="Telefon"
          type="tel"
          value={form.telefon}
          onChange={(e) => setForm({ ...form, telefon: e.target.value })}
        />
      </div>
      {fehler && <p className="text-body-sm text-danger-strong">{fehler}</p>}
      <Button onClick={absenden} loading={sending} fullWidth>
        {gewaehlt ? `Weiter mit ${gewaehlt.name}` : 'Passende Werkstatt anfragen'}
      </Button>
    </div>
  )
}
