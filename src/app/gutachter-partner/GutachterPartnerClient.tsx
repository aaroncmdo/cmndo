'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CheckIcon, MapPinIcon, ShieldCheckIcon, ClockIcon, ChevronRightIcon, LoaderIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { eintragenAufWarteliste } from './actions'
import { Input } from '@/components/primitives'

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
  const t = useTranslations('gutachter_partner')
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
      setFehler(t('form.error_pflichtfelder'))
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

  // Adapter für primitives/Input — value + onChangeText (Native-Style API).
  const inputF = (key: keyof typeof form) => ({
    value: form[key],
    onChangeText: (v: string) => setForm(f => ({ ...f, [key]: v })),
  })

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-20 px-6">
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
          <CheckIcon className="w-8 h-8 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-bold text-claimondo-navy mb-3 tracking-[-.024em]" style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}>{t('success.headline')}</h2>
        <p className="text-claimondo-ondo max-w-sm">
          {t('success.subtext')}
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
          {t('hero.badge')}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-4 max-w-2xl mx-auto">
          {t('hero.headline')}
        </h1>
        <p className="text-claimondo-light-blue max-w-xl mx-auto text-base leading-relaxed">
          {t('hero.subheadline')}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm">
          {([
            { icon: ClockIcon, key: 'hero.feature_auftraege' as const },
            { icon: ShieldCheckIcon, key: 'hero.feature_verifiziert' as const },
            { icon: MapPinIcon, key: 'hero.feature_radius' as const },
          ] as const).map(({ icon: Icon, key }) => (
            <div key={key} className="flex items-center gap-2 text-white/70">
              <Icon className="w-4 h-4 text-claimondo-light-blue" />
              {t(key)}
            </div>
          ))}
        </div>
      </div>

      {/* Formular + Karte */}
      <div className="max-w-5xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Linke Seite — Formular */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-3xl shadow-claimondo-md p-6 space-y-4">
            <h2 className="text-base font-bold text-claimondo-navy tracking-[-.018em]">{t('form.section_personal')}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_vorname')} <span className="text-red-500">*</span></span>
                <Input {...inputF('vorname')} required size="sm" placeholder="Max" ariaLabel={t('form.label_vorname')} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_nachname')} <span className="text-red-500">*</span></span>
                <Input {...inputF('nachname')} required size="sm" placeholder="Mustermann" ariaLabel={t('form.label_nachname')} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_email')} <span className="text-red-500">*</span></span>
              <Input {...inputF('email')} inputType="email" required size="sm" placeholder="max@buero.de" ariaLabel={t('form.label_email')} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_telefon')}</span>
              <Input {...inputF('telefon')} inputType="tel" size="sm" placeholder="+49 221 …" ariaLabel={t('form.label_telefon')} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_plz')} <span className="text-red-500">*</span></span>
              <Input {...inputF('plz')} required maxLength={5} size="sm" placeholder="50670" ariaLabel="PLZ" />
              {ortLabel && (
                <p className="mt-1.5 text-xs text-claimondo-ondo flex items-center gap-1">
                  <MapPinIcon className="w-3 h-3" />
                  {t('form.plz_hint', { ort: ortLabel })}
                </p>
              )}
            </label>
          </div>

          {/* Qualifikationen */}
          <div className="bg-white rounded-3xl shadow-claimondo-md p-6 space-y-4">
            <h2 className="text-base font-bold text-claimondo-navy tracking-[-.018em]">{t('form.section_quali')}</h2>
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
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_dat_nr')}</span>
                <Input {...inputF('dat_expert_nr')} size="sm" placeholder="z.B. DAT-12345" ariaLabel={t('form.label_dat_nr')} />
              </label>
            )}
            {qualifikationen.includes('bvsk') && (
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_bvsk_nr')}</span>
                <Input {...inputF('bvsk_nr')} size="sm" placeholder="z.B. BVSK-6789" ariaLabel={t('form.label_bvsk_nr')} />
              </label>
            )}
            {qualifikationen.includes('oebuv') && (
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_oebuv_nr')}</span>
                <Input {...inputF('oebuv_nr')} size="sm" placeholder="z.B. IHK-NW-001" ariaLabel={t('form.label_oebuv_nr')} />
              </label>
            )}
          </div>

          {/* Geschäft */}
          <div className="bg-white rounded-3xl shadow-claimondo-md p-6 space-y-4">
            <h2 className="text-base font-bold text-claimondo-navy tracking-[-.018em]">{t('form.section_geschaeft')} <span className="text-xs font-normal text-claimondo-ondo/60">{t('form.section_geschaeft_optional')}</span></h2>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_firma')}</span>
              <Input {...inputF('firma')} size="sm" placeholder="Mustermann Sachverständigenbüro GmbH" ariaLabel={t('form.label_firma')} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_jahre')}</span>
                <Input {...inputF('jahre_erfahrung')} inputType="number" min={0} max={50} size="sm" placeholder="10" ariaLabel={t('form.label_jahre')} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_auftraege')}</span>
                <Input {...inputF('auftraege_monat')} inputType="number" min={0} max={999} size="sm" placeholder="20" ariaLabel={t('form.label_auftraege')} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-semibold text-claimondo-navy mb-1.5 block tracking-[-.01em]">{t('form.label_schwerpunkte')}</span>
              <Input {...inputF('fachschwerpunkte')} size="sm" placeholder={t('form.placeholder_schwerpunkte')} ariaLabel={t('form.label_schwerpunkte')} />
            </label>
          </div>

          {fehler && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-ios-xl px-4 py-3">{fehler}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full flex items-center justify-center gap-2 bg-claimondo-ondo hover:bg-claimondo-shield text-white font-semibold rounded-full py-3.5 text-sm tracking-[-.01em] shadow-cta-ondo hover:-translate-y-[1px] hover:shadow-cta-ondo-hover active:translate-y-0 transition-all duration-250 ease-[cubic-bezier(.32,.72,0,1)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
          >
            {pending ? (
              <LoaderIcon className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {t('form.submit')}
                <ChevronRightIcon className="w-4 h-4" />
              </>
            )}
          </button>
          <p className="text-xs text-center text-claimondo-ondo/60 leading-relaxed">
            {t('form.datenschutz_hinweis')}
          </p>
        </form>

        {/* Rechte Seite — Karte */}
        <div className="lg:sticky lg:top-6 space-y-3">
          <div className="bg-white rounded-3xl shadow-claimondo-md overflow-hidden">
            <div className="px-5 py-4 border-b border-claimondo-navy/[0.06] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-claimondo-navy tracking-[-.018em]">{t('map.heading')}</h3>
                {ortLabel && coord ? (
                  <p className="text-xs text-claimondo-ondo mt-0.5">{t('map.radius_hint', { radius: radiusKm, ort: ortLabel })}</p>
                ) : (
                  <p className="text-xs text-claimondo-ondo/60 mt-0.5">{t('map.plz_prompt')}</p>
                )}
              </div>
              {coord && (
                <div className="text-right">
                  <span className="text-lg font-bold text-claimondo-navy">~{flächeKm2(radiusKm).toLocaleString('de-DE')}</span>
                  <span className="text-xs text-claimondo-ondo ml-1">{t('map.flaeche_einheit')}</span>
                </div>
              )}
            </div>
            <div ref={mapContainer} style={{ height: 360 }} className="w-full" />
            {!MAPBOX_TOKEN && (
              <div className="absolute inset-0 flex items-center justify-center bg-claimondo-bg text-sm text-claimondo-ondo/60">
                {t('map.no_token')}
              </div>
            )}
          </div>

          <div className="bg-claimondo-navy/[0.04] border border-claimondo-navy/[0.08] rounded-2xl px-5 py-4 text-xs text-claimondo-ondo leading-relaxed">
            <strong className="text-claimondo-navy block mb-1">{t('map.standardgebiet', { radius: radiusKm, flaeche: flächeKm2(radiusKm).toLocaleString('de-DE') })}</strong>
            {t('map.standardgebiet_mehr')}
          </div>
        </div>
      </div>
    </div>
  )
}
