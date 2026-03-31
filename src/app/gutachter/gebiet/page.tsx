'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MapPinIcon, UsersIcon, FlameIcon, ArrowUpIcon } from 'lucide-react'

const PAKET_INFO: Record<string, { label: string; faelle: number; km: number; preis: number }> = {
  'starter-10': { label: 'Starter', faelle: 10, km: 20, preis: 1500 },
  'standard-25': { label: 'Pro', faelle: 25, km: 40, preis: 3750 },
  'premium-50': { label: 'Premium', faelle: 50, km: 100, preis: 7500 },
}
const PAKETE = Object.entries(PAKET_INFO)
const MAPS_ID = 'gebiet-maps-script'

export default function GebietPage() {
  const supabase = createClient()
  const mapRef = useRef<HTMLDivElement>(null)
  const gMapRef = useRef<google.maps.Map | null>(null)
  const [loading, setLoading] = useState(true)
  const [svData, setSvData] = useState<{ id: string; lat: number; lng: number; paket: string; iso: unknown; anzahlungBezahlt: number } | null>(null)
  const [layers, setLayers] = useState({ gebiet: true, konkurrenz: true, hotspots: false })
  const [upgrading, setUpgrading] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: sv } = await supabase.from('sachverstaendige').select('id, standort_lat, standort_lng, paket, isochrone_polygon, anzahlung_faellig').or(`profile_id.eq.${user.id},user_id.eq.${user.id}`).single()
    if (sv?.standort_lat) setSvData({ id: sv.id, lat: Number(sv.standort_lat), lng: Number(sv.standort_lng), paket: sv.paket ?? 'starter-10', iso: sv.isochrone_polygon, anzahlungBezahlt: Number(sv.anzahlung_faellig ?? 750) })
    setLoading(false)
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
        new google.maps.Polygon({
          paths: (svData!.iso as { lat: number; lng: number }[]),
          map: gMapRef.current!, fillColor: '#3b82f6', fillOpacity: 0.15,
          strokeColor: '#3b82f6', strokeOpacity: 0.5, strokeWeight: 2,
        })
      }

      // Load competitors
      supabase.from('sachverstaendige').select('gutachter_typ, paket, standort_lat, standort_lng').neq('id', svData!.id).eq('ist_aktiv', true).not('standort_lat', 'is', null).then(({ data }) => {
        for (const sv of data ?? []) {
          new google.maps.Marker({ position: { lat: Number(sv.standort_lat), lng: Number(sv.standort_lng) }, map: gMapRef.current!, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: '#9ca3af', fillOpacity: 0.7, strokeColor: '#fff', strokeWeight: 1 }, title: `${sv.gutachter_typ} · ${sv.paket}` })
        }
      })

      return true
    }

    if (init()) return
    if (document.getElementById(MAPS_ID)) { const iv = setInterval(() => { if (init()) clearInterval(iv) }, 200); return }
    const s = document.createElement('script'); s.id = MAPS_ID
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=visualization`
    s.async = true; s.onload = () => init(); document.head.appendChild(s)
  }, [svData, supabase])

  async function requestUpgrade(neuPaket: string) {
    if (!svData) return; setUpgrading(true)
    const altInfo = PAKET_INFO[svData.paket]; const neuInfo = PAKET_INFO[neuPaket]
    if (!altInfo || !neuInfo) { setUpgrading(false); return }
    const differenz = (neuInfo.preis * 0.5) - svData.anzahlungBezahlt

    await supabase.from('paket_upgrades').insert({
      sv_id: svData.id, altes_paket: svData.paket, neues_paket: neuPaket,
      differenz_anzahlung: Math.max(0, differenz),
    })
    alert(`Upgrade-Anfrage gesendet! Differenz-Anzahlung: ${Math.max(0, differenz)}€`)
    setUpgrading(false)
  }

  if (loading) return <div className="h-full flex items-center justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
  if (!svData) return <div className="h-full flex items-center justify-center text-gray-400">Kein Profil gefunden</div>

  const currentPaket = PAKET_INFO[svData.paket] ?? PAKET_INFO['starter-10']

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Topbar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div><h1 className="text-sm font-semibold text-gray-900">Mein Gebiet</h1><p className="text-xs text-gray-500">{currentPaket.label} · {currentPaket.km}km Radius · {currentPaket.faelle} Fälle/Monat</p></div>
        <div className="flex gap-1">
          {[['gebiet', 'Gebiet', MapPinIcon], ['konkurrenz', 'Konkurrenz', UsersIcon], ['hotspots', 'Hotspots', FlameIcon]].map(([k, l, I]) => (
            <button key={k as string} onClick={() => setLayers(p => ({ ...p, [k as string]: !p[k as keyof typeof p] }))}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium ${layers[k as keyof typeof layers] ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
              {l as string}
            </button>
          ))}
        </div>
      </div>

      {/* Map + Upgrade Sidebar */}
      <div className="flex-1 min-h-0 flex">
        <div ref={mapRef} className="flex-1" />

        {/* Upgrade Panel */}
        <div className="w-72 hidden lg:block overflow-y-auto p-3 space-y-2 border-l border-gray-200 bg-white">
          <p className="text-sm font-semibold text-gray-800">Paket-Upgrade</p>
          <div className={`border-2 border-blue-500 rounded-xl p-3`}>
            <p className="text-xs font-semibold text-blue-600">Aktuell: {currentPaket.label}</p>
            <p className="text-[10px] text-gray-500">{currentPaket.faelle} Fälle · {currentPaket.km}km · {currentPaket.preis}€/Monat</p>
          </div>

          {PAKETE.filter(([k]) => {
            const order = ['starter-10', 'standard-25', 'premium-50']
            return order.indexOf(k) > order.indexOf(svData.paket)
          }).map(([key, info]) => {
            const differenz = Math.max(0, (info.preis * 0.5) - svData.anzahlungBezahlt)
            return (
              <div key={key} className="border border-gray-200 rounded-xl p-3 hover:border-blue-300 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">{info.label}</p>
                  {key === 'standard-25' && <span className="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full">Empfohlen</span>}
                </div>
                <p className="text-[10px] text-gray-500 mb-2">{info.faelle} Fälle · {info.km}km · {info.preis}€/Mo</p>
                <p className="text-xs text-gray-700">Differenz-Anzahlung: <span className="font-semibold">{differenz}€</span></p>
                <button onClick={() => requestUpgrade(key)} disabled={upgrading}
                  className="mt-2 w-full flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium py-2 rounded-lg">
                  <ArrowUpIcon className="w-3 h-3" /> Upgrade anfragen
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
