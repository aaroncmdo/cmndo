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
import {
  sucheEchteWerkstaetten,
  sucheWerkstaettenNachOrt,
  erstelleWerkstattFinderLead,
} from './actions'

type Props = { initialLat?: number; initialLng?: number; initialPlz?: string }

export function WerkstattFinderEmbedClient({ initialLat, initialLng, initialPlz }: Props) {
  const [rows, setRows] = useState<WerkstattFinderRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null,
  )
  const [ort, setOrt] = useState(initialPlz ?? '')
  const [suchLauft, setSuchLauft] = useState(false)
  const [ortNichtGefunden, setOrtNichtGefunden] = useState(false)
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

  async function sucheOrt(e: React.FormEvent) {
    e.preventDefault()
    const q = ort.trim()
    if (!q) return
    setSuchLauft(true)
    setOrtNichtGefunden(false)
    setSelectedId(null)
    try {
      const res = await sucheWerkstaettenNachOrt(q)
      setRows(res.rows)
      setCenter(res.center)
      if (res.center == null && res.rows.length === 0) setOrtNichtGefunden(true)
    } catch {
      setRows([])
      setCenter(null)
      setOrtNichtGefunden(true)
    } finally {
      setSuchLauft(false)
    }
  }

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
      lat: center?.lat ?? null,
      lng: center?.lng ?? null,
      ort: gewaehlt?.adresse_ort ?? (ort.trim() || null),
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
      <form onSubmit={sucheOrt} className="flex items-end gap-2">
        <TextField
          label="Standort (PLZ oder Ort)"
          value={ort}
          onChange={(e) => setOrt(e.target.value)}
          placeholder="z. B. 10115 oder Berlin"
          className="flex-1"
        />
        <Button type="submit" loading={suchLauft} disabled={!ort.trim()}>
          Suchen
        </Button>
      </form>
      {ortNichtGefunden && (
        <p className="text-body-sm text-danger-strong">
          Ort nicht gefunden — bitte PLZ oder Stadt prüfen.
        </p>
      )}
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
