'use client'

// AAR-CMM Stufe 2: Spontan-Termin-Modal
// Wird aus KalenderClient mit prefilled Datum/Uhrzeit geöffnet (Slot-Klick).
// Geocoding läuft client-side über Mapbox-Token (public). Lat/Lng leer
// erlaubt — Lead kann später via Phase4 nachgepflegt werden.

import { useState, useTransition, useEffect, useRef } from 'react'
import { XIcon, MapPinIcon, CheckCircleIcon, AlertTriangleIcon } from 'lucide-react'
import { createSpontanTermin, type SpontanInput } from './_actions/spontan'
import type { KalenderSv } from './KalenderClient'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

type GeocodeResult = { lat: number; lng: number; label: string } | null

async function geocodeAddress(adresse: string): Promise<GeocodeResult> {
  if (!MAPBOX_TOKEN || !adresse.trim()) return null
  try {
    const url =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(adresse)}.json` +
      `?country=de&limit=1&access_token=${MAPBOX_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    const feature = data?.features?.[0]
    if (!feature?.center) return null
    return {
      lat: feature.center[1],
      lng: feature.center[0],
      label: feature.place_name ?? adresse,
    }
  } catch {
    return null
  }
}

function toLocalIso(dateStr: string, timeStr: string): string {
  // dateStr = YYYY-MM-DD, timeStr = HH:MM → lokale ISO-Zeit
  const [y, m, d] = dateStr.split('-').map(Number)
  const [h, min] = timeStr.split(':').map(Number)
  const dt = new Date(y, m - 1, d, h, min, 0, 0)
  return dt.toISOString()
}

export default function SpontanTerminModal({
  open,
  onClose,
  svList,
  initialDate,
  initialTime,
  initialSvId,
}: {
  open: boolean
  onClose: () => void
  svList: KalenderSv[]
  initialDate: string // YYYY-MM-DD
  initialTime: string // HH:MM
  initialSvId?: string | null
}) {
  const [vorname, setVorname] = useState('')
  const [nachname, setNachname] = useState('')
  const [telefon, setTelefon] = useState('')
  const [email, setEmail] = useState('')
  const [adresse, setAdresse] = useState('')
  const [geocode, setGeocode] = useState<GeocodeResult>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [svId, setSvId] = useState(initialSvId ?? '')
  const [date, setDate] = useState(initialDate)
  const [time, setTime] = useState(initialTime)
  const [duration, setDuration] = useState(45)
  const [flowlinkKanal, setFlowlinkKanal] = useState<'whatsapp' | 'sms' | 'email' | 'kein'>('whatsapp')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const adresseDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset bei jedem Öffnen mit neuen Initial-Werten
  useEffect(() => {
    if (open) {
      setDate(initialDate)
      setTime(initialTime)
      setSvId(initialSvId ?? '')
      setError(null)
    }
  }, [open, initialDate, initialTime, initialSvId])

  // Debounced Auto-Geocode bei Adress-Änderung
  useEffect(() => {
    if (adresseDebounceRef.current) clearTimeout(adresseDebounceRef.current)
    if (!adresse.trim() || adresse.length < 5) {
      setGeocode(null)
      return
    }
    setGeocoding(true)
    adresseDebounceRef.current = setTimeout(async () => {
      const r = await geocodeAddress(adresse)
      setGeocode(r)
      setGeocoding(false)
    }, 600)
    return () => {
      if (adresseDebounceRef.current) clearTimeout(adresseDebounceRef.current)
    }
  }, [adresse])

  if (!open) return null

  function submit() {
    setError(null)
    if (!vorname.trim() || !nachname.trim() || !telefon.trim()) {
      setError('Vorname, Nachname und Telefon sind Pflicht')
      return
    }
    if (!svId) {
      setError('Bitte einen Sachverständigen auswählen')
      return
    }

    const startIso = toLocalIso(date, time)
    const input: SpontanInput = {
      vorname: vorname.trim(),
      nachname: nachname.trim(),
      telefon: telefon.trim(),
      email: email.trim() || null,
      besichtigungsortAdresse: geocode?.label ?? adresse.trim(),
      besichtigungsortLat: geocode?.lat ?? null,
      besichtigungsortLng: geocode?.lng ?? null,
      svId,
      startIso,
      durationMin: duration,
      flowlinkKanal,
    }

    startTransition(async () => {
      const r = await createSpontanTermin(input)
      if (!r.ok) {
        setError(r.error ?? 'Fehler beim Anlegen')
        return
      }
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-claimondo-navy/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-claimondo-border shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border sticky top-0 bg-white">
          <h2 className="text-sm font-semibold text-claimondo-navy">Spontan-Termin</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-claimondo-bg flex items-center justify-center"
          >
            <XIcon className="w-4 h-4 text-claimondo-navy" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <Section title="Kunde">
            <div className="grid grid-cols-2 gap-2">
              <Input label="Vorname *" value={vorname} onChange={setVorname} />
              <Input label="Nachname *" value={nachname} onChange={setNachname} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Telefon *" value={telefon} onChange={setTelefon} type="tel" />
              <Input label="Email" value={email} onChange={setEmail} type="email" />
            </div>
          </Section>

          <Section title="Besichtigungsort">
            <Input
              label="Adresse"
              value={adresse}
              onChange={setAdresse}
              placeholder="Musterstraße 1, 12345 Musterstadt"
            />
            {geocoding && <p className="text-[11px] text-claimondo-ondo">Geocodiere …</p>}
            {!geocoding && geocode && (
              <div className="flex items-start gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                <MapPinIcon className="w-3 h-3 mt-0.5 shrink-0" />
                <span>{geocode.label}</span>
              </div>
            )}
            {!geocoding && adresse.length >= 5 && !geocode && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                <AlertTriangleIcon className="w-3 h-3 mt-0.5 shrink-0" />
                <span>Adresse nicht gefunden — Lead wird ohne Koordinaten angelegt.</span>
              </div>
            )}
          </Section>

          <Section title="Termin">
            <div className="grid grid-cols-3 gap-2">
              <Input label="Datum" value={date} onChange={setDate} type="date" />
              <Input label="Uhrzeit" value={time} onChange={setTime} type="time" />
              <div>
                <label className="block text-[11px] text-claimondo-ondo mb-1">Dauer</label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-xs border border-claimondo-border rounded bg-white"
                >
                  <option value={30}>30 Min</option>
                  <option value={45}>45 Min</option>
                  <option value={60}>60 Min</option>
                  <option value={90}>90 Min</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-claimondo-ondo mb-1">Sachverständiger *</label>
              <select
                value={svId}
                onChange={(e) => setSvId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-claimondo-border rounded bg-white"
              >
                <option value="">– Bitte wählen –</option>
                {svList.map((sv) => (
                  <option key={sv.id} value={sv.id}>
                    {sv.name}
                    {sv.standort ? ` · ${sv.standort}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </Section>

          <Section title="Onboarding-Link an Kunde">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { v: 'whatsapp', l: 'WhatsApp' },
                  { v: 'sms', l: 'SMS' },
                  { v: 'email', l: 'Email' },
                  { v: 'kein', l: 'Kein Versand' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setFlowlinkKanal(opt.v)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border ${
                    flowlinkKanal === opt.v
                      ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                      : 'bg-white text-claimondo-navy border-claimondo-border hover:border-claimondo-ondo/50'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </Section>

          {error && (
            <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-claimondo-border sticky bottom-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-claimondo-navy hover:bg-claimondo-bg"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-claimondo-ondo text-white text-xs font-medium hover:bg-claimondo-shield disabled:opacity-50"
          >
            <CheckCircleIcon className="w-3.5 h-3.5" />
            {pending ? 'Lege an …' : 'Termin reservieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium">{title}</p>
      {children}
    </div>
  )
}

function Input({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[11px] text-claimondo-ondo mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 text-xs border border-claimondo-border rounded bg-white text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:outline-none focus:border-claimondo-ondo"
      />
    </div>
  )
}
