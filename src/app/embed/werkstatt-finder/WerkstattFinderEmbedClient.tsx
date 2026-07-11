'use client'

// Oeffentlicher Werkstatt-Embed-Finder (Client). Flow: initiale Suche (lat/lng/plz aus
// der iframe-URL) -> echte Partner-Werkstaetten in der Naehe -> (optional) Schadenfoto
// hochladen -> Bedarf ableiten -> qualifizierte Werkstaetten -> Pick + Kurz-Kontakt ->
// erstelleWerkstattFinderLead legt einen Lead an (Reparateur-Zuweisung nur wenn gewaehlt
// UND Test-Guard passt) und liefert einen FlowLink-Token -> Redirect in den bestehenden
// /flow (der die Strecke Haftpflicht/Selbstzahler verzweigt). Supply-Gate: 0 Treffer ->
// Absenden ohne Werkstatt erlaubt (Dispatcher matcht).

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/primitives/Button'
import { TextField } from '@/components/shared/forms/TextField'
import { WerkstattFinderMap } from '@/components/kunde/WerkstattFinderMap'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'
import type { Fit, Reparaturbedarf } from '@/lib/werkstatt/bedarf/types'
import type { EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'
import {
  sucheEchteWerkstaetten,
  sucheWerkstaettenNachOrt,
  erstelleWerkstattFinderLead,
  klassifiziereSchadenfotoEmbed,
} from './actions'

type Props = { initialLat?: number; initialLng?: number; initialPlz?: string }

const MAX_FOTOS = 3

export function WerkstattFinderEmbedClient({ initialLat, initialLng, initialPlz }: Props) {
  const [rows, setRows] = useState<(WerkstattFinderRow & { fit?: Fit })[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null,
  )
  const [ort, setOrt] = useState(initialPlz ?? '')
  const [suchLauft, setSuchLauft] = useState(false)
  const [ortNichtGefunden, setOrtNichtGefunden] = useState(false)
  const [keineSpezialisierte, setKeineSpezialisierte] = useState(false)
  const [form, setForm] = useState({ vorname: '', nachname: '', email: '', telefon: '' })
  const [sending, setSending] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)

  // Foto-Funnel-State
  const [fotos, setFotos] = useState<EmbedFoto[]>([])
  const [bedarf, setBedarf] = useState<Reparaturbedarf | null>(null)
  const [klassifiziert, setKlassifiziert] = useState(false)
  const [klassifiziereLaeuft, setKlassifiziereLaeuft] = useState(false)
  const fotoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let aktiv = true
    setLoading(true)
    sucheEchteWerkstaetten({ lat: initialLat, lng: initialLng, plz: initialPlz, bedarf: bedarf ?? undefined })
      .then((r) => {
        if (aktiv) {
          setRows(r.werkstaetten)
          setKeineSpezialisierte(r.keineSpezialisierte)
        }
      })
      .catch(() => {
        if (aktiv) {
          setRows([])
          setKeineSpezialisierte(false)
        }
      })
      .finally(() => {
        if (aktiv) setLoading(false)
      })
    return () => {
      aktiv = false
    }
    // bedarf ist bewusst nicht in den Dependencies — initiale Suche ohne Bedarf;
    // Re-Suche mit Bedarf geschieht explizit nach Klassifizierung (handleFotoUpload).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLng, initialPlz])

  async function sucheOrt(e: React.FormEvent) {
    e.preventDefault()
    const q = ort.trim()
    if (!q) return
    setSuchLauft(true)
    setOrtNichtGefunden(false)
    setSelectedId(null)
    try {
      const res = await sucheWerkstaettenNachOrt(q, bedarf ?? undefined)
      setRows(res.werkstaetten)
      setCenter(res.center)
      setKeineSpezialisierte(res.keineSpezialisierte)
      if (res.center == null && res.werkstaetten.length === 0) setOrtNichtGefunden(true)
    } catch {
      setRows([])
      setCenter(null)
      setKeineSpezialisierte(false)
      setOrtNichtGefunden(true)
    } finally {
      setSuchLauft(false)
    }
  }

  /** Liest Dateien als base64-EmbedFoto (max MAX_FOTOS), klassifiziert, sucht neu. */
  async function handleFotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = Array.from(e.target.files ?? []).slice(0, MAX_FOTOS)
    if (dateien.length === 0) return

    // Dateien zu base64 konvertieren (FileReader). Leere Fotos ({data:''}) werden
    // vom Guard/sanitize server-seitig ohnehin verworfen — hier nur Robustheit,
    // damit ein Lese-/Format-Fehler das Promise.all nicht haengen laesst (Spinner).
    const neueFotos = await Promise.all(
      dateien.map(
        (datei) =>
          new Promise<EmbedFoto>((resolve) => {
            const reader = new FileReader()
            reader.onerror = () => resolve({ media_type: '', data: '' })
            reader.onload = (ev) => {
              const dataUrl = ev.target?.result as string
              // data-URL Format: "data:<media_type>;base64,<data>"
              if (!dataUrl?.includes(',')) return resolve({ media_type: '', data: '' })
              const [header, data] = dataUrl.split(',')
              const media_type = header.replace('data:', '').replace(';base64', '')
              resolve({ media_type, data })
            }
            reader.readAsDataURL(datei)
          }),
      ),
    )

    setFotos(neueFotos)
    setKlassifiziereLaeuft(true)
    try {
      const neuerBedarf = await klassifiziereSchadenfotoEmbed(neueFotos)
      setBedarf(neuerBedarf)
      setKlassifiziert(true)

      // Re-Suche mit Bedarf
      const sucheInput = {
        lat: center?.lat ?? initialLat,
        lng: center?.lng ?? initialLng,
        plz: center ? undefined : initialPlz,
        bedarf: neuerBedarf,
      }
      const r = await sucheEchteWerkstaetten(sucheInput)
      setRows(r.werkstaetten)
      setKeineSpezialisierte(r.keineSpezialisierte)
    } catch {
      // Fail-safe: Klassifizierung schlaegt fehl → unbeeintraechtigte Suche
      console.error('[WerkstattFinderEmbedClient] Klassifizierung fehlgeschlagen (non-fatal)')
    } finally {
      setKlassifiziereLaeuft(false)
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
      fotos: fotos.length > 0 ? fotos : undefined,
      bedarf: bedarf ?? undefined,
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

      {/* Foto-Zone: optionales Schadenfoto für Werkstatt-Empfehlung */}
      <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4 space-y-2">
        <p className="text-body-sm font-medium text-claimondo-navy">
          Schadenfoto hochladen (optional)
        </p>
        <p className="text-body-xs text-claimondo-slate">
          Lade bis zu 3 Fotos deines Schadens hoch — wir empfehlen dir dann Werkstätten mit den
          passenden Spezialisierungen.
        </p>
        <p className="text-body-xs text-claimondo-slate">
          Datenschutz-Hinweis: Das Foto wird nur zur Werkstatt-Zuordnung analysiert und erst beim
          Absenden gespeichert.
        </p>
        <input
          ref={fotoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFotoUpload}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => fotoInputRef.current?.click()}
          loading={klassifiziereLaeuft}
        >
          {fotos.length > 0 ? `${fotos.length} Foto${fotos.length > 1 ? 's' : ''} ausgewählt` : 'Fotos auswählen'}
        </Button>
        {klassifiziert && bedarf && bedarf.kategorien.length > 0 && (
          <p className="text-body-xs text-success-strong">
            Erkannte Gewerke: {bedarf.kategorien.join(', ')} — Liste wurde angepasst.
          </p>
        )}
        {klassifiziert && bedarf && bedarf.kategorien.length === 0 && (
          <p className="text-body-xs text-claimondo-slate">
            Gewerke konnten nicht erkannt werden — alle Werkstätten werden angezeigt.
          </p>
        )}
      </div>

      {keineSpezialisierte && (
        <p className="text-body-sm text-warning-strong">
          Keine spezialisierte Werkstatt in deiner Nähe gefunden — wir zeigen dir alle verfügbaren
          Werkstätten.
        </p>
      )}

      <WerkstattFinderMap
        werkstaetten={rows}
        center={center}
        onSelect={setSelectedId}
        selectedId={selectedId}
        loading={loading}
        keineSpezialisierte={keineSpezialisierte}
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
