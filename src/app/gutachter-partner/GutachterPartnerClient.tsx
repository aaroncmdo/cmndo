'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckIcon, MapPinIcon, ShieldCheckIcon, ClockIcon, ChevronRightIcon, LoaderIcon } from 'lucide-react'
import { eintragenAufWarteliste } from './actions'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

type Coord = { lat: number; lng: number }

// Geocodiert eine PLZ → Koordinaten via Mapbox
async function geocodePlz(plz: string): Promise<Coord | null> {
  if (!MAPBOX_TOKEN || !/^\d{5}$/.test(plz)) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(plz + ' Deutschland')}.json?country=de&types=postcode,place&access_token=${MAPBOX_TOKEN}&limit=1`,
    )
    const json = await res.json() as { features?: Array<{ center: [number, number] }> }
    const f = json.features?.[0]
    if (!f) return null
    return { lat: f.center[1], lng: f.center[0] }
  } catch { return null }
}

// Berechnet Isochrone oder fällt auf Kreis zurück
async function fetchIsochrone(coord: Coord, radiusKm: number): Promise<[number, number][] | null> {
  if (!MAPBOX_TOKEN) return null
  try {
    const res = await fetch(
      `https://api.mapbox.com/isochrone/v1/mapbox/driving/${coord.lng},${coord.lat}?contours_minutes=${Math.round(radiusKm * 1.5)}&polygons=true&access_token=${MAPBOX_TOKEN}`,
    )
    const json = await res.json() as { features?: Array<{ geometry: { coordinates: [number, number][][] } }> }
    return json.features?.[0]?.geometry?.coordinates?.[0] ?? null
  } catch { return null }
}

function flächeKm2(radiusKm: number): number {
  return Math.round(Math.PI * radiusKm * radiusKm)
}

// Checkbox-Qualifikations-Auswahl
const QUALI_OPTIONS = [
  { value: 'dat_expert', label: 'DAT-Expert-Nr.' },
  { value: 'bvsk', label: 'BVSK-Mitglieds-Nr.' },
  { value: 'ihk', label: 'IHK-Zertifikat' },
  { value: 'oebuv', label: 'öbuv-Bestellungs-Nr.' },
]

export default function GutachterPartnerClient() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)

  const [form, setForm] = useState({
    vorname: '', nachname: '', email: '', telefon: '',
    plz: '', firma: '', jahre_erfahrung: '', auftraege_monat: '',
    fachschwerpunkte: '', dat_expert_nr: '', bvsk_nr: '', oebuv_nr: '',
  })
  const [qualifikationen, setQualifikationen] = useState<string[]>([])
  const [ihkZertifikat, setIhkZertifikat] = useState(false)
  const [radiusKm] = useState(30)
  const [coord, setCoord] = useState<Coord | null>(null)
  const [ortLabel, setOrtLabel] = useState('')
  const [pending, setPending] = useState(false)
  const [done, setDone] = useState(false)
  const [fehler, setFehler] = useState('')
  const [mapReady, setMapReady] = useState(false)

  // Mapbox initialisieren
  useEffect(() => {
    if (!mapContainer.current || !MAPBOX_TOKEN) return
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN
      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [10.4515, 51.1657],
        zoom: 5.5,
        attributionControl: false,
      })
      map.addControl(new mapboxgl.AttributionControl({ compact: true }))
      map.on('load', () => {
        map.addSource('radius-fill', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius-fill', paint: { 'fill-color': '#0D1B3E', 'fill-opacity': 0.12 } })
        map.addLayer({ id: 'radius-stroke', type: 'line', source: 'radius-fill', paint: { 'line-color': '#4573A2', 'line-width': 2, 'line-dasharray': [4, 2] } })
        mapRef.current = map
        setMapReady(true)
      })
      return () => { map.remove() }
    })
  }, [])

  // PLZ → Geocode → Karte updaten
  const updateMap = useCallback(async (plz: string) => {
    if (!mapReady || !mapRef.current) return
    const c = await geocodePlz(plz)
    if (!c) return
    setCoord(c)

    const map = mapRef.current
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (markerRef.current) markerRef.current.remove()
      markerRef.current = new mapboxgl.Marker({ color: '#0D1B3E' })
        .setLngLat([c.lng, c.lat])
        .addTo(map)
      map.flyTo({ center: [c.lng, c.lat], zoom: 9, duration: 1200 })
    })

    // Isochrone oder Kreis-Fallback
    const iso = await fetchIsochrone(c, radiusKm)
    const src = map.getSource('radius-fill') as mapboxgl.GeoJSONSource | undefined
    if (!src) return

    if (iso) {
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [iso] }, properties: {} }] })
    } else {
      // Kreis-Approximation als Fallback
      const pts: [number, number][] = []
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI
        const dlat = (radiusKm / 111) * Math.cos(angle)
        const dlng = (radiusKm / (111 * Math.cos(c.lat * Math.PI / 180))) * Math.sin(angle)
        pts.push([c.lng + dlng, c.lat + dlat])
      }
      src.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} }] })
    }
  }, [mapReady, radiusKm])

  // PLZ-Geocode + Ortsname
  useEffect(() => {
    const plz = form.plz
    if (!/^\d{5}$/.test(plz)) { setOrtLabel(''); setCoord(null); return }
    const t = setTimeout(async () => {
      if (!MAPBOX_TOKEN) return
      try {
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(plz + ' Deutschland')}.json?country=de&types=postcode,place&access_token=${MAPBOX_TOKEN}&limit=1`,
        )
        const json = await res.json() as { features?: Array<{ center: [number, number]; place_name?: string; text?: string }> }
        const f = json.features?.[0]
        if (f) {
          setOrtLabel(f.text ?? f.place_name?.split(',')[0] ?? '')
          setCoord({ lat: f.center[1], lng: f.center[0] })
          updateMap(plz)
        }
      } catch { /* ignore */ }
    }, 500)
    return () => clearTimeout(t)
  }, [form.plz, updateMap])

  function toggleQuali(val: string) {
    if (val === 'ihk') { setIhkZertifikat(v => !v); return }
    setQualifikationen(prev => prev.includes(val) ? prev.filter(q => q !== val) : [...prev, val])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFehler('')
    if (!form.vorname || !form.nachname || !form.email || !form.plz) {
      setFehler('Bitte alle Pflichtfelder ausfüllen.')
      return
    }
    setPending(true)
    const result = await eintragenAufWarteliste({
      vorname: form.vorname,
      nachname: form.nachname,
      email: form.email,
      telefon: form.telefon || undefined,
      plz: form.plz,
      ort: ortLabel || undefined,
      lat: coord?.lat,
      lng: coord?.lng,
      qualifikationen: [...qualifikationen, ...(ihkZertifikat ? ['ihk'] : [])],
      dat_expert_nr: form.dat_expert_nr || undefined,
      bvsk_nr: form.bvsk_nr || undefined,
      ihk_zertifikat: ihkZertifikat,
      oebuv_nr: form.oebuv_nr || undefined,
      firma: form.firma || undefined,
      jahre_erfahrung: form.jahre_erfahrung ? parseInt(form.jahre_erfahrung) : undefined,
      auftraege_monat: form.auftraege_monat ? parseInt(form.auftraege_monat) : undefined,
      fachschwerpunkte: form.fachschwerpunkte || undefined,
      radius_km: radiusKm,
    })
    setPending(false)
    if (!result.ok) { setFehler(result.error); return }
    setDone(true)
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value })),
  })

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
          <CheckIcon className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-claimondo-navy mb-3 tracking-[-.024em]" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>Du stehst auf der Liste.</h2>
        <p className="text-claimondo-ondo max-w-sm">
          Sobald deine Region verfügbar ist, melden wir uns persönlich. Kein Spam, versprochen.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-claimondo-bg">
      {/* Hero */}
      <div className="bg-claimondo-navy text-white px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-6">
          <ShieldCheckIcon className="w-4 h-4 text-claimondo-light-blue" />
          Nur verifizierte Sachverständige
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4 max-w-2xl mx-auto">
          Werde Claimondo-Partner in deiner Region
        </h1>
        <p className="text-claimondo-light-blue max-w-xl mx-auto text-base leading-relaxed">
          Wir nehmen Partner regional gestaffelt auf — sobald deine Region dran ist, melden wir uns.
          Kein Marketing, kein Spam.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          {[
            { icon: ClockIcon, text: 'Aufträge direkt aus der Plattform' },
            { icon: ShieldCheckIcon, text: 'DAT + BVSK verifiziert' },
            { icon: MapPinIcon, text: 'Dein Gebiet, dein Radius' },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-white/70">
              <Icon className="w-4 h-4 text-claimondo-light-blue" />
              {text}
            </div>
          ))}
        </div>
      </div>

      {/* Formular + Karte */}
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Linke Seite — Formular */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-3xl shadow-claimondo-md p-6 space-y-4">
            <h2 className="text-base font-bold text-claimondo-navy tracking-[-.018em]">Persönliche Daten</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Vorname <span className="text-red-500">*</span></span>
                <input {...field('vorname')} required className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="Max" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Nachname <span className="text-red-500">*</span></span>
                <input {...field('nachname')} required className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="Mustermann" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">E-Mail <span className="text-red-500">*</span></span>
              <input {...field('email')} type="email" required className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="max@buero.de" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Telefon</span>
              <input {...field('telefon')} type="tel" className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="+49 221 …" />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">PLZ deines Standorts <span className="text-red-500">*</span></span>
              <input {...field('plz')} required maxLength={5} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="50670" />
              {ortLabel && (
                <p className="mt-1.5 text-xs text-claimondo-ondo flex items-center gap-1">
                  <MapPinIcon className="w-3 h-3" />
                  {ortLabel} — Karte rechts zeigt dein Gebiet
                </p>
              )}
            </label>
          </div>

          {/* Qualifikationen */}
          <div className="bg-white rounded-3xl shadow-claimondo-md p-6 space-y-4">
            <h2 className="text-base font-bold text-claimondo-navy tracking-[-.018em]">Qualifikation</h2>
            <div className="grid grid-cols-2 gap-2">
              {QUALI_OPTIONS.map(opt => {
                const checked = opt.value === 'ihk' ? ihkZertifikat : qualifikationen.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleQuali(opt.value)}
                    className={`flex items-center gap-2 rounded-2xl border-[1.5px] px-4 py-3 text-sm font-semibold tracking-[-.01em] text-left transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] ${
                      checked
                        ? 'border-claimondo-ondo bg-gradient-to-br from-claimondo-ondo/[0.06] to-claimondo-light-blue/[0.04] text-claimondo-navy shadow-claimondo-md'
                        : 'border-claimondo-navy/[0.08] bg-white text-claimondo-shield hover:border-claimondo-light-blue hover:-translate-y-[1px]'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${checked ? 'bg-claimondo-ondo border-claimondo-ondo' : 'border-claimondo-navy/20'}`}>
                      {checked && <CheckIcon className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                    </div>
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {/* Bedingte Nummern-Felder */}
            {qualifikationen.includes('dat_expert') && (
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">DAT-Expert-Nr.</span>
                <input {...field('dat_expert_nr')} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="z.B. DAT-12345" />
              </label>
            )}
            {qualifikationen.includes('bvsk') && (
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">BVSK-Mitglieds-Nr.</span>
                <input {...field('bvsk_nr')} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="z.B. BVSK-6789" />
              </label>
            )}
            {qualifikationen.includes('oebuv') && (
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">öbuv-Bestellungs-Nr.</span>
                <input {...field('oebuv_nr')} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="z.B. IHK-NW-001" />
              </label>
            )}
          </div>

          {/* Geschäft */}
          <div className="bg-white rounded-3xl shadow-claimondo-md p-6 space-y-4">
            <h2 className="text-base font-bold text-claimondo-navy tracking-[-.018em]">Geschäft <span className="text-xs font-normal text-[#8a93a6]">(optional)</span></h2>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Unternehmen / Büro</span>
              <input {...field('firma')} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="Mustermann Sachverständigenbüro GmbH" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Jahre Erfahrung</span>
                <input {...field('jahre_erfahrung')} type="number" min={0} max={50} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="10" />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Aufträge / Monat</span>
                <input {...field('auftraege_monat')} type="number" min={0} max={999} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="20" />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">Fachschwerpunkte</span>
              <input {...field('fachschwerpunkte')} className="w-full rounded-2xl border-[1.5px] border-transparent bg-claimondo-navy/[0.06] px-4 py-3 text-sm text-claimondo-navy placeholder:text-[#8a93a6] tracking-[-.01em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] hover:bg-claimondo-navy/[0.08] focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo" placeholder="z. B. E-Auto, Oldtimer, Lkw" />
            </label>
          </div>

          {fehler && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{fehler}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 bg-claimondo-ondo hover:bg-[#3a6291] text-white font-semibold rounded-full py-3.5 text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            {pending ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <>
                Auf die Warteliste setzen
                <ChevronRightIcon className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="text-xs text-center text-[#8a93a6] leading-relaxed">
            Mit dem Absenden bestätigst du, dass wir dich kontaktieren dürfen. Keine Datenweitergabe an Dritte.
          </p>
        </form>

        {/* Rechte Seite — Karte */}
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="bg-white rounded-3xl shadow-claimondo-md overflow-hidden">
            <div className="px-5 py-4 border-b border-claimondo-navy/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-claimondo-navy tracking-[-.018em]">Dein Gebiet</h3>
                {ortLabel && coord ? (
                  <p className="text-xs text-claimondo-ondo mt-0.5">{radiusKm} km um {ortLabel}</p>
                ) : (
                  <p className="text-xs text-[#8a93a6] mt-0.5">PLZ eingeben um Gebiet zu sehen</p>
                )}
              </div>
              {coord && (
                <div className="text-right">
                  <span className="text-lg font-bold text-claimondo-navy">~{flächeKm2(radiusKm).toLocaleString('de-DE')}</span>
                  <span className="text-xs text-claimondo-ondo ml-1">km²</span>
                </div>
              )}
            </div>
            <div ref={mapContainer} style={{ height: 360 }} className="w-full" />
            {!MAPBOX_TOKEN && (
              <div className="absolute inset-0 flex items-center justify-center bg-claimondo-bg text-sm text-[#8a93a6]">
                Karte nicht verfügbar (NEXT_PUBLIC_MAPBOX_TOKEN fehlt)
              </div>
            )}
          </div>

          <div className="bg-claimondo-navy/[0.04] border border-claimondo-navy/[0.08] rounded-2xl px-5 py-4 text-xs text-claimondo-ondo leading-relaxed">
            <strong className="text-claimondo-navy block mb-1">Standardgebiet: {radiusKm} km Radius (≈ {flächeKm2(radiusKm).toLocaleString('de-DE')} km² Fläche).</strong>
            Pro/Premium-Pakete liefern größere Radien — das besprechen wir im Erstgespräch.
          </div>
        </div>
      </div>
    </div>
  )
}
