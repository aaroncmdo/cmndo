'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox'
import type { Map as MapboxMap, Marker, LngLatLike } from 'mapbox-gl'
import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import type { AktiverSV, SvLead } from '@/lib/actions/gutachter-finder-actions'
import {
  MapPin, X, ChevronRight, ChevronLeft, Loader2, Check,
  Car, Calendar, PenLine, Shield, Phone, Mail, User, ArrowRight,
} from 'lucide-react'

// ——— Typen ———
type Step =
  | 'hero'
  | 'standort'
  | 'schadentyp'
  | 'kontakt'
  | 'termin'
  | 'signatur'
  | 'matching'
  | 'bestaetigung'

type Schadentyp = 'auffahrunfall' | 'parkschaden' | 'kreuzung' | 'wildschaden' | 'sonstiges'

type FormData = {
  vorname: string
  nachname: string
  email: string
  telefon: string
  kennzeichen: string
  fahrzeug_beschreibung: string
  schadentyp: Schadentyp | ''
  schadenort: string
  schadenort_lat: number | null
  schadenort_lng: number | null
  wunschtermin: string
  wunschzeit: string
}

type MatchResult = {
  typ: 'sv' | 'lead'
  sv?: AktiverSV
  lead?: SvLead
  distanzKm: number
}

// ——— Hilfsfunktionen ———

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function pointInPolygon(
  lat: number,
  lng: number,
  polygon: Array<{ lat: number; lng: number }>,
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat
    const xj = polygon[j].lng, yj = polygon[j].lat
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function matchesSV(
  kundeLatLng: { lat: number; lng: number },
  svs: AktiverSV[],
): MatchResult | null {
  for (const sv of svs) {
    if (!sv.isochrone_polygon || !sv.standort_lat || !sv.standort_lng) continue
    let poly: Array<{ lat: number; lng: number }> = []
    try {
      const raw = sv.isochrone_polygon as unknown
      if (Array.isArray(raw)) poly = raw as Array<{ lat: number; lng: number }>
    } catch {
      continue
    }
    if (poly.length < 3) continue
    if (pointInPolygon(kundeLatLng.lat, kundeLatLng.lng, poly)) {
      return {
        typ: 'sv',
        sv,
        distanzKm: haversineKm(kundeLatLng.lat, kundeLatLng.lng, sv.standort_lat, sv.standort_lng),
      }
    }
  }
  return null
}

function matchesNearestLead(
  kundeLatLng: { lat: number; lng: number },
  leads: SvLead[],
): MatchResult | null {
  if (leads.length === 0) return null
  let best: SvLead | null = null
  let bestDist = Infinity
  for (const lead of leads) {
    const d = haversineKm(kundeLatLng.lat, kundeLatLng.lng, lead.lat, lead.lng)
    if (d < bestDist) { bestDist = d; best = lead }
  }
  if (!best) return null
  return { typ: 'lead', lead: best, distanzKm: bestDist }
}

// ——— Termin-Slots (leads haben immer freie Slots) ———
function generateTerminSlots(days = 5): string[] {
  const slots: string[] = []
  const now = new Date()
  for (let d = 1; d <= days; d++) {
    const date = new Date(now)
    date.setDate(date.getDate() + d)
    if (date.getDay() === 0 || date.getDay() === 6) continue
    slots.push(date.toISOString().split('T')[0])
    if (slots.length >= 3) break
  }
  return slots
}

const TERMIN_UHRZEITEN = ['08:00', '10:00', '12:00', '14:00', '16:00']

const SCHADENTYPEN: { value: Schadentyp; label: string; icon: string }[] = [
  { value: 'auffahrunfall', label: 'Auffahrunfall', icon: '🚗' },
  { value: 'parkschaden', label: 'Parkschaden', icon: '🅿️' },
  { value: 'kreuzung', label: 'Kreuzungsunfall', icon: '🔀' },
  { value: 'wildschaden', label: 'Wildschaden', icon: '🦌' },
  { value: 'sonstiges', label: 'Sonstiger Schaden', icon: '⚠️' },
]

// ——— Haupt-Komponente ———
type Props = {
  aktiveSVs: AktiverSV[]
  svLeads: SvLead[]
}

export function GutachterFinderClient({ aktiveSVs, svLeads }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const kundeMarkerRef = useRef<Marker | null>(null)
  const isochroneLayersRef = useRef<string[]>([])
  const leadMarkersRef = useRef<Marker[]>([])
  const signaturCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)

  const [step, setStep] = useState<Step>('hero')
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [kundeLatLng, setKundeLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [anfrageId, setAnfrageId] = useState<string | null>(null)
  const [signaturDataUrl, setSignaturDataUrl] = useState<string | null>(null)
  const [hasSignatur, setHasSignatur] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string>('')
  const [selectedZeit, setSelectedZeit] = useState<string>('')
  const [panelOpen, setPanelOpen] = useState(true)

  const terminSlots = generateTerminSlots()

  const [formData, setFormData] = useState<FormData>({
    vorname: '',
    nachname: '',
    email: '',
    telefon: '',
    kennzeichen: '',
    fahrzeug_beschreibung: '',
    schadentyp: '',
    schadenort: '',
    schadenort_lat: null,
    schadenort_lng: null,
    wunschtermin: '',
    wunschzeit: '',
  })

  // ——— Karte initialisieren ———
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return
    if (!ensureMapboxInitialized()) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [6.9603, 50.9333],
      zoom: 10,
      pitch: 30,
      bearing: 0,
      attributionControl: false,
    })

    map.on('load', () => {
      // 3D-Gebäude
      const layers = map.getStyle().layers
      const labelLayer = layers.find(
        (l) => l.type === 'symbol' && (l.layout as Record<string, unknown>)?.['text-field'],
      )
      map.addLayer(
        {
          id: 'add-3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          filter: ['==', 'extrude', 'true'],
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#0D1B3E',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.6,
          },
        },
        labelLayer?.id,
      )

      // Isochrone-Polygone der aktiven SVs zeichnen
      drawIsochronePolygons(map)

      // SV-Lead-Marker zeichnen
      drawLeadMarkers(map)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function drawIsochronePolygons(map: MapboxMap) {
    aktiveSVs.forEach((sv, i) => {
      if (!sv.isochrone_polygon) return
      let poly: Array<{ lat: number; lng: number }> = []
      try {
        const raw = sv.isochrone_polygon as unknown
        if (Array.isArray(raw)) poly = raw as Array<{ lat: number; lng: number }>
      } catch { return }
      if (poly.length < 3) return

      const coords = poly.map((p) => [p.lng, p.lat])
      const sourceId = `sv-iso-${i}`
      const fillId = `sv-iso-fill-${i}`
      const lineId = `sv-iso-line-${i}`

      if (map.getSource(sourceId)) return

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Polygon', coordinates: [coords] },
        },
      })
      map.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': '#4573A2',
          'fill-opacity': 0.12,
        },
      })
      map.addLayer({
        id: lineId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#7BA3CC',
          'line-width': 1.5,
          'line-opacity': 0.7,
          'line-dasharray': [4, 2],
        },
      })
      isochroneLayersRef.current.push(fillId, lineId, sourceId)
    })
  }

  function drawLeadMarkers(map: MapboxMap) {
    leadMarkersRef.current.forEach((m) => m.remove())
    leadMarkersRef.current = []
    svLeads.forEach((lead) => {
      const el = document.createElement('div')
      el.className = 'sv-lead-marker'
      el.style.cssText = `
        width:12px;height:12px;border-radius:50%;
        background:#4573A2;border:2px solid #7BA3CC;
        box-shadow:0 0 8px rgba(69,115,162,0.6);
        cursor:pointer;
      `
      const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lead.lng, lead.lat])
        .addTo(map)
      leadMarkersRef.current.push(m)
    })
  }

  // ——— Standort-Abfrage ———
  const requestLocation = useCallback(() => {
    setLocationLoading(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        setKundeLatLng({ lat, lng })
        setFormData((p) => ({ ...p, schadenort_lat: lat, schadenort_lng: lng }))

        if (mapRef.current) {
          kundeMarkerRef.current?.remove()
          const el = document.createElement('div')
          el.style.cssText = `
            width:20px;height:20px;border-radius:50%;
            background:#4573A2;border:3px solid #fff;
            box-shadow:0 0 0 6px rgba(69,115,162,0.25),0 0 0 12px rgba(69,115,162,0.1);
          `
          kundeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(mapRef.current)
          mapRef.current.flyTo({ center: [lng, lat], zoom: 12, duration: 1200, pitch: 45 })
        }
        setLocationLoading(false)
        setStep('schadentyp')
      },
      (err) => {
        setLocationLoading(false)
        setLocationError(
          err.code === 1
            ? 'Standortzugriff verweigert. Bitte in den Browser-Einstellungen aktivieren.'
            : 'Standort konnte nicht ermittelt werden.',
        )
      },
      { timeout: 10000, enableHighAccuracy: true },
    )
  }, [])

  // ——— Matching-Logik ———
  const runMatching = useCallback(() => {
    if (!kundeLatLng) return
    setStep('matching')
    setTimeout(() => {
      const svMatch = matchesSV(kundeLatLng, aktiveSVs)
      if (svMatch) {
        setMatchResult(svMatch)
      } else {
        const leadMatch = matchesNearestLead(kundeLatLng, svLeads)
        setMatchResult(leadMatch)
      }
      setStep('bestaetigung')
    }, 2200)
  }, [kundeLatLng, aktiveSVs, svLeads])

  // ——— Signatur-Canvas ———
  const initCanvas = useCallback(() => {
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#0D1B3E'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    setHasSignatur(false)
    setSignaturDataUrl(null)
  }, [])

  useEffect(() => {
    if (step === 'signatur') {
      setTimeout(initCanvas, 100)
    }
  }, [step, initCanvas])

  const startDrawing = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    canvas.setPointerCapture(e.pointerId)
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }, [])

  const draw = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
    setHasSignatur(true)
  }, [])

  const endDrawing = useCallback(() => {
    isDrawingRef.current = false
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    setSignaturDataUrl(canvas.toDataURL('image/png'))
  }, [])

  // ——— Submit ———
  const handleSubmit = useCallback(async () => {
    if (!matchResult) return
    setSubmitting(true)
    const wunschtermin =
      selectedTag && selectedZeit
        ? new Date(`${selectedTag}T${selectedZeit}:00`).toISOString()
        : undefined

    const result = await erstelleGutachterFinderAnfrage({
      vorname: formData.vorname,
      nachname: formData.nachname,
      email: formData.email,
      telefon: formData.telefon || undefined,
      kennzeichen: formData.kennzeichen || undefined,
      fahrzeug_beschreibung: formData.fahrzeug_beschreibung || undefined,
      schadentyp: formData.schadentyp || 'sonstiges',
      schadenort: formData.schadenort || undefined,
      schadenort_lat: kundeLatLng?.lat,
      schadenort_lng: kundeLatLng?.lng,
      wunschtermin,
      zugeordneter_sv_id: matchResult.typ === 'sv' ? matchResult.sv?.id : undefined,
      zugeordneter_sv_lead_id: matchResult.typ === 'lead' ? matchResult.lead?.id : undefined,
      matching_typ: matchResult.typ === 'sv' ? 'polygon' : 'naechster_lead',
      sa_signatur_data_url: signaturDataUrl ?? undefined,
    })

    setSubmitting(false)
    if (result.ok) {
      setAnfrageId(result.id)
      setStep('bestaetigung')
    }
  }, [matchResult, formData, kundeLatLng, selectedTag, selectedZeit, signaturDataUrl])

  // ——— Formular-Hilfsfunktion ———
  const setField = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setFormData((p) => ({ ...p, [key]: value }))

  const canProceedKontakt =
    formData.vorname.trim() !== '' &&
    formData.nachname.trim() !== '' &&
    formData.email.includes('@')

  // ——— Render ———
  return (
    <div className="relative w-full overflow-hidden" style={{ height: '100dvh' }}>
      {/* Karte */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* Attributions */}
      <div className="absolute bottom-2 right-2 z-10 text-[10px] text-white/30">
        © Mapbox © OpenStreetMap
      </div>

      {/* Panel-Toggle auf Mobile */}
      {step !== 'hero' && (
        <button
          onClick={() => setPanelOpen((p) => !p)}
          className="absolute top-4 right-4 z-30 rounded-full bg-claimondo-navy/80 p-2 shadow-lg backdrop-blur-sm lg:hidden"
        >
          {panelOpen ? <X size={18} className="text-white" /> : <MapPin size={18} className="text-white" />}
        </button>
      )}

      {/* Slide-Panel */}
      <div
        className={`
          absolute inset-y-0 left-0 z-20 flex w-full flex-col overflow-hidden
          bg-claimondo-navy shadow-2xl transition-transform duration-500
          lg:w-[420px] lg:translate-x-0 lg:rounded-r-2xl
          ${panelOpen ? 'translate-x-0' : '-translate-x-full'}
          ${step === 'hero' ? 'lg:w-full lg:bg-transparent' : ''}
        `}
      >
        {step === 'hero' && <HeroPanel onStart={() => setStep('standort')} />}
        {step === 'standort' && (
          <StandortPanel
            loading={locationLoading}
            error={locationError}
            onRequestLocation={requestLocation}
            onBack={() => setStep('hero')}
          />
        )}
        {step === 'schadentyp' && (
          <SchadentypPanel
            value={formData.schadentyp}
            onChange={(v) => setField('schadentyp', v)}
            onNext={() => setStep('kontakt')}
            onBack={() => setStep('standort')}
          />
        )}
        {step === 'kontakt' && (
          <KontaktPanel
            formData={formData}
            onChange={setField}
            canProceed={canProceedKontakt}
            onNext={() => setStep('termin')}
            onBack={() => setStep('schadentyp')}
          />
        )}
        {step === 'termin' && (
          <TerminPanel
            slots={terminSlots}
            zeiten={TERMIN_UHRZEITEN}
            selectedTag={selectedTag}
            selectedZeit={selectedZeit}
            onSelectTag={setSelectedTag}
            onSelectZeit={setSelectedZeit}
            onNext={() => setStep('signatur')}
            onBack={() => setStep('kontakt')}
          />
        )}
        {step === 'signatur' && (
          <SignaturPanel
            canvasRef={signaturCanvasRef}
            hasSignatur={hasSignatur}
            onStartDrawing={startDrawing}
            onDraw={draw}
            onEndDrawing={endDrawing}
            onClear={initCanvas}
            onNext={runMatching}
            onBack={() => setStep('termin')}
          />
        )}
        {step === 'matching' && <MatchingPanel />}
        {step === 'bestaetigung' && matchResult && (
          <BestaetigungPanel
            matchResult={matchResult}
            formData={formData}
            selectedTag={selectedTag}
            selectedZeit={selectedZeit}
            anfrageId={anfrageId}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        )}
      </div>
    </div>
  )
}

// ——— Unterkomponenten ———

function HeroPanel({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div
        className="
          mx-auto max-w-lg rounded-2xl p-8
          bg-claimondo-navy/90 backdrop-blur-xl shadow-2xl border border-white/10
          lg:mx-8
        "
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-claimondo-ondo">
            <Shield size={20} className="text-white" />
          </div>
          <span className="font-montserrat text-sm font-semibold uppercase tracking-widest text-claimondo-light-blue">
            Claimondo
          </span>
        </div>
        <h1 className="font-montserrat text-3xl font-bold leading-tight text-white lg:text-4xl">
          Gutachter
          <br />
          <span className="text-claimondo-light-blue">in Ihrer Nähe</span>
          <br />
          finden
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-white/60">
          Zertifizierter Kfz-Sachverständiger, digitale Schadensaufnahme und
          rechtssichere Unterzeichnung — direkt vor Ort. Kostenlos für Sie.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {['Sofort-Matching in Ihrer Region', 'Digitale SA-Unterzeichnung', 'Auftragsbestätigung per E-Mail'].map(
            (f) => (
              <div key={f} className="flex items-center gap-2 text-sm text-white/70">
                <Check size={14} className="text-claimondo-light-blue shrink-0" />
                {f}
              </div>
            ),
          )}
        </div>
        <button
          onClick={onStart}
          className="
            mt-8 w-full rounded-xl bg-claimondo-ondo px-6 py-3.5 text-sm
            font-montserrat font-semibold text-white shadow-lg
            transition-all hover:bg-claimondo-shield active:scale-95
            flex items-center justify-center gap-2
          "
        >
          Jetzt Gutachter finden <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}

function StandortPanel({
  loading,
  error,
  onRequestLocation,
  onBack,
}: {
  loading: boolean
  error: string | null
  onRequestLocation: () => void
  onBack: () => void
}) {
  return (
    <PanelShell title="Ihren Standort freigeben" step={1} totalSteps={5} onBack={onBack}>
      <p className="text-sm text-white/60 leading-relaxed">
        Wir ermitteln Ihren genauen Standort, um den nächsten zertifizierten
        Gutachter in Ihrer Nähe zu finden.
      </p>
      {error && (
        <div className="mt-4 rounded-lg bg-red-900/30 border border-red-500/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <button
        onClick={onRequestLocation}
        disabled={loading}
        className="
          mt-6 w-full rounded-xl bg-claimondo-ondo px-6 py-3.5 text-sm
          font-montserrat font-semibold text-white
          transition-all hover:bg-claimondo-shield active:scale-95
          disabled:opacity-50 flex items-center justify-center gap-2
        "
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" /> Standort wird ermittelt…</>
        ) : (
          <><MapPin size={16} /> Standort freigeben</>
        )}
      </button>
    </PanelShell>
  )
}

function SchadentypPanel({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: Schadentyp | ''
  onChange: (v: Schadentyp) => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <PanelShell title="Art des Schadens" step={2} totalSteps={5} onBack={onBack}>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {SCHADENTYPEN.map((s) => (
          <button
            key={s.value}
            onClick={() => onChange(s.value)}
            className={`
              flex flex-col items-center gap-2 rounded-xl border p-4 text-sm
              font-montserrat font-medium transition-all
              ${
                value === s.value
                  ? 'border-claimondo-ondo bg-claimondo-ondo/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30 hover:text-white'
              }
            `}
          >
            <span className="text-2xl">{s.icon}</span>
            {s.label}
          </button>
        ))}
      </div>
      <PanelNextButton onClick={onNext} disabled={!value} />
    </PanelShell>
  )
}

function KontaktPanel({
  formData,
  onChange,
  canProceed,
  onNext,
  onBack,
}: {
  formData: FormData
  onChange: <K extends keyof FormData>(key: K, value: FormData[K]) => void
  canProceed: boolean
  onNext: () => void
  onBack: () => void
}) {
  return (
    <PanelShell title="Ihre Kontaktdaten" step={3} totalSteps={5} onBack={onBack}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <PanelInput
            label="Vorname"
            value={formData.vorname}
            onChange={(v) => onChange('vorname', v)}
            icon={<User size={14} />}
          />
          <PanelInput
            label="Nachname"
            value={formData.nachname}
            onChange={(v) => onChange('nachname', v)}
            icon={<User size={14} />}
          />
        </div>
        <PanelInput
          label="E-Mail"
          type="email"
          value={formData.email}
          onChange={(v) => onChange('email', v)}
          icon={<Mail size={14} />}
        />
        <PanelInput
          label="Telefon (optional)"
          type="tel"
          value={formData.telefon}
          onChange={(v) => onChange('telefon', v)}
          icon={<Phone size={14} />}
        />
        <PanelInput
          label="Kennzeichen (optional)"
          value={formData.kennzeichen}
          onChange={(v) => onChange('kennzeichen', v)}
          icon={<Car size={14} />}
          placeholder="z. B. K-AB 1234"
        />
      </div>
      <PanelNextButton onClick={onNext} disabled={!canProceed} />
    </PanelShell>
  )
}

function TerminPanel({
  slots,
  zeiten,
  selectedTag,
  selectedZeit,
  onSelectTag,
  onSelectZeit,
  onNext,
  onBack,
}: {
  slots: string[]
  zeiten: string[]
  selectedTag: string
  selectedZeit: string
  onSelectTag: (v: string) => void
  onSelectZeit: (v: string) => void
  onNext: () => void
  onBack: () => void
}) {
  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit' })

  return (
    <PanelShell title="Wunschtermin wählen" step={4} totalSteps={5} onBack={onBack}>
      <p className="text-xs text-white/50">Tag auswählen</p>
      <div className="mt-2 flex flex-col gap-2">
        {slots.map((s) => (
          <button
            key={s}
            onClick={() => onSelectTag(s)}
            className={`
              rounded-lg border px-4 py-2.5 text-sm font-medium transition-all text-left
              ${
                selectedTag === s
                  ? 'border-claimondo-ondo bg-claimondo-ondo/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
              }
            `}
          >
            <Calendar size={14} className="inline mr-2 opacity-60" />
            {formatDay(s)}
          </button>
        ))}
      </div>
      {selectedTag && (
        <>
          <p className="mt-4 text-xs text-white/50">Uhrzeit auswählen</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {zeiten.map((z) => (
              <button
                key={z}
                onClick={() => onSelectZeit(z)}
                className={`
                  rounded-lg border py-2 text-sm font-medium transition-all
                  ${
                    selectedZeit === z
                      ? 'border-claimondo-ondo bg-claimondo-ondo/20 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/30'
                  }
                `}
              >
                {z} Uhr
              </button>
            ))}
          </div>
        </>
      )}
      <PanelNextButton onClick={onNext} disabled={!selectedTag || !selectedZeit} />
    </PanelShell>
  )
}

function SignaturPanel({
  canvasRef,
  hasSignatur,
  onStartDrawing,
  onDraw,
  onEndDrawing,
  onClear,
  onNext,
  onBack,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  hasSignatur: boolean
  onStartDrawing: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onDraw: (e: React.PointerEvent<HTMLCanvasElement>) => void
  onEndDrawing: () => void
  onClear: () => void
  onNext: () => void
  onBack: () => void
}) {
  return (
    <PanelShell title="Schadensaufnahme unterzeichnen" step={5} totalSteps={5} onBack={onBack}>
      <p className="text-xs text-white/50 leading-relaxed">
        Mit Ihrer Unterschrift beauftragen Sie die Schadensaufnahme durch einen
        zertifizierten Sachverständigen. Die Kosten trägt die gegnerische Versicherung.
      </p>
      <div className="mt-4 rounded-xl border border-white/20 bg-white overflow-hidden">
        <div className="px-3 py-1.5 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-montserrat">Unterschrift</span>
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600 underline">
            Löschen
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={360}
          height={140}
          className="w-full touch-none cursor-crosshair"
          onPointerDown={onStartDrawing}
          onPointerMove={onDraw}
          onPointerUp={onEndDrawing}
          onPointerLeave={onEndDrawing}
        />
      </div>
      {!hasSignatur && (
        <p className="mt-2 text-center text-xs text-claimondo-light-blue/70">
          <PenLine size={12} className="inline mr-1" />
          Bitte im weißen Feld unterschreiben
        </p>
      )}
      <div className="mt-4 rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-xs text-white/50 leading-relaxed">
        Mit der Unterschrift erkläre ich mich einverstanden, dass Claimondo
        in meinem Namen einen Kfz-Sachverständigen beauftragt. Die Kosten
        trägt die Haftpflichtversicherung des Unfallgegners.
      </div>
      <PanelNextButton
        onClick={onNext}
        disabled={!hasSignatur}
        label="Gutachter jetzt suchen"
      />
    </PanelShell>
  )
}

function MatchingPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center bg-claimondo-navy">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-claimondo-ondo/30 animate-ping absolute inset-0" />
        <div className="h-16 w-16 rounded-full border-2 border-claimondo-ondo/60 animate-pulse" />
        <Shield className="absolute inset-0 m-auto text-claimondo-light-blue" size={28} />
      </div>
      <div>
        <h3 className="font-montserrat text-xl font-bold text-white">
          Besten Gutachter suchen…
        </h3>
        <p className="mt-2 text-sm text-white/50">
          Wir prüfen alle Sachverständigen in Ihrer Region.
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {['Standort analysiert', 'Verfügbarkeiten geprüft', 'Besten Match ermitteln…'].map(
          (t, i) => (
            <div key={t} className="flex items-center gap-3 text-sm">
              <div
                className={`h-5 w-5 rounded-full flex items-center justify-center ${
                  i < 2 ? 'bg-claimondo-ondo' : 'bg-white/10 animate-pulse'
                }`}
              >
                {i < 2 && <Check size={10} className="text-white" />}
              </div>
              <span className={i < 2 ? 'text-white/70' : 'text-white/40'}>{t}</span>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function BestaetigungPanel({
  matchResult,
  formData,
  selectedTag,
  selectedZeit,
  anfrageId,
  submitting,
  onSubmit,
}: {
  matchResult: MatchResult
  formData: FormData
  selectedTag: string
  selectedZeit: string
  anfrageId: string | null
  submitting: boolean
  onSubmit: () => void
}) {
  const name =
    matchResult.typ === 'sv'
      ? matchResult.sv?.firmenname ?? 'Ihr Gutachter'
      : matchResult.lead?.name ?? 'Ihr Gutachter'
  const ort =
    matchResult.typ === 'sv'
      ? null
      : matchResult.lead?.ort ?? null

  if (anfrageId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center bg-claimondo-navy">
        <div className="h-16 w-16 rounded-full bg-claimondo-ondo/20 flex items-center justify-center">
          <Check size={32} className="text-claimondo-ondo" />
        </div>
        <div>
          <h3 className="font-montserrat text-2xl font-bold text-white">
            Auftrag bestätigt!
          </h3>
          <p className="mt-2 text-sm text-white/60 leading-relaxed">
            {name} wird sich in Kürze bei Ihnen melden.
            Eine Bestätigung wurde an <span className="text-white">{formData.email}</span> gesendet.
          </p>
        </div>
        <div className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
          <p className="font-medium text-white">{name}</p>
          {ort && <p className="text-xs text-white/50 mt-0.5">{ort}</p>}
          <p className="mt-2 text-xs text-white/50">
            Termin: {selectedTag && new Date(selectedTag).toLocaleDateString('de-DE')} um {selectedZeit} Uhr
          </p>
          <p className="mt-1 text-xs text-white/30">Auftrags-ID: {anfrageId.slice(0, 8).toUpperCase()}</p>
        </div>
        <a
          href="/"
          className="text-sm text-claimondo-light-blue underline underline-offset-2"
        >
          Zurück zur Startseite
        </a>
      </div>
    )
  }

  return (
    <PanelShell title="Ihr Gutachter" onBack={undefined}>
      <div className="rounded-xl border border-claimondo-ondo/40 bg-claimondo-ondo/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-claimondo-ondo">
            <Shield size={18} className="text-white" />
          </div>
          <div>
            <p className="font-montserrat font-semibold text-white">{name}</p>
            {ort && <p className="text-xs text-white/50">{ort}</p>}
            <p className="text-xs text-white/50 mt-1">
              {matchResult.distanzKm.toFixed(1)} km entfernt
              {matchResult.typ === 'sv' && ' · In Ihrem Gebiet'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
        <p className="text-xs font-medium text-white/40 uppercase tracking-wider">Zusammenfassung</p>
        <Row label="Name" value={`${formData.vorname} ${formData.nachname}`} />
        <Row label="Schaden" value={SCHADENTYPEN.find((s) => s.value === formData.schadentyp)?.label ?? '—'} />
        {selectedTag && selectedZeit && (
          <Row
            label="Termin"
            value={`${new Date(selectedTag).toLocaleDateString('de-DE')} · ${selectedZeit} Uhr`}
          />
        )}
        <Row label="E-Mail" value={formData.email} />
      </div>

      <button
        onClick={onSubmit}
        disabled={submitting}
        className="
          mt-6 w-full rounded-xl bg-claimondo-ondo px-6 py-3.5 text-sm
          font-montserrat font-semibold text-white shadow-lg
          transition-all hover:bg-claimondo-shield active:scale-95
          disabled:opacity-50 flex items-center justify-center gap-2
        "
      >
        {submitting ? (
          <><Loader2 size={16} className="animate-spin" /> Auftrag wird übermittelt…</>
        ) : (
          <><Check size={16} /> Auftrag jetzt bestätigen</>
        )}
      </button>
      <p className="mt-3 text-center text-xs text-white/30">
        Mit dem Klick erteilen Sie den Auftrag verbindlich.
      </p>
    </PanelShell>
  )
}

// ——— Gemeinsame Sub-Komponenten ———

function PanelShell({
  title,
  step,
  totalSteps,
  onBack,
  children,
}: {
  title: string
  step?: number
  totalSteps?: number
  onBack?: (() => void) | undefined
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-claimondo-navy p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          >
            <ChevronLeft size={16} className="text-white" />
          </button>
        )}
        <div className="flex-1">
          {step !== undefined && totalSteps !== undefined && (
            <div className="mb-1 flex gap-1">
              {Array.from({ length: totalSteps }).map((_, i) => (
                <div
                  key={i}
                  className={`h-0.5 flex-1 rounded-full transition-colors ${
                    i < step ? 'bg-claimondo-ondo' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          )}
          <h2 className="font-montserrat text-lg font-bold text-white">{title}</h2>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function PanelInput({
  label,
  value,
  onChange,
  type = 'text',
  icon,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  icon?: React.ReactNode
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-white/40">{label}</label>
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="
            w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white
            placeholder-white/20 outline-none
            focus:border-claimondo-ondo focus:ring-1 focus:ring-claimondo-ondo/30
            transition-colors
          "
          style={{ paddingLeft: icon ? '2.25rem' : undefined }}
        />
      </div>
    </div>
  )
}

function PanelNextButton({
  onClick,
  disabled,
  label = 'Weiter',
}: {
  onClick: () => void
  disabled: boolean
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="
        mt-6 w-full rounded-xl bg-claimondo-ondo px-6 py-3.5 text-sm
        font-montserrat font-semibold text-white shadow-lg
        transition-all hover:bg-claimondo-shield active:scale-95
        disabled:opacity-30 flex items-center justify-center gap-2
      "
    >
      {label} <ChevronRight size={16} />
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between text-sm">
      <span className="text-white/40">{label}</span>
      <span className="text-white font-medium">{value}</span>
    </div>
  )
}
