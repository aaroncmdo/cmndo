'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import type { AktiverSV, SvLead } from '@/lib/actions/gutachter-finder-actions'
import { MapPin, Loader2, Check, ChevronDown, Shield, Clock, Star, Zap, Calendar, ChevronRight } from 'lucide-react'

// ——— Typen ———
// Prototyp-Flow (sv-live-mapbox_25.html): wann → … → gps → map → detail → formular → erfolg
type Phase = 'wann' | 'gps' | 'map' | 'detail' | 'formular' | 'erfolg'

type Wann = 'sofort' | 'heute' | 'tage'

type TerminSlot = { datum: string; uhrzeit: string; label: string }

type FormData = {
  vorname: string
  nachname: string
  telefon: string
  email: string
  schadentyp: string
}

type GewaehlterSV = {
  typ: 'sv' | 'lead'
  id: string
  vorname: string
  distanzKm: number
  lat: number
  lng: number
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

function naechsteSVs(
  kundeLatLng: { lat: number; lng: number },
  aktiveSVs: AktiverSV[],
  svLeads: SvLead[],
): GewaehlterSV[] {
  const ergebnisse: GewaehlterSV[] = []

  for (const sv of aktiveSVs) {
    if (!sv.standort_lat || !sv.standort_lng) continue
    ergebnisse.push({
      typ: 'sv',
      id: sv.id,
      vorname: sv.firmenname?.split(' ')[0] ?? 'SV',
      distanzKm: haversineKm(kundeLatLng.lat, kundeLatLng.lng, sv.standort_lat, sv.standort_lng),
      lat: sv.standort_lat,
      lng: sv.standort_lng,
    })
  }

  for (const lead of svLeads) {
    if (!lead.lat || !lead.lng) continue
    ergebnisse.push({
      typ: 'lead',
      id: lead.id,
      vorname: lead.vorname ?? lead.name.split(' ')[0],
      distanzKm: haversineKm(kundeLatLng.lat, kundeLatLng.lng, lead.lat, lead.lng),
      lat: lead.lat,
      lng: lead.lng,
    })
  }

  return ergebnisse
    .filter((s) => s.distanzKm <= 35)
    .sort((a, b) => {
      // Eigene SVs immer zuerst
      if (a.typ !== b.typ) return a.typ === 'sv' ? -1 : 1
      return a.distanzKm - b.distanzKm
    })
    .slice(0, 8)
}

function generiereSlots(wann: Wann): TerminSlot[] {
  const slots: TerminSlot[] = []
  const jetzt = new Date()
  const uhrzeiten = ['08:00', '10:00', '13:00', '15:00']
  const wochentage = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
  const monate = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

  // Sofort-Pfad: ein Express-Slot mit ETA innerhalb 2h, kein Datum-Picker.
  if (wann === 'sofort') {
    const eta = new Date(jetzt.getTime() + 90 * 60 * 1000)
    return [{
      datum: jetzt.toISOString().split('T')[0],
      uhrzeit: 'sofort',
      label: `Heute · ETA ${eta.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`,
    }]
  }

  // Heute-Pfad: 2 freie Slots am gleichen Tag, sonst Plan-B nächster Werktag.
  if (wann === 'heute') {
    const wt = jetzt.getDay()
    if (wt !== 0 && wt !== 6) {
      for (const uhrzeit of ['14:00', '16:00']) {
        slots.push({
          datum: jetzt.toISOString().split('T')[0],
          uhrzeit,
          label: `Heute · ${uhrzeit} Uhr`,
        })
      }
      if (slots.length > 0) return slots
    }
  }

  // Tage-Pfad (Default): 3 Werktage ab morgen.
  let tag = new Date(jetzt)
  tag.setDate(tag.getDate() + 1)
  while (slots.length < 3) {
    const wt = tag.getDay()
    if (wt !== 0 && wt !== 6) {
      const uhrzeit = uhrzeiten[Math.floor(Math.random() * 3)]
      slots.push({
        datum: tag.toISOString().split('T')[0],
        uhrzeit,
        label: `${wochentage[wt]}. ${tag.getDate()}. ${monate[tag.getMonth()]} · ${uhrzeit} Uhr`,
      })
    }
    tag = new Date(tag)
    tag.setDate(tag.getDate() + 1)
  }
  return slots
}

// ——— SVG-Marker-Element erstellen ———
function createSvMarkerEl(vorname: string, aktiv: boolean): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `
    display:flex;flex-direction:column;align-items:center;cursor:pointer;
    transition:transform 0.2s ease;
  `
  el.innerHTML = `
    <div style="
      background:${aktiv ? '#0D1B3E' : '#4573A2'};
      color:#fff;
      font-family:Montserrat,sans-serif;
      font-size:11px;
      font-weight:700;
      padding:5px 10px;
      border-radius:20px;
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 4px 16px rgba(13,27,62,0.35);
      white-space:nowrap;
      letter-spacing:0.03em;
    ">${vorname}</div>
    <div style="
      width:0;height:0;
      border-left:5px solid transparent;
      border-right:5px solid transparent;
      border-top:6px solid ${aktiv ? '#0D1B3E' : '#4573A2'};
      margin-top:-1px;
    "></div>
  `
  return el
}

// ——— Haupt-Komponente ———
type Props = {
  aktiveSVs: AktiverSV[]
  svLeads: SvLead[]
}

export function GutachterFinderClient({ aktiveSVs, svLeads }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const kundeMarkerRef = useRef<Marker | null>(null)
  const svMarkersRef = useRef<Map<string, Marker>>(new Map())

  const [phase, setPhase] = useState<Phase>('wann')
  const [wann, setWann] = useState<Wann | null>(null)
  const [gpsLaden, setGpsLaden] = useState(false)
  const [gpsFehler, setGpsFehler] = useState<string | null>(null)
  const [kundeLatLng, setKundeLatLng] = useState<{ lat: number; lng: number } | null>(null)
  const [naechsteSVList, setNaechsteSVList] = useState<GewaehlterSV[]>([])
  const [gewaehlterSV, setGewaehlterSV] = useState<GewaehlterSV | null>(null)
  const [gewaehlterSlot, setGewaehlterSlot] = useState<TerminSlot | null>(null)
  const [termine, setTermine] = useState<TerminSlot[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [anfrageId, setAnfrageId] = useState<string | null>(null)
  const [sheetHoehe, setSheetHoehe] = useState<'klein' | 'mittel' | 'gross'>('klein')

  const [formData, setFormData] = useState<FormData>({
    vorname: '',
    nachname: '',
    telefon: '',
    email: '',
    schadentyp: '',
  })

  // ——— Karte initialisieren ———
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return
    if (!ensureMapboxInitialized()) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [6.9603, 50.9333],
      zoom: 10,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
    })

    map.on('load', () => {
      // Subtile 3D-Gebäude
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
            'fill-extrusion-color': '#dde4ef',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.5,
          },
        },
        labelLayer?.id,
      )
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ——— SV-Marker zeichnen wenn Liste bekannt ———
  const zeichneSvMarker = useCallback(
    (svListe: GewaehlterSV[], aktuelleId?: string) => {
      const map = mapRef.current
      if (!map) return

      // Alte Marker entfernen
      svMarkersRef.current.forEach((m) => m.remove())
      svMarkersRef.current.clear()

      svListe.forEach((sv) => {
        const aktiv = sv.id === aktuelleId
        const el = createSvMarkerEl(sv.vorname, aktiv)

        const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([sv.lng, sv.lat])
          .addTo(map)

        el.addEventListener('click', () => {
          setGewaehlterSV(sv)
          setTermine(generiereSlots(wann ?? 'tage'))
          setGewaehlterSlot(null)
          setSheetHoehe('mittel')
          setPhase('detail')
          map.flyTo({ center: [sv.lng, sv.lat], zoom: 13, duration: 800, offset: [0, 100] })
          // Marker neu zeichnen mit activem Zustand
          zeichneSvMarker(svListe, sv.id)
        })

        svMarkersRef.current.set(sv.id, marker)
      })
    },
    [wann],
  )

  // ——— GPS-Standort abrufen ———
  const standortAbrufen = useCallback(() => {
    setGpsLaden(true)
    setGpsFehler(null)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const latLng = { lat, lng }
        setKundeLatLng(latLng)

        const map = mapRef.current
        if (map) {
          // Nutzer-Marker
          const el = document.createElement('div')
          el.style.cssText = `
            width:18px;height:18px;border-radius:50%;
            background:#4573A2;border:3px solid #fff;
            box-shadow:0 0 0 6px rgba(69,115,162,0.2),0 2px 8px rgba(13,27,62,0.3);
          `
          kundeMarkerRef.current?.remove()
          kundeMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([lng, lat])
            .addTo(map)

          map.flyTo({ center: [lng, lat], zoom: 11.5, duration: 1400, pitch: 30 })
        }

        // SVs berechnen und Marker setzen
        const svListe = naechsteSVs(latLng, aktiveSVs, svLeads)
        setNaechsteSVList(svListe)

        setTimeout(() => {
          zeichneSvMarker(svListe)
        }, 800)

        setGpsLaden(false)
        setPhase('map')
      },
      (err) => {
        setGpsLaden(false)
        setGpsFehler(
          err.code === 1
            ? 'Standortzugriff verweigert — bitte in den Browser-Einstellungen erlauben.'
            : 'Standort konnte nicht ermittelt werden.',
        )
      },
      { timeout: 12000, enableHighAccuracy: true },
    )
  }, [aktiveSVs, svLeads, zeichneSvMarker])

  // ——— Buchung absenden ———
  const buchen = useCallback(async () => {
    if (!gewaehlterSV || !gewaehlterSlot) return
    setSubmitting(true)

    // Sofort-Slot nutzt jetzt-Zeitpunkt + Express-Marker, geplante Slots wie bisher.
    const wunschtermin = gewaehlterSlot.uhrzeit === 'sofort'
      ? new Date().toISOString()
      : `${gewaehlterSlot.datum}T${gewaehlterSlot.uhrzeit}:00`

    const result = await erstelleGutachterFinderAnfrage({
      vorname: formData.vorname,
      nachname: formData.nachname,
      email: formData.email,
      telefon: formData.telefon || undefined,
      schadentyp: formData.schadentyp || 'unbekannt',
      schadenort_lat: kundeLatLng?.lat,
      schadenort_lng: kundeLatLng?.lng,
      wunschtermin,
      zugeordneter_sv_id: gewaehlterSV.typ === 'sv' ? gewaehlterSV.id : undefined,
      zugeordneter_sv_lead_id: gewaehlterSV.typ === 'lead' ? gewaehlterSV.id : undefined,
      matching_typ: gewaehlterSV.typ === 'sv' ? 'sv_isochrone' : 'dat_lead_nearest',
    })

    setSubmitting(false)

    if (result.ok) {
      setAnfrageId(result.id)
      setPhase('erfolg')
    }
  }, [gewaehlterSV, gewaehlterSlot, formData, kundeLatLng])

  const formGueltig =
    formData.vorname.trim().length > 1 &&
    formData.nachname.trim().length > 1 &&
    formData.email.includes('@')

  // ——— Render ———
  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100dvh - 64px)' }}>
      {/* Karte — immer im Hintergrund */}
      <div ref={mapContainerRef} className="absolute inset-0" />

      {/* GPS-Overlay */}
      {/* Q1 Wann — Sofort / Heute / Tage. Bestimmt Slot-Generierung + späteren Tracking-Pfad. */}
      {phase === 'wann' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0">
          <div
            className="mx-4 w-full max-w-sm rounded-3xl border border-white/40 p-7"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18), 0 1px 0 rgba(255,255,255,0.9) inset',
            }}
          >
            <div className="mb-5 flex justify-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'rgba(69,115,162,0.12)' }}
              >
                <Clock className="h-6 w-6" style={{ color: '#4573A2' }} />
              </div>
            </div>

            <h2
              className="mb-2 text-center text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              Wann brauchen Sie den Gutachter?
            </h2>
            <p className="mb-6 text-center text-sm" style={{ color: '#4573A2' }}>
              Wir passen den Ablauf an Ihre Situation an.
            </p>

            <div className="flex flex-col gap-2.5">
              {([
                { wert: 'sofort', icon: Zap, titel: 'Sofort', sub: 'Ich bin am Unfallort — Express-Begutachtung' },
                { wert: 'heute', icon: Clock, titel: 'Heute', sub: 'Im Laufe des Tages — flexibler Termin' },
                { wert: 'tage', icon: Calendar, titel: 'In den nächsten Tagen', sub: 'Termin in Ruhe vereinbaren' },
              ] as const).map(({ wert, icon: Icon, titel, sub }) => (
                <button
                  key={wert}
                  onClick={() => {
                    setWann(wert)
                    setPhase('gps')
                  }}
                  className="flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98]"
                  style={{
                    background: 'rgba(248,249,251,0.9)',
                    borderColor: 'rgba(13,27,62,0.12)',
                    color: '#0D1B3E',
                  }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: wert === 'sofort' ? 'rgba(243,192,83,0.18)' : 'rgba(69,115,162,0.1)' }}
                  >
                    <Icon className="h-5 w-5" style={{ color: wert === 'sofort' ? '#C28A2A' : '#4573A2' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ fontFamily: 'Montserrat, sans-serif' }}>
                      {titel}
                    </p>
                    <p className="text-xs" style={{ color: '#4573A2' }}>
                      {sub}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#7BA3CC' }} />
                </button>
              ))}
            </div>

            <p className="mt-4 text-center text-xs" style={{ color: '#7BA3CC' }}>
              Kostenlos für unverschuldet Geschädigte · §249 BGB
            </p>
          </div>
        </div>
      )}

      {phase === 'gps' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0">
          <div
            className="mx-4 w-full max-w-sm rounded-3xl border border-white/40 p-7"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18), 0 1px 0 rgba(255,255,255,0.9) inset',
            }}
          >
            {/* Pulsierender Pin */}
            <div className="mb-6 flex justify-center">
              <div className="relative flex items-center justify-center">
                <div
                  className="absolute h-20 w-20 animate-ping rounded-full"
                  style={{ background: 'rgba(69,115,162,0.15)' }}
                />
                <div
                  className="absolute h-14 w-14 animate-ping rounded-full"
                  style={{ background: 'rgba(69,115,162,0.2)', animationDelay: '0.3s' }}
                />
                <div
                  className="relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-white shadow-lg"
                  style={{ background: '#4573A2' }}
                >
                  <MapPin className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            <h2
              className="mb-2 text-center text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              Gutachter in Ihrer Nähe
            </h2>
            <p className="mb-6 text-center text-sm" style={{ color: '#4573A2' }}>
              Wir zeigen Ihnen sofort den nächsten freien DAT-zertifizierten Sachverständigen.
            </p>

            {gpsFehler && (
              <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-600">
                {gpsFehler}
              </p>
            )}

            <button
              onClick={standortAbrufen}
              disabled={gpsLaden}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition-all active:scale-95"
              style={{
                background: gpsLaden ? '#7BA3CC' : '#0D1B3E',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              {gpsLaden ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Standort wird ermittelt …
                </>
              ) : (
                <>
                  <MapPin className="h-5 w-5" />
                  Standort freigeben
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs" style={{ color: '#7BA3CC' }}>
              Nur für die Gutachter-Suche · Daten werden nicht gespeichert
            </p>
          </div>
        </div>
      )}

      {/* Karten-Phase: Hinweis-Banner oben */}
      {(phase === 'map') && (
        <div className="absolute left-0 right-0 top-4 flex justify-center px-4">
          <div
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
            style={{
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow: '0 4px 20px rgba(13,27,62,0.12)',
              color: '#0D1B3E',
              fontFamily: 'Montserrat, sans-serif',
            }}
          >
            <MapPin className="h-4 w-4" style={{ color: '#4573A2' }} />
            {naechsteSVList.length > 0
              ? `${naechsteSVList.length} Sachverständige in Ihrer Nähe`
              : 'Keine Sachverständige in Ihrer Nähe gefunden'}
          </div>
        </div>
      )}

      {/* SV-Detail + Formular — Bottom Sheet */}
      {(phase === 'detail' || phase === 'formular') && gewaehlterSV && (
        <div
          className="absolute inset-x-0 bottom-0 transition-all duration-500"
          style={{ zIndex: 10 }}
        >
          <div
            className="rounded-t-3xl border-t border-white/50"
            style={{
              background: 'rgba(255,255,255,0.88)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 -8px 40px rgba(13,27,62,0.15)',
              maxHeight: phase === 'formular' ? '85dvh' : '60dvh',
              overflowY: 'auto',
            }}
          >
            {/* Drag-Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div
                className="h-1 w-10 rounded-full"
                style={{ background: 'rgba(13,27,62,0.15)' }}
              />
            </div>

            <div className="px-5 pb-6 pt-2">
              {/* SV-Header */}
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-2xl font-bold"
                      style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
                    >
                      {gewaehlterSV.vorname}
                    </h3>
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                      />
                    ))}
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-sm" style={{ color: '#4573A2' }}>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {gewaehlterSV.distanzKm.toFixed(1)} km entfernt
                    </span>
                    <span
                      className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ background: 'rgba(69,115,162,0.1)', color: '#1E3A5F' }}
                    >
                      <Shield className="h-3 w-3" />
                      DAT Expert Partner
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setPhase('map')
                    setGewaehlterSV(null)
                    zeichneSvMarker(naechsteSVList)
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: 'rgba(13,27,62,0.08)' }}
                >
                  <ChevronDown className="h-5 w-5" style={{ color: '#0D1B3E' }} />
                </button>
              </div>

              {/* Termin-Slots */}
              {phase === 'detail' && (
                <>
                  <p className="mb-3 text-sm font-semibold" style={{ color: '#0D1B3E', fontFamily: 'Montserrat, sans-serif' }}>
                    Freie Termine
                  </p>
                  <div className="mb-5 flex flex-col gap-2">
                    {termine.map((slot) => {
                      const gewaehlt = gewaehlterSlot?.datum === slot.datum && gewaehlterSlot?.uhrzeit === slot.uhrzeit
                      return (
                        <button
                          key={`${slot.datum}-${slot.uhrzeit}`}
                          onClick={() => setGewaehlterSlot(slot)}
                          className="flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-all"
                          style={{
                            background: gewaehlt ? '#0D1B3E' : 'rgba(248,249,251,0.9)',
                            borderColor: gewaehlt ? '#0D1B3E' : 'rgba(13,27,62,0.12)',
                            color: gewaehlt ? '#fff' : '#0D1B3E',
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <Clock className="h-4 w-4" style={{ opacity: 0.7 }} />
                            {slot.label}
                          </span>
                          {gewaehlt && <Check className="h-4 w-4" />}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => {
                      if (!gewaehlterSlot) return
                      setPhase('formular')
                    }}
                    disabled={!gewaehlterSlot}
                    className="w-full rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95"
                    style={{
                      background: gewaehlterSlot ? '#0D1B3E' : 'rgba(13,27,62,0.25)',
                      fontFamily: 'Montserrat, sans-serif',
                    }}
                  >
                    Termin reservieren →
                  </button>

                  <p className="mt-3 text-center text-xs" style={{ color: '#7BA3CC' }}>
                    Kostenlos für unverschuldet Geschädigte · 0 € Eigenanteil
                  </p>
                </>
              )}

              {/* Kontakt-Formular */}
              {phase === 'formular' && (
                <>
                  {/* Gewählter Termin als Badge */}
                  {gewaehlterSlot && (
                    <div
                      className="mb-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium"
                      style={{ background: 'rgba(69,115,162,0.08)', color: '#1E3A5F' }}
                    >
                      <Clock className="h-4 w-4" />
                      {gewaehlterSlot.label}
                      <button
                        onClick={() => setPhase('detail')}
                        className="ml-auto text-xs underline"
                        style={{ color: '#4573A2' }}
                      >
                        ändern
                      </button>
                    </div>
                  )}

                  <p
                    className="mb-4 text-sm font-semibold"
                    style={{ color: '#0D1B3E', fontFamily: 'Montserrat, sans-serif' }}
                  >
                    Ihre Kontaktdaten
                  </p>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <input
                        placeholder="Vorname"
                        value={formData.vorname}
                        onChange={(e) => setFormData((p) => ({ ...p, vorname: e.target.value }))}
                        className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
                        style={{
                          background: 'rgba(248,249,251,0.9)',
                          borderColor: 'rgba(13,27,62,0.12)',
                          color: '#0D1B3E',
                        }}
                      />
                      <input
                        placeholder="Nachname"
                        value={formData.nachname}
                        onChange={(e) => setFormData((p) => ({ ...p, nachname: e.target.value }))}
                        className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
                        style={{
                          background: 'rgba(248,249,251,0.9)',
                          borderColor: 'rgba(13,27,62,0.12)',
                          color: '#0D1B3E',
                        }}
                      />
                    </div>
                    <input
                      placeholder="Telefonnummer"
                      type="tel"
                      value={formData.telefon}
                      onChange={(e) => setFormData((p) => ({ ...p, telefon: e.target.value }))}
                      className="rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{
                        background: 'rgba(248,249,251,0.9)',
                        borderColor: 'rgba(13,27,62,0.12)',
                        color: '#0D1B3E',
                      }}
                    />
                    <input
                      placeholder="E-Mail-Adresse"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                      className="rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{
                        background: 'rgba(248,249,251,0.9)',
                        borderColor: 'rgba(13,27,62,0.12)',
                        color: '#0D1B3E',
                      }}
                    />
                    <select
                      value={formData.schadentyp}
                      onChange={(e) => setFormData((p) => ({ ...p, schadentyp: e.target.value }))}
                      className="rounded-2xl border px-4 py-3 text-sm outline-none"
                      style={{
                        background: 'rgba(248,249,251,0.9)',
                        borderColor: 'rgba(13,27,62,0.12)',
                        color: formData.schadentyp ? '#0D1B3E' : '#7BA3CC',
                      }}
                    >
                      <option value="">Art des Schadens (optional)</option>
                      <option value="auffahrunfall">Auffahrunfall</option>
                      <option value="parkschaden">Parkschaden</option>
                      <option value="kreuzungsunfall">Kreuzungsunfall</option>
                      <option value="wildschaden">Wildschaden</option>
                      <option value="sonstiges">Sonstiger Schaden</option>
                    </select>
                  </div>

                  <button
                    onClick={buchen}
                    disabled={submitting || !formGueltig}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95"
                    style={{
                      background: submitting || !formGueltig ? 'rgba(13,27,62,0.25)' : '#0D1B3E',
                      fontFamily: 'Montserrat, sans-serif',
                    }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Buchung läuft …
                      </>
                    ) : (
                      'Termin verbindlich buchen'
                    )}
                  </button>

                  <p className="mt-3 text-center text-xs" style={{ color: '#7BA3CC' }}>
                    Ihr Gutachter meldet sich innerhalb von 30 Minuten
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Erfolgs-Screen */}
      {phase === 'erfolg' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0" style={{ zIndex: 20 }}>
          <div
            className="mx-4 w-full max-w-sm rounded-3xl border border-white/40 p-8 text-center"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18)',
            }}
          >
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(69,115,162,0.12)' }}
            >
              <Check className="h-8 w-8" style={{ color: '#4573A2' }} />
            </div>

            <h2
              className="mb-2 text-2xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              Termin bestätigt!
            </h2>
            <p className="mb-2 text-sm" style={{ color: '#4573A2' }}>
              {gewaehlterSV?.vorname} kommt zum gewählten Termin zu Ihnen.
            </p>
            {gewaehlterSlot && (
              <div
                className="mb-5 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold"
                style={{ background: 'rgba(69,115,162,0.08)', color: '#1E3A5F' }}
              >
                <Clock className="h-4 w-4" />
                {gewaehlterSlot.label}
              </div>
            )}
            <p className="text-xs" style={{ color: '#7BA3CC' }}>
              Sie erhalten eine Bestätigung per E-Mail. Ihr Gutachter meldet sich vorab telefonisch.
            </p>

            {anfrageId && (
              <p className="mt-3 text-xs font-mono" style={{ color: 'rgba(13,27,62,0.3)' }}>
                Ref: {anfrageId.slice(0, 8).toUpperCase()}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
