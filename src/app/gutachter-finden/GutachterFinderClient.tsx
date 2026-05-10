'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox'
import type { Map as MapboxMap, Marker } from 'mapbox-gl'
import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import type { AktiverSV, SvLead } from '@/lib/actions/gutachter-finder-actions'
import { konvertiereAnfrageZuFall } from '@/lib/actions/konvertiere-anfrage-zu-fall'
import { MapPin, Loader2, Check, ChevronDown, Shield, Clock, Star, Zap, Calendar, ChevronRight, Camera, Sparkles } from 'lucide-react'

// ——— Typen ———
// Prototyp-Flow (sv-live-mapbox_25.html):
// wann → schaden → fahrzeug → gps → map → detail → ansprueche → formular → erfolg
type Phase =
  | 'routing' // Aaron 10.05.: NEU am Funnel-Anfang — am Unfallort? ja → vor_ort_*, nein → wann
  | 'vor_ort_fotos' // Foto-Wizard mit GPS-Stempel
  | 'vor_ort_kontakt' // Kontakt-Daten + Sofort-Submit, kein Termin
  | 'vor_ort_erfolg' // "Wir rufen dich in 5 Min an"
  | 'wann' | 'schaden' | 'fahrzeug' | 'gps' | 'map' | 'detail' | 'ansprueche' | 'formular' | 'erfolg'

// Regulierungs-Wahl aus z35 — bestimmt ob Anwalt eingebunden wird (Vollregulierung)
// oder ob nur das Gutachten ausgeführt wird (Selbstregulierung).
type Regulierung = 'vollstaendig' | 'nur_gutachten'

type Schadentyp = 'auffahrunfall' | 'parkschaden' | 'kreuzungsunfall' | 'wildschaden' | 'sonstiges'

type Fahrzeugtyp = 'pkw' | 'motorrad' | 'transporter' | 'lkw' | 'wohnmobil'

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
export type GutachterFinderClientProps = {
  aktiveSVs: AktiverSV[]
  svLeads: SvLead[]
}

export function GutachterFinderClient({ aktiveSVs, svLeads }: GutachterFinderClientProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapboxMap | null>(null)
  const kundeMarkerRef = useRef<Marker | null>(null)
  const svMarkersRef = useRef<Map<string, Marker>>(new Map())

  const [phase, setPhase] = useState<Phase>('routing')

  // Aaron 10.05.: Vor-Ort-State
  const [vorOrtFotos, setVorOrtFotos] = useState<string[]>([])
  const [vorOrtKontakt, setVorOrtKontakt] = useState({ vorname: '', nachname: '', telefon: '', email: '' })
  const [vorOrtSubmitting, setVorOrtSubmitting] = useState(false)
  const [vorOrtAnfrageId, setVorOrtAnfrageId] = useState<string | null>(null)
  const [vorOrtUploading, setVorOrtUploading] = useState(false)
  const [wann, setWann] = useState<Wann | null>(null)
  const [schadentyp, setSchadentyp] = useState<Schadentyp | null>(null)
  const [kennzeichen, setKennzeichen] = useState('')
  const [kzUnbekannt, setKzUnbekannt] = useState(false)
  const [fahrzeugtyp, setFahrzeugtyp] = useState<Fahrzeugtyp | null>(null)
  const [regulierung, setRegulierung] = useState<Regulierung | null>(null)

  // ZB1-OCR (Erfolgs-Screen): Foto-Upload nach Buchung. Vorname + Halter-Daten
  // landen direkt in der Anfrage; Imagin-URL rendert das Fahrzeug visuell.
  const [zb1Loading, setZb1Loading] = useState(false)
  const [zb1Result, setZb1Result] = useState<{
    extracted: Record<string, string | null>
    imagin_url: string | null
    fields_found: number
    message: string
  } | null>(null)
  const [zb1Error, setZb1Error] = useState<string | null>(null)

  // Konvertierungs-Status nach Booking — Magic-Link ist raus → Erfolgs-Screen
  // zeigt "Email checken"-Hinweis statt "Wir melden uns".
  const [konvertierungOk, setKonvertierungOk] = useState(false)

  // Z4 SA-Vollmacht: Signatur + AGB. Beide Pflicht damit Submit aktiv wird.
  const [agbAkzeptiert, setAgbAkzeptiert] = useState(false)
  const [signaturDataUrl, setSignaturDataUrl] = useState<string | null>(null)
  const [hasSignatur, setHasSignatur] = useState(false)
  const [legalAusgeklappt, setLegalAusgeklappt] = useState(false)
  const signaturCanvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
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

  const t = useTranslations('gutachter_finder')

  const [formData, setFormData] = useState<FormData>({
    vorname: '',
    nachname: '',
    telefon: '',
    email: '',
    schadentyp: '',
  })

  // ——— Karte: sofort initialisieren (Blur-Hintergrund) ———
  // Map läuft immer im Hintergrund — während Form-Phasen gebluurt,
  // nach GPS-Freigabe klar sichtbar (CSS-Transition auf dem Wrapper).
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return
    if (!ensureMapboxInitialized()) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [10.4515, 51.1657], // Deutschland-Mitte als Blur-Hintergrund
      zoom: 5.5,
      pitch: 0,
      bearing: 0,
      attributionControl: false,
      interactive: false, // während Blur-Phasen nicht interagierbar
    })

    map.on('load', () => {
      // Subtile 3D-Gebäude (nur ab Zoom 14 sichtbar)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Map-Interaktivität + Zoom nach GPS-Freigabe
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (phase === 'map' || phase === 'detail' || phase === 'ansprueche' || phase === 'formular' || phase === 'erfolg') {
      map.scrollZoom.enable()
      map.dragPan.enable()
      map.touchZoomRotate.enable()
    } else {
      map.scrollZoom.disable()
      map.dragPan.disable()
      map.touchZoomRotate.disable()
    }
  }, [phase])

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
            ? t('gps.fehler_denied')
            : t('gps.fehler_generic'),
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
      // Schadentyp jetzt aus Q2 statt aus Form-Select. formData.schadentyp ist Fallback.
      schadentyp: schadentyp ?? formData.schadentyp ?? 'unbekannt',
      // Q2 Kennzeichen (Verursacher) — bei Fahrerflucht leer.
      kennzeichen: kzUnbekannt ? undefined : (kennzeichen.trim() || undefined),
      // Q3 Fahrzeugtyp — als Beschreibung damit Dispatch SV-Spezialisierung sieht.
      fahrzeug_beschreibung: fahrzeugtyp ?? undefined,
      // Z35 Ansprüche-Wahl — bestimmt ob Anwalt eingebunden wird.
      regulierungs_modus: regulierung ?? undefined,
      schadenort_lat: kundeLatLng?.lat,
      schadenort_lng: kundeLatLng?.lng,
      wunschtermin,
      zugeordneter_sv_id: gewaehlterSV.typ === 'sv' ? gewaehlterSV.id : undefined,
      zugeordneter_sv_lead_id: gewaehlterSV.typ === 'lead' ? gewaehlterSV.id : undefined,
      matching_typ: gewaehlterSV.typ === 'sv' ? 'sv_isochrone' : 'dat_lead_nearest',
      // Z4: SA-Signatur aus dem Canvas. Server-Action setzt sa_unterzeichnet_am
      // automatisch wenn data-url uebergeben wird.
      sa_signatur_data_url: signaturDataUrl ?? undefined,
    })

    if (result.ok) {
      setAnfrageId(result.id)
      setPhase('erfolg')

      // Konvertierung läuft im Hintergrund — Erfolgs-Screen ist sofort sichtbar,
      // Magic-Link-Status updated den Hinweis-Text wenn Mail rausging.
      konvertiereAnfrageZuFall(result.id)
        .then((conv) => {
          if (conv.ok && conv.magicLinkSent) {
            setKonvertierungOk(true)
          }
          if (!conv.ok) {
            console.warn('[GutachterFinder] Konvertierung fehlgeschlagen:', conv.error)
          }
        })
        .catch((err) => {
          console.warn('[GutachterFinder] Konvertierung-Exception:', err)
        })
    }

    setSubmitting(false)
  }, [gewaehlterSV, gewaehlterSlot, formData, kundeLatLng, schadentyp, kennzeichen, kzUnbekannt, fahrzeugtyp, regulierung, signaturDataUrl])

  // ZB1-Foto verarbeiten: Datei → base64 → API → DB-Update + Imagin-URL.
  // Signatur-Canvas Helpers
  function initSignaturCanvas() {
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Retina-tauglich: device pixel ratio
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#0D1B3E'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  function startDrawing(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    isDrawingRef.current = true
    canvas.setPointerCapture(e.pointerId)
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }

  function draw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
    setHasSignatur(true)
  }

  function stopDrawing() {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    setSignaturDataUrl(canvas.toDataURL('image/png'))
  }

  function clearSignatur() {
    const canvas = signaturCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignatur(false)
    setSignaturDataUrl(null)
  }

  // Canvas neu initialisieren wenn das Formular sichtbar wird
  useEffect(() => {
    if (phase === 'formular') {
      const t = setTimeout(initSignaturCanvas, 100)
      return () => clearTimeout(t)
    }
  }, [phase])

  // Aaron 10.05.: Vor-Ort-Foto-Wizard. Konvertiert zu Base64, klein als
  // Data-URL ins jsonb. Storage-Migration kommt wenn Volumen da ist.
  async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleVorOrtFoto(file: File) {
    setVorOrtUploading(true)
    try {
      const dataUrl = await fileToDataUrl(file)
      setVorOrtFotos((prev) => [...prev, dataUrl])
    } finally {
      setVorOrtUploading(false)
    }
  }

  async function vorOrtSubmit() {
    setVorOrtSubmitting(true)
    const result = await erstelleGutachterFinderAnfrage({
      vorname: vorOrtKontakt.vorname,
      nachname: vorOrtKontakt.nachname,
      email: vorOrtKontakt.email,
      telefon: vorOrtKontakt.telefon || undefined,
      schadentyp: 'unbekannt', // wird vor Ort nicht geklickt — Dispatch klärt am Telefon
      schadenort_lat: kundeLatLng?.lat,
      schadenort_lng: kundeLatLng?.lng,
      am_unfallort_flag: true,
      aufnahme_fotos: vorOrtFotos,
    })
    setVorOrtSubmitting(false)
    if (result.ok) {
      setVorOrtAnfrageId(result.id)
      setPhase('vor_ort_erfolg')
    }
  }

  function handleZb1Upload(file: File) {
    if (!anfrageId) return
    setZb1Loading(true)
    setZb1Error(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = typeof reader.result === 'string' ? reader.result : ''
      try {
        const res = await fetch('/api/ocr-fahrzeugschein-anfrage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anfrage_id: anfrageId, image_base64: base64 }),
        }).then((r) => r.json())
        if (res?.success && res.extracted) {
          setZb1Result({
            extracted: res.extracted,
            imagin_url: res.imagin_url ?? null,
            fields_found: res.fields_found ?? 0,
            message: res.message ?? '',
          })
        } else {
          setZb1Error(res?.message ?? 'Fahrzeugschein konnte nicht ausgelesen werden.')
        }
      } catch (err) {
        console.warn('[ZB1-OCR-Anfrage]', err)
        setZb1Error('Netzwerkfehler — bitte später erneut versuchen.')
      } finally {
        setZb1Loading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  // Z4: SA-Vollmacht erfordert AGB + Signatur zusaetzlich zu Kontaktdaten.
  const formGueltig =
    formData.vorname.trim().length > 1 &&
    formData.nachname.trim().length > 1 &&
    formData.email.includes('@') &&
    agbAkzeptiert &&
    hasSignatur

  // ——— Render ———
  const isFormPhase = !['map', 'detail', 'ansprueche', 'formular', 'erfolg'].includes(phase)

  return (
    <div className="relative w-full overflow-hidden" style={{ height: 'calc(100dvh - 64px)' }}>
      {/* Karte — Blur löst sich auf wenn Phase 'map' erreicht wird */}
      <div
        className="absolute inset-0"
        style={{
          filter: isFormPhase ? 'blur(28px) brightness(0.72) saturate(0.55)' : 'none',
          transform: isFormPhase ? 'scale(1.06)' : 'scale(1)',
          transition: 'filter 0.9s cubic-bezier(0.4,0,0.2,1), transform 0.9s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div ref={mapContainerRef} className="absolute inset-0" />
      </div>

      {/* Navy-Gradient-Overlay verschwindet mit dem Blur */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(160deg, rgba(13,27,62,0.52) 0%, rgba(13,27,62,0.28) 55%, rgba(69,115,162,0.15) 100%)',
          opacity: isFormPhase ? 1 : 0,
          transition: 'opacity 0.9s cubic-bezier(0.4,0,0.2,1)',
        }}
      />

      {/* GPS-Overlay */}
      {/* Aaron 10.05.: Routing — Bist du am Unfallort? */}
      {phase === 'routing' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0">
          <div
            className="glass-card mx-4 w-full max-w-sm rounded-3xl p-7"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18), 0 1px 0 rgba(255,255,255,0.9) inset',
            }}
          >
            <h2
              className="mb-2 text-center text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('routing.heading')}
            </h2>
            <p className="mb-6 text-center text-sm" style={{ color: '#4573A2' }}>
              {t('routing.sub')}
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  // GPS direkt anfragen weil Vor-Ort-Pfad GPS-Stempel braucht
                  if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition(
                      (pos) =>
                        setKundeLatLng({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                      () => {
                        /* User-decline ist ok */
                      },
                      { timeout: 5000 },
                    )
                  }
                  setPhase('vor_ort_fotos')
                }}
                className="rounded-2xl px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(13,27,62,0.22)] transition-all active:scale-[0.98]"
                style={{ background: '#0D1B3E', fontFamily: 'Montserrat, sans-serif' }}
              >
                🚨 {t('routing.cta_vor_ort')}
              </button>
              <button
                onClick={() => setPhase('wann')}
                className="rounded-2xl border bg-white/70 px-4 py-3.5 text-sm font-semibold text-claimondo-navy backdrop-blur-md transition-all hover:bg-white/90 active:scale-[0.98]"
                style={{ borderColor: 'rgba(13,27,62,0.12)', fontFamily: 'Montserrat, sans-serif' }}
              >
                {t('routing.cta_termin')}
              </button>
            </div>
            <p className="mt-4 text-center text-xs" style={{ color: '#7BA3CC' }}>
              {t('legal')}
            </p>
          </div>
        </div>
      )}

      {/* Vor-Ort-Foto-Wizard */}
      {phase === 'vor_ort_fotos' && (
        <div className="absolute inset-0 flex items-end justify-center overflow-y-auto pb-12 sm:items-center sm:pb-0">
          <div
            className="mx-4 my-4 w-full max-w-md rounded-3xl border border-white/40 p-6"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18)',
            }}
          >
            <p className="mb-1 text-center text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
              {t('vor_ort_fotos.step_label')}
            </p>
            <h2
              className="mb-3 text-center text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('vor_ort_fotos.heading')}
            </h2>
            <p className="mb-5 text-center text-sm" style={{ color: '#4573A2' }}>
              {t('vor_ort_fotos.sub')}
            </p>

            {vorOrtFotos.length > 0 && (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {vorOrtFotos.map((src, idx) => (
                  <div key={idx} className="relative aspect-square overflow-hidden rounded-xl border border-white/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <button
                      onClick={() => setVorOrtFotos((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
                      aria-label="Foto entfernen"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-claimondo-ondo/40 bg-white/60 py-6 text-sm font-semibold text-claimondo-navy transition-all hover:bg-white/80 active:scale-[0.99]"
              style={{ fontFamily: 'Montserrat, sans-serif' }}
            >
              {vorOrtUploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Foto wird hinzugefügt …
                </>
              ) : (
                <>
                  <span className="text-2xl">📷</span>
                  {vorOrtFotos.length === 0 ? t('vor_ort_fotos.btn_erstes') : t('vor_ort_fotos.btn_weiteres')}
                </>
              )}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={vorOrtUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleVorOrtFoto(f)
                  e.target.value = ''
                }}
              />
            </label>

            <button
              onClick={() => setPhase('vor_ort_kontakt')}
              disabled={vorOrtFotos.length === 0}
              className="mt-5 w-full rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: '#0D1B3E',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              {vorOrtFotos.length === 0
                ? t('vor_ort_fotos.cta_min')
                : t('vor_ort_fotos.cta_weiter', { count: vorOrtFotos.length })}
            </button>
            <button
              onClick={() => setPhase('routing')}
              className="mt-3 w-full text-center text-xs"
              style={{ color: '#7BA3CC' }}
            >
              {t('vor_ort_fotos.zurueck')}
            </button>
          </div>
        </div>
      )}

      {/* Vor-Ort-Kontakt + Sofort-Submit */}
      {phase === 'vor_ort_kontakt' && (
        <div className="absolute inset-0 flex items-end justify-center overflow-y-auto pb-12 sm:items-center sm:pb-0">
          <div
            className="mx-4 my-4 w-full max-w-md rounded-3xl border border-white/40 p-6"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18)',
            }}
          >
            <p className="mb-1 text-center text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
              {t('vor_ort_kontakt.step_label')}
            </p>
            <h2
              className="mb-3 text-center text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('vor_ort_kontakt.heading')}
            </h2>
            <p className="mb-5 text-center text-sm" style={{ color: '#4573A2' }}>
              {t('vor_ort_kontakt.sub')}
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <input
                  placeholder={t('vor_ort_kontakt.placeholder_vorname')}
                  value={vorOrtKontakt.vorname}
                  onChange={(e) => setVorOrtKontakt((p) => ({ ...p, vorname: e.target.value }))}
                  className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ background: 'rgba(248,249,251,0.9)', borderColor: 'rgba(13,27,62,0.12)' }}
                />
                <input
                  placeholder={t('vor_ort_kontakt.placeholder_nachname')}
                  value={vorOrtKontakt.nachname}
                  onChange={(e) => setVorOrtKontakt((p) => ({ ...p, nachname: e.target.value }))}
                  className="flex-1 rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={{ background: 'rgba(248,249,251,0.9)', borderColor: 'rgba(13,27,62,0.12)' }}
                />
              </div>
              <input
                type="tel"
                placeholder={t('vor_ort_kontakt.placeholder_telefon')}
                value={vorOrtKontakt.telefon}
                onChange={(e) => setVorOrtKontakt((p) => ({ ...p, telefon: e.target.value }))}
                className="rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(248,249,251,0.9)', borderColor: 'rgba(13,27,62,0.12)' }}
              />
              <input
                type="email"
                placeholder={t('vor_ort_kontakt.placeholder_email')}
                value={vorOrtKontakt.email}
                onChange={(e) => setVorOrtKontakt((p) => ({ ...p, email: e.target.value }))}
                className="rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{ background: 'rgba(248,249,251,0.9)', borderColor: 'rgba(13,27,62,0.12)' }}
              />
            </div>
            <button
              onClick={vorOrtSubmit}
              disabled={
                vorOrtSubmitting ||
                !vorOrtKontakt.vorname ||
                !vorOrtKontakt.nachname ||
                !vorOrtKontakt.telefon ||
                !vorOrtKontakt.email.includes('@')
              }
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95 disabled:opacity-40"
              style={{ background: '#0D1B3E', fontFamily: 'Montserrat, sans-serif' }}
            >
              {vorOrtSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Wird gesendet …
                </>
              ) : (
                t('vor_ort_kontakt.cta')
              )}
            </button>
            <button
              onClick={() => setPhase('vor_ort_fotos')}
              className="mt-3 w-full text-center text-xs"
              style={{ color: '#7BA3CC' }}
            >
              {t('vor_ort_kontakt.zurueck')}
            </button>
          </div>
        </div>
      )}

      {/* Vor-Ort-Erfolg */}
      {phase === 'vor_ort_erfolg' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0">
          <div
            className="mx-4 w-full max-w-sm rounded-3xl border border-white/40 p-7 text-center"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18)',
            }}
          >
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(34,160,107,0.12)' }}
            >
              <Check className="h-8 w-8" style={{ color: '#22A06B' }} />
            </div>
            <h2
              className="mb-2 text-2xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('vor_ort_erfolg.heading')}
            </h2>
            <p className="mb-4 text-sm" style={{ color: '#4573A2' }}>
              {t('vor_ort_erfolg.sub', { telefon: vorOrtKontakt.telefon })}
            </p>
            <div
              className="rounded-2xl border-2 border-dashed p-4 text-left"
              style={{ borderColor: 'rgba(34,160,107,0.3)', background: 'rgba(34,160,107,0.04)' }}
            >
              <p className="text-xs" style={{ color: '#1E3A5F' }}>
                <strong>{vorOrtFotos.length}</strong> Foto{vorOrtFotos.length === 1 ? '' : 's'} gespeichert
                {kundeLatLng && (
                  <>
                    {' '}· GPS{' '}
                    <span className="font-mono">
                      {kundeLatLng.lat.toFixed(4)}, {kundeLatLng.lng.toFixed(4)}
                    </span>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs" style={{ color: '#1E3A5F' }}>
                Zeitstempel: {new Date().toLocaleString('de-DE')}
              </p>
            </div>
            {vorOrtAnfrageId && (
              <p className="mt-4 font-mono text-xs" style={{ color: 'rgba(13,27,62,0.3)' }}>
                Ref: {vorOrtAnfrageId.slice(0, 8).toUpperCase()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Q1 Wann — Sofort / Heute / Tage. Bestimmt Slot-Generierung + späteren Tracking-Pfad. */}
      {phase === 'wann' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0">
          <div
            className="glass-card mx-4 w-full max-w-sm rounded-3xl p-7"
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
              {t('wann.heading')}
            </h2>
            <p className="mb-6 text-center text-sm" style={{ color: '#4573A2' }}>
              {t('wann.sub')}
            </p>

            <div className="flex flex-col gap-2.5">
              {([
                { wert: 'sofort', icon: Zap, titelKey: 'wann.sofort_titel', subKey: 'wann.sofort_sub' },
                { wert: 'heute', icon: Clock, titelKey: 'wann.heute_titel', subKey: 'wann.heute_sub' },
                { wert: 'tage', icon: Calendar, titelKey: 'wann.tage_titel', subKey: 'wann.tage_sub' },
              ] as const).map(({ wert, icon: Icon, titelKey, subKey }) => (
                <button
                  key={wert}
                  onClick={() => {
                    setWann(wert)
                    setPhase('schaden')
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
                      {t(titelKey)}
                    </p>
                    <p className="text-xs" style={{ color: '#4573A2' }}>
                      {t(subKey)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0" style={{ color: '#7BA3CC' }} />
                </button>
              ))}
            </div>

            <p className="mt-4 text-center text-xs" style={{ color: '#7BA3CC' }}>
              {t('legal')}
            </p>
          </div>
        </div>
      )}

      {/* Q2 Schaden — Schadentyp + Kennzeichen. KZ optional via Fahrerflucht-Toggle. */}
      {phase === 'schaden' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0 overflow-y-auto">
          <div
            className="glass-card mx-4 my-4 w-full max-w-sm rounded-3xl p-7"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18), 0 1px 0 rgba(255,255,255,0.9) inset',
            }}
          >
            <h2
              className="mb-2 text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('schaden.heading')}
            </h2>
            <p className="mb-5 text-sm" style={{ color: '#4573A2' }}>
              {t('schaden.sub')}
            </p>

            <div className="mb-5 flex flex-col gap-2">
              {([
                { wert: 'auffahrunfall', emoji: '🚗', labelKey: 'schaden.auffahrunfall' },
                { wert: 'parkschaden', emoji: '🅿️', labelKey: 'schaden.parkschaden' },
                { wert: 'kreuzungsunfall', emoji: '🔀', labelKey: 'schaden.kreuzungsunfall' },
                { wert: 'wildschaden', emoji: '🦌', labelKey: 'schaden.wildschaden' },
                { wert: 'sonstiges', emoji: '⚠️', labelKey: 'schaden.sonstiges' },
              ] as const).map(({ wert, emoji, labelKey }) => {
                const aktiv = schadentyp === wert
                return (
                  <button
                    key={wert}
                    onClick={() => setSchadentyp(wert)}
                    className="flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all"
                    style={{
                      background: aktiv ? '#0D1B3E' : 'rgba(248,249,251,0.9)',
                      borderColor: aktiv ? '#0D1B3E' : 'rgba(13,27,62,0.12)',
                      color: aktiv ? '#fff' : '#0D1B3E',
                    }}
                  >
                    <span className="text-lg">{emoji}</span>
                    <span className="flex-1" style={{ fontFamily: 'Montserrat, sans-serif' }}>{t(labelKey)}</span>
                    {aktiv && <Check className="h-4 w-4" />}
                  </button>
                )
              })}
            </div>

            <p
              className="mb-2 text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#4573A2' }}
            >
              {t('schaden.kz_label')}
            </p>
            <input
              type="text"
              value={kennzeichen}
              onChange={(e) => setKennzeichen(e.target.value.toUpperCase())}
              placeholder={t('schaden.kz_placeholder')}
              maxLength={10}
              autoCapitalize="characters"
              spellCheck={false}
              disabled={kzUnbekannt}
              className="w-full rounded-2xl border px-4 py-3 text-sm font-mono tracking-wider outline-none disabled:opacity-50"
              style={{
                background: 'rgba(248,249,251,0.9)',
                borderColor: 'rgba(13,27,62,0.12)',
                color: '#0D1B3E',
              }}
            />

            <button
              type="button"
              onClick={() => {
                setKzUnbekannt((v) => !v)
                if (!kzUnbekannt) setKennzeichen('')
              }}
              className="mt-2 text-xs"
              style={{
                color: kzUnbekannt ? '#0D1B3E' : '#4573A2',
                fontWeight: kzUnbekannt ? 700 : 400,
              }}
            >
              {kzUnbekannt ? t('schaden.kz_unbekannt_set') : t('schaden.kz_unbekannt')}
            </button>

            <button
              onClick={() => setPhase('fahrzeug')}
              disabled={!schadentyp || (!kzUnbekannt && kennzeichen.trim().length < 4)}
              className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95"
              style={{
                background: !schadentyp || (!kzUnbekannt && kennzeichen.trim().length < 4)
                  ? 'rgba(13,27,62,0.25)'
                  : '#0D1B3E',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              Weiter →
            </button>

            <button
              onClick={() => setPhase('wann')}
              className="mt-3 w-full text-center text-xs"
              style={{ color: '#7BA3CC' }}
            >
              ← Zurück
            </button>
          </div>
        </div>
      )}

      {/* Q3 Fahrzeug — PKW/Motorrad/Transporter/LKW/Wohnmobil. Bestimmt SV-Spezialisierung. */}
      {phase === 'fahrzeug' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0 overflow-y-auto">
          <div
            className="glass-card mx-4 my-4 w-full max-w-sm rounded-3xl p-7"
            style={{
              background: 'rgba(255,255,255,0.82)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18), 0 1px 0 rgba(255,255,255,0.9) inset',
            }}
          >
            <h2
              className="mb-2 text-xl font-bold"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('fahrzeug.heading')}
            </h2>
            <p className="mb-5 text-sm" style={{ color: '#4573A2' }}>
              {t('fahrzeug.sub')}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {([
                { wert: 'pkw', emoji: '🚗' },
                { wert: 'motorrad', emoji: '🏍️' },
                { wert: 'transporter', emoji: '🚐' },
                { wert: 'lkw', emoji: '🚛' },
                { wert: 'wohnmobil', emoji: '🚌' },
              ] as const).map(({ wert, emoji }) => {
                const aktiv = fahrzeugtyp === wert
                return (
                  <button
                    key={wert}
                    onClick={() => setFahrzeugtyp(wert)}
                    className="flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-4 text-sm font-medium transition-all"
                    style={{
                      background: aktiv ? '#0D1B3E' : 'rgba(248,249,251,0.9)',
                      borderColor: aktiv ? '#0D1B3E' : 'rgba(13,27,62,0.12)',
                      color: aktiv ? '#fff' : '#0D1B3E',
                    }}
                  >
                    <span className="text-2xl">{emoji}</span>
                    <span style={{ fontFamily: 'Montserrat, sans-serif' }}>{t(`fahrzeug.${wert}`)}</span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setPhase('gps')}
              disabled={!fahrzeugtyp}
              className="mt-6 w-full rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95"
              style={{
                background: !fahrzeugtyp ? 'rgba(13,27,62,0.25)' : '#0D1B3E',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              {t('fahrzeug.weiter')}
            </button>

            <button
              onClick={() => setPhase('schaden')}
              className="mt-3 w-full text-center text-xs"
              style={{ color: '#7BA3CC' }}
            >
              {t('fahrzeug.zurueck')}
            </button>
          </div>
        </div>
      )}

      {phase === 'gps' && (
        <div className="absolute inset-0 flex items-end justify-center pb-12 sm:items-center sm:pb-0">
          <div
            className="glass-card mx-4 w-full max-w-sm rounded-3xl p-7"
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
              {t('gps.heading')}
            </h2>
            <p className="mb-6 text-center text-sm" style={{ color: '#4573A2' }}>
              {t('gps.sub')}
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
                  {t('gps.loading')}
                </>
              ) : (
                <>
                  <MapPin className="h-5 w-5" />
                  {t('gps.cta')}
                </>
              )}
            </button>

            <p className="mt-3 text-center text-xs" style={{ color: '#7BA3CC' }}>
              {t('gps.hint')}
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
              ? t('karte.banner', { count: naechsteSVList.length })
              : t('karte.banner_keine')}
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
                      {t('detail.entfernt', { km: gewaehlterSV.distanzKm.toFixed(1) })}
                    </span>
                    <span
                      className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                      style={{ background: 'rgba(69,115,162,0.1)', color: '#1E3A5F' }}
                    >
                      <Shield className="h-3 w-3" />
                      {t('detail.dat_badge')}
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
                    {t('detail.freie_termine')}
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
                      setPhase('ansprueche')
                    }}
                    disabled={!gewaehlterSlot}
                    className="w-full rounded-2xl py-4 text-base font-bold text-white transition-all active:scale-95"
                    style={{
                      background: gewaehlterSlot ? '#0D1B3E' : 'rgba(13,27,62,0.25)',
                      fontFamily: 'Montserrat, sans-serif',
                    }}
                  >
                    {t('detail.termin_reservieren')}
                  </button>

                  <p className="mt-3 text-center text-xs" style={{ color: '#7BA3CC' }}>
                    {t('detail.legal')}
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
                        {t('detail.slot_aendern')}
                      </button>
                    </div>
                  )}

                  <p
                    className="mb-4 text-sm font-semibold"
                    style={{ color: '#0D1B3E', fontFamily: 'Montserrat, sans-serif' }}
                  >
                    {t('formular.heading')}
                  </p>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-3">
                      <input
                        placeholder={t('formular.placeholder_vorname')}
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
                        placeholder={t('formular.placeholder_nachname')}
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
                      placeholder={t('formular.placeholder_telefon')}
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
                      placeholder={t('formular.placeholder_email')}
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
                  </div>

                  {/* Z4: Signatur fuer SA-Vollmacht (Schadens-Abtretung). */}
                  <div className="mt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <p
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: '#4573A2' }}
                      >
                        {t('formular.signatur_label')}
                      </p>
                      {hasSignatur && (
                        <button
                          type="button"
                          onClick={clearSignatur}
                          className="text-[11px] underline"
                          style={{ color: '#7BA3CC' }}
                        >
                          {t('formular.signatur_neu')}
                        </button>
                      )}
                    </div>
                    <div
                      className="relative overflow-hidden rounded-2xl border-2 border-dashed"
                      style={{
                        borderColor: hasSignatur ? '#22A06B' : 'rgba(69,115,162,0.35)',
                        background: '#fafbfc',
                        height: 110,
                      }}
                    >
                      <canvas
                        ref={signaturCanvasRef}
                        className="absolute inset-0 h-full w-full touch-none"
                        onPointerDown={startDrawing}
                        onPointerMove={draw}
                        onPointerUp={stopDrawing}
                        onPointerCancel={stopDrawing}
                      />
                      {!hasSignatur && (
                        <div
                          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm italic"
                          style={{ color: 'rgba(69,115,162,0.5)' }}
                        >
                          {t('formular.signatur_hint')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* AGB-Pflichtcheckbox + Rechtstext-Toggle */}
                  <label
                    className="mt-4 flex cursor-pointer items-start gap-2.5 text-[11px] leading-relaxed"
                    style={{ color: '#4573A2' }}
                  >
                    <input
                      type="checkbox"
                      checked={agbAkzeptiert}
                      onChange={(e) => setAgbAkzeptiert(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
                      style={{ accentColor: '#22A06B' }}
                    />
                    <span>
                      {t.rich('formular.agb_text', {
                        link_agb: (chunks) => (
                          <a href="/agb" target="_blank" className="underline" style={{ color: '#0D1B3E' }}>{chunks}</a>
                        ),
                        link_datenschutz: (chunks) => (
                          <a href="/datenschutz" target="_blank" className="underline" style={{ color: '#0D1B3E' }}>{chunks}</a>
                        ),
                        link_nutzung: (chunks) => (
                          <a href="/nutzungsbedingungen" target="_blank" className="underline" style={{ color: '#0D1B3E' }}>{chunks}</a>
                        ),
                      })}{' '}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          setLegalAusgeklappt((v) => !v)
                        }}
                        className="underline"
                        style={{ color: '#0D1B3E' }}
                      >
                        {legalAusgeklappt ? t('formular.legal_toggle_weniger') : t('formular.legal_toggle_mehr')}
                      </button>
                    </span>
                  </label>

                  {legalAusgeklappt && (
                    <div
                      className="mt-2 rounded-xl border p-3 text-[10px] leading-relaxed"
                      style={{
                        background: 'rgba(248,249,251,0.9)',
                        borderColor: 'rgba(13,27,62,0.1)',
                        color: '#4573A2',
                      }}
                    >
                      {t('formular.legal_volltext')}
                    </div>
                  )}

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
                        {t('formular.sending')}
                      </>
                    ) : (
                      t('formular.cta_senden')
                    )}
                  </button>

                  <p className="mt-3 text-center text-xs" style={{ color: '#7BA3CC' }}>
                    {t('formular.hint_meldung')}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Erfolgs-Screen */}
      {/* Z35 Ansprüche-Überzeugung — größter Conversion-Moment vor dem Formular.
          Vollregulierung (Anwalt + alle Schadenspositionen) vs. Nur-Gutachten. */}
      {phase === 'ansprueche' && (
        <div className="absolute inset-0 flex items-end justify-center overflow-y-auto pb-12 sm:items-center sm:pb-0">
          <div
            className="mx-4 my-4 w-full max-w-md rounded-3xl border border-white/40 p-7"
            style={{
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxShadow: '0 20px 60px rgba(13,27,62,0.18)',
            }}
          >
            <div
              className="mb-4 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider"
              style={{ background: 'rgba(243,192,83,0.18)', color: '#C28A2A' }}
            >
              {t('ansprueche.badge')}
            </div>
            <h2
              className="mb-3 text-2xl font-bold leading-tight"
              style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
            >
              {t('ansprueche.heading')}
            </h2>
            <p className="mb-5 text-sm leading-relaxed" style={{ color: '#4573A2' }}>
              {t.rich('ansprueche.sub', {
                highlight_8von10: (chunks) => <strong style={{ color: '#0D1B3E' }}>{chunks}</strong>,
                highlight_3000: (chunks) => <strong style={{ color: '#0D1B3E' }}>{chunks}</strong>,
              })}
            </p>

            {/* Vollregulierung — empfohlen */}
            <button
              onClick={() => {
                setRegulierung('vollstaendig')
                setPhase('formular')
              }}
              className="mb-3 w-full rounded-2xl border-2 p-5 text-left transition-all active:scale-[0.99]"
              style={{
                background: '#0D1B3E',
                borderColor: '#0D1B3E',
                color: '#fff',
                boxShadow: '0 8px 24px rgba(13,27,62,0.25)',
              }}
            >
              <div
                className="mb-2 inline-block rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(243,192,83,0.25)', color: '#F3C053' }}
              >
              {t('ansprueche.voll_badge')}
              </div>
              <p className="mb-3 text-base font-bold" style={{ fontFamily: 'Montserrat, sans-serif' }}>
              {t('ansprueche.voll_heading')}
              </p>
              <ul className="mb-3 flex flex-col gap-1.5 text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#7BA3CC' }} />
                  <span>{t('ansprueche.voll_li1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#7BA3CC' }} />
                  <span>{t('ansprueche.voll_li2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: '#7BA3CC' }} />
                  <span>{t('ansprueche.voll_li3')}</span>
                </li>
              </ul>
              <div
                className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold"
                style={{ background: 'rgba(123,163,204,0.15)', color: '#7BA3CC' }}
              >
                <Check className="h-3 w-3" />
                {t('ansprueche.voll_kostenlos')}
              </div>
            </button>

            {/* Beispielrechnung */}
            <div
              className="mb-4 rounded-2xl border p-4"
              style={{ background: 'rgba(248,249,251,0.9)', borderColor: 'rgba(13,27,62,0.1)' }}
            >
              <p
                className="mb-3 text-[9px] font-bold uppercase tracking-wider"
                style={{ color: '#4573A2' }}
              >
              {t('ansprueche.beispiel_label')}
              </p>
              <div className="flex flex-col gap-1.5 text-xs" style={{ color: '#0D1B3E' }}>
                {[
                  { label: 'Reparatur', wert: '4.800 €' },
                  { label: 'Nutzungsausfall / Mietwagen', wert: 'ca. 530 €' },
                  { label: 'Wertminderung', wert: 'ca. 650 €' },
                  { label: 'Ersatzteil-Aufschläge (UPE)', wert: 'ca. 285 €' },
                  { label: 'Unfallpauschale', wert: 'ca. 30 €' },
                ].map(({ label, wert }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Check className="h-3 w-3" style={{ color: '#22A06B' }} />
                      {label}
                    </span>
                    <span className="font-mono">{wert}</span>
                  </div>
                ))}
              </div>
              <div
                className="mt-3 flex items-center justify-between border-t pt-3"
                style={{ borderColor: 'rgba(13,27,62,0.08)' }}
              >
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#22A06B' }}>
                    {t('ansprueche.beispiel_plus')}
                  </p>
                  <p className="text-[10px]" style={{ color: '#7BA3CC' }}>
                    {t('ansprueche.beispiel_anwalt')}
                  </p>
                </div>
                <p className="font-mono text-xl font-bold" style={{ color: '#22A06B' }}>
                  +3.270 €
                </p>
              </div>
            </div>

            {/* Sekundär-Pfad: Nur Gutachten */}
            <button
              onClick={() => {
                setRegulierung('nur_gutachten')
                setPhase('formular')
              }}
              className="w-full rounded-xl py-2.5 text-xs"
              style={{ color: '#7BA3CC' }}
            >
              {t('ansprueche.nur_gutachten')}
            </button>

            <button
              onClick={() => setPhase('detail')}
              className="mt-1 w-full text-center text-[11px]"
              style={{ color: '#9BAAB8' }}
            >
              {t('ansprueche.zurueck')}
            </button>
          </div>
        </div>
      )}

      {phase === 'erfolg' && (
        <div className="absolute inset-0 flex items-end justify-center overflow-y-auto pb-12 sm:items-center sm:pb-0" style={{ zIndex: 20 }}>
          <div
            className="mx-4 my-4 w-full max-w-sm rounded-3xl border border-white/40 p-7 text-center"
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
              {t('erfolg.heading')}
            </h2>
            <p className="mb-2 text-sm" style={{ color: '#4573A2' }}>
              {t('erfolg.sub', { sv_vorname: gewaehlterSV?.vorname ?? '' })}
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
            {konvertierungOk ? (
              <div
                className="rounded-2xl border px-4 py-3 text-left"
                style={{
                  background: 'rgba(34,160,107,0.08)',
                  borderColor: 'rgba(34,160,107,0.25)',
                }}
              >
                <p
                  className="flex items-center gap-2 text-sm font-semibold"
                  style={{ color: '#0D1B3E', fontFamily: 'Montserrat, sans-serif' }}
                >
                  <Check className="h-4 w-4" style={{ color: '#22A06B' }} />
                  {t('erfolg.magic_link_heading')}
                </p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: '#1E3A5F' }}>
                  {t('erfolg.magic_link_sub', { email: formData.email })}
                </p>
              </div>
            ) : (
              <p className="text-xs" style={{ color: '#7BA3CC' }}>
                {t('erfolg.email_hint')}
              </p>
            )}

            {anfrageId && (
              <p className="mt-3 text-xs font-mono" style={{ color: 'rgba(13,27,62,0.3)' }}>
                Ref: {anfrageId.slice(0, 8).toUpperCase()}
              </p>
            )}

            {/* ZB1-Schnellstart: Fahrzeugschein scannen → Imagin-Visualisierung +
                FIN-Vorschadencheck im Hintergrund. Macht das spätere Onboarding 1-Klick. */}
            <div
              className="mt-6 rounded-2xl border-2 border-dashed p-4 text-left"
              style={{
                borderColor: zb1Result ? 'rgba(34,160,107,0.3)' : 'rgba(69,115,162,0.3)',
                background: zb1Result ? 'rgba(34,160,107,0.04)' : 'rgba(69,115,162,0.04)',
              }}
            >
              {!zb1Result && (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <Sparkles className="h-4 w-4" style={{ color: '#4573A2' }} />
                    <p
                      className="text-sm font-bold"
                      style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
                    >
                      {t('erfolg.zb1_heading')}
                    </p>
                  </div>
                  <p className="mb-3 text-xs leading-relaxed" style={{ color: '#4573A2' }}>
                    {t('erfolg.zb1_sub')}
                  </p>

                  {zb1Error && (
                    <p className="mb-2 text-xs" style={{ color: '#B45309' }}>
                      {zb1Error}
                    </p>
                  )}

                  <label
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white cursor-pointer active:scale-[0.98] transition-all"
                    style={{
                      background: zb1Loading ? 'rgba(13,27,62,0.5)' : '#0D1B3E',
                      fontFamily: 'Montserrat, sans-serif',
                    }}
                  >
                    {zb1Loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('erfolg.zb1_scanning')}
                      </>
                    ) : (
                      <>
                        <Camera className="h-4 w-4" />
                        {t('erfolg.zb1_cta')}
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      disabled={zb1Loading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) handleZb1Upload(f)
                        e.target.value = ''
                      }}
                    />
                  </label>
                </>
              )}

              {zb1Result && (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <Check className="h-4 w-4" style={{ color: '#22A06B' }} />
                    <p
                      className="text-sm font-bold"
                      style={{ fontFamily: 'Montserrat, sans-serif', color: '#0D1B3E' }}
                    >
                      {t('erfolg.zb1_felder', { count: zb1Result.fields_found })}
                    </p>
                  </div>

                  {/* Imagin-Visual des Fahrzeugs */}
                  {zb1Result.imagin_url && (
                    <div
                      className="mb-3 overflow-hidden rounded-xl"
                      style={{ background: 'rgba(248,249,251,0.8)' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={zb1Result.imagin_url}
                        alt="Ihr Fahrzeug"
                        className="h-32 w-full object-contain"
                      />
                    </div>
                  )}

                  <ul className="flex flex-col gap-1 text-xs" style={{ color: '#0D1B3E' }}>
                    {zb1Result.extracted.fin_vin && (
                      <li className="flex justify-between">
                        <span style={{ color: '#4573A2' }}>FIN</span>
                        <span className="font-mono font-medium">{zb1Result.extracted.fin_vin}</span>
                      </li>
                    )}
                    {zb1Result.extracted.kennzeichen && (
                      <li className="flex justify-between">
                        <span style={{ color: '#4573A2' }}>Kennzeichen</span>
                        <span className="font-medium">{zb1Result.extracted.kennzeichen}</span>
                      </li>
                    )}
                    {(zb1Result.extracted.fahrzeug_hersteller || zb1Result.extracted.fahrzeug_modell) && (
                      <li className="flex justify-between">
                        <span style={{ color: '#4573A2' }}>Fahrzeug</span>
                        <span className="font-medium">
                          {[zb1Result.extracted.fahrzeug_hersteller, zb1Result.extracted.fahrzeug_modell]
                            .filter(Boolean).join(' ')}
                        </span>
                      </li>
                    )}
                  </ul>

                  {zb1Result.extracted.fin_vin && (
                    <p
                      className="mt-3 rounded-lg px-3 py-2 text-[11px] leading-relaxed"
                      style={{ background: 'rgba(69,115,162,0.08)', color: '#1E3A5F' }}
                    >
                      {t('erfolg.zb1_fin_hint')}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
