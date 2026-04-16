'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { MapPinIcon, UsersIcon, FlameIcon, ArrowUpIcon, XIcon, SendIcon, EyeIcon, LayersIcon } from 'lucide-react'
import { PAKETE, getPaket } from '@/lib/pakete'

const PAKET_ORDER: string[] = ['standard', 'pro', 'premium']
const MAPS_ID = 'gebiet-maps-script'

type SvData = { id: string; lat: number; lng: number; paket: string; iso: unknown; anzahlungBezahlt: number; radius_km: number }
type Neighbor = { id: string; typ: string; paket: string; lat: number; lng: number; iso: { lat: number; lng: number }[]; radius_km: number }

function pointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng
    const xj = polygon[j].lat, yj = polygon[j].lng
    if ((yi > point.lng) !== (yj > point.lng) && point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function polygonsTouching(a: { lat: number; lng: number }[], b: { lat: number; lng: number }[]): boolean {
  // Check if any point of B is inside A or vice versa
  for (const p of b) { if (pointInPolygon(p, a)) return true }
  for (const p of a) { if (pointInPolygon(p, b)) return true }
  return false
}

function approxAreaKm2(polygon: { lat: number; lng: number }[]): number {
  if (polygon.length < 3) return 0
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length
    area += polygon[i].lng * polygon[j].lat
    area -= polygon[j].lng * polygon[i].lat
  }
  area = Math.abs(area) / 2
  // Convert degree² to km² (rough: 1° lat ≈ 111km, 1° lng ≈ 111km * cos(lat))
  const avgLat = polygon.reduce((s, p) => s + p.lat, 0) / polygon.length
  const kmPerDegLat = 111
  const kmPerDegLng = 111 * Math.cos(avgLat * Math.PI / 180)
  return area * kmPerDegLat * kmPerDegLng
}

export default function GebietPage() {
  const supabase = createClient()
  const mapRef = useRef<HTMLDivElement>(null)
  const gMapRef = useRef<google.maps.Map | null>(null)
  const ownPolyRef = useRef<google.maps.Polygon | null>(null)
  const neighborPolysRef = useRef<google.maps.Polygon[]>([])
  const previewPolyRef = useRef<google.maps.Polygon | null>(null)
  const [loading, setLoading] = useState(true)
  const [svData, setSvData] = useState<SvData | null>(null)
  const [neighbors, setNeighbors] = useState<Neighbor[]>([])
  const [touchingNeighbors, setTouchingNeighbors] = useState<Neighbor[]>([])
  const [layers, setLayers] = useState({ gebiet: true, nachbarn: true, hotspots: false, vorschau: false })
  const [upgrading, setUpgrading] = useState(false)
  const [previewPaket, setPreviewPaket] = useState<string | null>(null)
  const [showAnfrageModal, setShowAnfrageModal] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // Load own data + all neighbors
  // AAR-253: Error-Handling — Spinner hing wenn Queries fehlschlugen.
  const load = useCallback(async () => {
    try {
      const user = (await supabase.auth.getUser())?.data?.user ?? null
      if (!user) { setLoading(false); return }
      const { data: sv } = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket, isochrone_polygon, anzahlung_faellig, radius_km').or(`profile_id.eq.${user.id},user_id.eq.${user.id}`).single()
      if (sv?.standort_lat) {
        const paketInfo = getPaket(sv.paket ?? 'standard')
        setSvData({ id: sv.id, lat: Number(sv.standort_lat), lng: Number(sv.standort_lng), paket: sv.paket ?? 'standard', iso: sv.isochrone_polygon, anzahlungBezahlt: Number(sv.anzahlung_faellig ?? 750), radius_km: sv.radius_km ?? paketInfo.radius_km })
        const { data: allSvs } = await supabase.from('sachverstaendige').select('id, gutachter_typ, paket, standort_lat, standort_lng, isochrone_polygon, radius_km').neq('id', sv.id).eq('ist_aktiv', true).not('standort_lat', 'is', null)
        const ns: Neighbor[] = (allSvs ?? []).filter(n => n.isochrone_polygon && Array.isArray(n.isochrone_polygon)).map(n => ({
          id: n.id, typ: n.gutachter_typ ?? '', paket: n.paket ?? 'standard',
          lat: Number(n.standort_lat), lng: Number(n.standort_lng),
          iso: n.isochrone_polygon as { lat: number; lng: number }[],
          radius_km: n.radius_km ?? getPaket(n.paket ?? 'standard').radius_km,
        }))
        setNeighbors(ns)
        if (sv.isochrone_polygon && Array.isArray(sv.isochrone_polygon)) {
          const ownPoly = sv.isochrone_polygon as { lat: number; lng: number }[]
          setTouchingNeighbors(ns.filter(n => polygonsTouching(ownPoly, n.iso)))
        }
      }
    } catch (err) {
      console.error('[AAR-253] Gebiet-Load fehlgeschlagen:', err)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Init map
  useEffect(() => {
    if (!svData || !mapRef.current || gMapRef.current) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
    if (!key) return

    function init() {
      if (typeof google === 'undefined' || !google.maps) return false
      gMapRef.current = new google.maps.Map(mapRef.current!, {
        center: { lat: svData!.lat, lng: svData!.lng }, zoom: 10,
        styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
      })

      // Own marker
      new google.maps.Marker({ position: { lat: svData!.lat, lng: svData!.lng }, map: gMapRef.current!, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#3b82f6', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 } })

      // Own isochrone polygon
      if (svData!.iso && Array.isArray(svData!.iso)) {
        ownPolyRef.current = new google.maps.Polygon({
          paths: (svData!.iso as { lat: number; lng: number }[]),
          map: gMapRef.current!, fillColor: '#3b82f6', fillOpacity: 0.15,
          strokeColor: '#3b82f6', strokeOpacity: 0.5, strokeWeight: 2,
        })
      }

      setMapReady(true)
      return true
    }

    if (init()) return
    if (document.getElementById(MAPS_ID)) { const iv = setInterval(() => { if (init()) clearInterval(iv) }, 200); return }
    const s = document.createElement('script'); s.id = MAPS_ID
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=visualization`
    s.async = true; s.onload = () => init(); document.head.appendChild(s)
  }, [svData])

  // Draw neighbor polygons
  useEffect(() => {
    if (!gMapRef.current || !mapReady) return

    // Cleanup old
    neighborPolysRef.current.forEach(p => { google.maps.event.clearInstanceListeners(p); p.setMap(null) })
    neighborPolysRef.current = []

    if (!layers.nachbarn) return

    touchingNeighbors.forEach(n => {
      const poly = new google.maps.Polygon({
        paths: n.iso, map: gMapRef.current!,
        fillColor: '#9ca3af', fillOpacity: 0.08,
        strokeColor: '#9ca3af', strokeOpacity: 0.3, strokeWeight: 1,
        clickable: true,
      })
      const infoWindow = new google.maps.InfoWindow()
      poly.addListener('mouseover', () => {
        poly.setOptions({ fillOpacity: 0.15, strokeWeight: 2 })
        const paketLabel = getPaket(n.paket).name
        infoWindow.setContent(`<div style="font-size:12px;color:#333"><strong>${n.typ}</strong><br/>Paket: ${paketLabel}</div>`)
        infoWindow.setPosition({ lat: n.lat, lng: n.lng })
        infoWindow.open(gMapRef.current!)
      })
      poly.addListener('mouseout', () => {
        poly.setOptions({ fillOpacity: 0.08, strokeWeight: 1 })
        infoWindow.close()
      })
      neighborPolysRef.current.push(poly)
    })

    // Draw competitor markers for those without isochrone
    neighbors.filter(n => !touchingNeighbors.includes(n)).forEach(n => {
      new google.maps.Marker({
        position: { lat: n.lat, lng: n.lng }, map: gMapRef.current!,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#9ca3af', fillOpacity: 0.5, strokeColor: '#fff', strokeWeight: 1 },
      })
    })
  }, [touchingNeighbors, neighbors, mapReady, layers.nachbarn])

  // Toggle own polygon visibility
  useEffect(() => {
    if (ownPolyRef.current) {
      ownPolyRef.current.setMap(layers.gebiet ? gMapRef.current : null)
    }
  }, [layers.gebiet])

  // Upgrade preview polygon
  useEffect(() => {
    if (previewPolyRef.current) { previewPolyRef.current.setMap(null); previewPolyRef.current = null }
    if (!previewPaket || !svData || !gMapRef.current || !layers.vorschau) return

    const paketInfo = getPaket(previewPaket)
    // Generate a simple circle polygon for preview
    const points: { lat: number; lng: number }[] = []
    const radiusKm = paketInfo.radius_km
    for (let angle = 0; angle < 360; angle += 10) {
      const rad = (angle * Math.PI) / 180
      const dLat = (radiusKm / 111) * Math.cos(rad)
      const dLng = (radiusKm / (111 * Math.cos(svData.lat * Math.PI / 180))) * Math.sin(rad)
      points.push({ lat: svData.lat + dLat, lng: svData.lng + dLng })
    }
    previewPolyRef.current = new google.maps.Polygon({
      paths: points, map: gMapRef.current,
      fillColor: '#93c5fd', fillOpacity: 0.08,
      strokeColor: '#3b82f6', strokeOpacity: 0.6, strokeWeight: 2,
      geodesic: true,
    })
    // Make it dashed via icons on polyline overlay
  }, [previewPaket, svData, mapReady, layers.vorschau])

  async function requestUpgrade(neuPaket: string) {
    if (!svData) return; setUpgrading(true)
    const altInfo = getPaket(svData.paket)
    const neuInfo = getPaket(neuPaket)
    const differenz = neuInfo.anzahlung - altInfo.anzahlung

    await supabase.from('paket_upgrades').insert({
      sv_id: svData.id, altes_paket: svData.paket, neues_paket: neuPaket,
      differenz_anzahlung: Math.max(0, differenz),
    })
    toast.success(`Upgrade-Anfrage gesendet! Differenz-Anzahlung: ${Math.max(0, differenz).toLocaleString('de-DE')}€`)
    setUpgrading(false)
  }

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-[#4573A2] border-t-transparent rounded-full animate-spin" /></div>
  if (!svData) return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="bg-white border border-amber-200 rounded-2xl p-8 text-center max-w-md">
        <MapPinIcon className="w-10 h-10 text-amber-400 mx-auto mb-3" />
        <p className="text-gray-900 font-semibold mb-2">Standort nicht hinterlegt</p>
        <p className="text-gray-500 text-sm mb-4">Bitte hinterlegen Sie Ihren Standort im Profil, damit wir Ihr Einsatzgebiet berechnen können.</p>
        <a href="/gutachter/profil" className="inline-block bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors">Zum Profil</a>
      </div>
    </div>
  )

  const currentPaket = getPaket(svData.paket)
  const ownPoly = svData.iso && Array.isArray(svData.iso) ? svData.iso as { lat: number; lng: number }[] : []
  const areaKm2 = ownPoly.length > 0 ? approxAreaKm2(ownPoly) : 0
  const overlapPct = touchingNeighbors.length > 0 ? Math.min(95, touchingNeighbors.length * 15) : 0

  return (
    // BUG-98 Cleanup: -mx-* negiert das horizontale Padding des PageContainer
    // damit die Karte fullbleed laufen kann.
    <div className="h-full flex flex-col overflow-hidden -mx-4 sm:-mx-6 md:-mx-8 lg:-mx-16 xl:-mx-24">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-gray-900">Mein Gebiet</h1>
          <p className="text-xs text-gray-500">{currentPaket.name} · {currentPaket.radius_km}km Radius · {currentPaket.faelle} Fälle/Monat</p>
        </div>
        <div className="flex gap-1">
          {([
            ['gebiet', 'Gebiet', MapPinIcon],
            ['nachbarn', 'Nachbarn', UsersIcon],
            ['hotspots', 'Hotspots', FlameIcon],
            ['vorschau', 'Vorschau', EyeIcon],
          ] as const).map(([k, l, I]) => (
            <button key={k} onClick={() => setLayers(p => ({ ...p, [k]: !p[k] }))}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium ${layers[k] ? 'bg-[#4573A2]/5 text-[#4573A2]' : 'bg-gray-100 text-gray-400'}`}>
              <I className="w-3 h-3" /> {l}
            </button>
          ))}
        </div>
      </div>

      {/* Map + Sidebar */}
      <div className="flex-1 min-h-0 flex" style={{ minHeight: 0 }}>
        <div className="flex-1 relative" style={{ minHeight: 0 }}>
          <div ref={mapRef} className="absolute inset-0" />

          {/* BUG-90: Fallback-Hinweis wenn Isochrone noch leer ist (z.B.
              direkt nach Anlage / OSRM hat noch nicht durchgerechnet). */}
          {mapReady && svData && (!svData.iso || (Array.isArray(svData.iso) && (svData.iso as { lat: number; lng: number }[]).length === 0)) && (
            <div className="absolute top-3 right-3 z-10 bg-amber-50/95 backdrop-blur-sm border border-amber-200 rounded-xl p-3 max-w-xs text-xs">
              <p className="font-semibold text-amber-700">Einsatzgebiet wird berechnet</p>
              <p className="text-amber-600 mt-0.5">
                Dein Einsatzgebiet wird gerade berechnet. Komm in wenigen Minuten zurück oder lade die Seite neu.
              </p>
            </div>
          )}

          {/* Stats Box */}
          {mapReady && (
            <div className="absolute top-3 left-3 z-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-3 space-y-1 text-xs max-w-[200px]">
              <p className="font-semibold text-gray-700 text-[11px]">Gebiet-Statistiken</p>
              <div className="flex justify-between"><span className="text-gray-500">Ihr Gebiet:</span><span className="text-gray-800 font-medium">{areaKm2.toFixed(0)} km²</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Nachbar-SV:</span><span className="text-gray-800 font-medium">{touchingNeighbors.length}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Überlappung:</span><span className="text-amber-600 font-medium">~{overlapPct}%</span></div>
              {previewPaket && (
                <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                  <span className="text-[#4573A2]">Upgrade-Fläche:</span>
                  <span className="text-[#4573A2] font-medium">+{Math.round(Math.PI * getPaket(previewPaket).radius_km ** 2 - areaKm2)} km²</span>
                </div>
              )}
            </div>
          )}

          {/* Legende */}
          {mapReady && (
            <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-xl p-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Legende</p>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#4573A2] opacity-70" />
                <span className="text-[11px] text-gray-700">Eigenes Gebiet</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400 opacity-50" />
                <span className="text-[11px] text-gray-700">Nachbar-Gebiete</span>
              </div>
              {layers.vorschau && previewPaket && (
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-[#4573A2] border-dashed" />
                  <span className="text-[11px] text-[#4573A2]">Upgrade-Vorschau</span>
                </div>
              )}
              <div className="border-t border-gray-200 pt-1.5 mt-1.5 space-y-0.5">
                <p className="text-[10px] text-gray-500">Standard: {PAKETE.standard.radius_km}km</p>
                <p className="text-[10px] text-gray-500">Pro: {PAKETE.pro.radius_km}km</p>
                <p className="text-[10px] text-gray-500">Premium: {PAKETE.premium.radius_km}km</p>
              </div>
            </div>
          )}
        </div>

        {/* Info + Upgrade Sidebar */}
        <div className="w-80 hidden lg:block overflow-y-auto p-3 space-y-3 border-l border-gray-200 bg-white">

          {/* ─── Gebiets-Info ─── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ihr Gebiet</p>
            <div className="border-2 border-[#4573A2] rounded-xl p-3 mb-2">
              <p className="text-sm font-semibold text-[#4573A2]">{currentPaket.name}</p>
              <p className="text-[10px] text-gray-500">{currentPaket.faelle} Fälle/Mo · {currentPaket.radius_km}km · {currentPaket.preis}€/Mo</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-gray-900">{currentPaket.radius_km} km</p>
                <p className="text-[9px] text-gray-500">Einsatzradius</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-gray-900">{areaKm2.toFixed(0)} km²</p>
                <p className="text-[9px] text-gray-500">Gebietsfläche</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-gray-900">{touchingNeighbors.length}</p>
                <p className="text-[9px] text-gray-500">Nachbar-SV</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-sm font-bold text-amber-600">~{overlapPct}%</p>
                <p className="text-[9px] text-gray-500">Überlappung</p>
              </div>
            </div>
          </div>

          {/* ─── Upgrade-Bereich ─── */}
          {PAKET_ORDER.indexOf(svData.paket) < PAKET_ORDER.length - 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Paket-Upgrade</p>
              {PAKET_ORDER.filter(k => PAKET_ORDER.indexOf(k) > PAKET_ORDER.indexOf(svData.paket)).map(key => {
                const info = getPaket(key)
                const alteAnzahlung = currentPaket.anzahlung
                const neueAnzahlung = info.anzahlung
                const differenz = neueAnzahlung - alteAnzahlung
                const isPreview = previewPaket === key
                return (
                  <div key={key} className={`border rounded-xl p-3 mb-2 transition-colors ${isPreview ? 'border-[#4573A2] bg-[#4573A2]/10' : 'border-gray-200 hover:border-[#4573A2]/30'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-gray-900">{info.name}</p>
                      {key === 'pro' && <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full">Empfohlen</span>}
                    </div>
                    <p className="text-[10px] text-gray-500 mb-1">{info.faelle} Fälle · {info.radius_km}km · {info.preis}€/Mo</p>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mb-2">
                      <p className="text-[10px] text-gray-600">Neue Anzahlung: <span className="font-medium">{neueAnzahlung.toLocaleString('de-DE')}€</span></p>
                      <p className="text-[10px] text-gray-600">Bereits bezahlt: <span className="font-medium">{alteAnzahlung.toLocaleString('de-DE')}€</span></p>
                      <p className="text-xs font-bold text-amber-700 mt-0.5">Differenz: {differenz.toLocaleString('de-DE')}€</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setPreviewPaket(isPreview ? null : key); setLayers(p => ({ ...p, vorschau: true })) }}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-lg border ${isPreview ? 'border-[#4573A2] text-[#4573A2] bg-[#4573A2]/5' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        <EyeIcon className="w-3 h-3" /> Vorschau
                      </button>
                      <button onClick={() => requestUpgrade(key)} disabled={upgrading}
                        className="flex-1 flex items-center justify-center gap-1 bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg">
                        <ArrowUpIcon className="w-3 h-3" /> Upgrade
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Individuelles Angebot */}
          <div className="border-t border-gray-200 pt-3">
            <button onClick={() => setShowAnfrageModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium py-3 rounded-xl transition-colors">
              <SendIcon className="w-3.5 h-3.5" /> Individuelles Angebot anfragen
            </button>
          </div>
        </div>
      </div>

      {/* Individuelles Angebot Modal */}
      {showAnfrageModal && svData && (
        <IndividuellesAngebotModal svId={svData.id} onClose={() => setShowAnfrageModal(false)} />
      )}
    </div>
  )
}

function IndividuellesAngebotModal({ svId, onClose }: { svId: string; onClose: () => void }) {
  const supabase = createClient()
  const [faelle, setFaelle] = useState(30)
  const [radius, setRadius] = useState(50)
  const [nachricht, setNachricht] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit() {
    setSending(true)
    try {
      await supabase.from('individuelle_anfragen').insert({
        sv_id: svId,
        gewuenschte_faelle: faelle,
        gewuenschter_radius_km: radius,
        nachricht: nachricht || null,
      })
      // Create notification for admin
      try {
        await supabase.from('benachrichtigungen').insert({
          typ: 'update',
          titel: 'Individuelle Paket-Anfrage',
          nachricht: `Gutachter hat ein individuelles Paket angefragt: ${faelle} Fälle, ${radius}km Radius`,
          link: '/admin/finance',
          empfaenger_rolle: 'admin',
        })
      } catch { /* benachrichtigungen table may not exist */ }
      setSent(true)
    } catch { /* */ }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">Individuelles Angebot anfragen</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><XIcon className="w-4 h-4" /></button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <SendIcon className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-gray-900 font-semibold mb-1">Anfrage gesendet!</p>
            <p className="text-gray-500 text-sm mb-4">Wir melden uns in Kürze mit einem individuellen Angebot.</p>
            <button onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-medium bg-[#1E3A5F] text-white hover:bg-[#4573A2]">Schließen</button>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Fälle Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-700">Gewünschte Fälle / Monat</label>
                <span className="text-sm font-bold text-[#4573A2]">{faelle}</span>
              </div>
              <input type="range" min={10} max={100} step={5} value={faelle} onChange={e => setFaelle(Number(e.target.value))}
                className="w-full accent-[#4573A2]" />
              <div className="flex justify-between text-[10px] text-gray-400"><span>10</span><span>100</span></div>
            </div>

            {/* Radius Slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-700">Gewünschter Radius</label>
                <span className="text-sm font-bold text-[#4573A2]">{radius} km</span>
              </div>
              <input type="range" min={20} max={150} step={5} value={radius} onChange={e => setRadius(Number(e.target.value))}
                className="w-full accent-[#4573A2]" />
              <div className="flex justify-between text-[10px] text-gray-400"><span>20km</span><span>150km</span></div>
            </div>

            {/* Nachricht */}
            <div>
              <label className="text-sm text-gray-700 mb-1.5 block">Nachricht (optional)</label>
              <textarea value={nachricht} onChange={e => setNachricht(e.target.value)}
                rows={3} placeholder="Besondere Wünsche, zusätzliche Standorte..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4573A2] resize-none" />
            </div>

            <button onClick={handleSubmit} disabled={sending}
              className="w-full py-3 rounded-xl text-sm font-semibold bg-[#1E3A5F] hover:bg-[#4573A2] text-white transition-colors disabled:opacity-40">
              {sending ? 'Wird gesendet...' : 'Anfrage senden'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
