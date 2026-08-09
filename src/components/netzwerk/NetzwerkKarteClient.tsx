'use client'

// Token-Audit-Skip: Google-Maps-Marker-Farben werden als Hex an die Maps-JS-API gereicht
//   (kein className/style) — analog Mapbox-Marker. Siehe src/lib/external-brand-colors.ts + AGENTS.md §branding-rules.

// SV-Netzwerk-Karte: der eigene Standort + die bestaetigten Verbindungen (SV/Werkstatt) als Pins.
// Reused Google-Maps-Muster (loadGoogleMaps-Singleton) analog IsochronePreviewMap. Rein Anzeige;
// die Daten (leak-arm: nur Name/Rolle/Koordinaten des eigenen Netzwerks) liefert ladeMeinNetzwerkGeo.
import { useEffect, useRef, useState } from 'react'
import { MapPinIcon } from 'lucide-react'
import { loadGoogleMaps } from '@/lib/maps/load-google-maps'
import type { NetzwerkGeo } from '@/lib/netzwerk/netzwerk-geo'

const FARBE = { self: '#0D1B3E', gutachter: '#4573A2', werkstatt: '#C9A84C' } // navy / ondo-blau / gold

function markerIcon(color: string, scale: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#fff',
    strokeWeight: 2,
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function Hinweis({ text }: { text: string }) {
  return (
    <div className="bg-claimondo-bg border border-claimondo-border rounded-ios-xl p-6 flex items-center justify-center gap-2 text-body-sm text-claimondo-ondo text-center">
      <MapPinIcon className="w-4 h-4 shrink-0" />
      {text}
    </div>
  )
}

export function NetzwerkKarteClient({ geo }: { geo: NetzwerkGeo }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? ''
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)

  useEffect(() => {
    if (!apiKey || !containerRef.current || mapRef.current) return
    const center = geo.self ?? geo.partner[0] ?? null
    if (!center) return
    let cancelled = false
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current || mapRef.current) return
        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom: 9,
          gestureHandling: 'cooperative',
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          styles: [{ featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] }],
        })
        mapRef.current = map
        const bounds = new google.maps.LatLngBounds()
        const info = new google.maps.InfoWindow()

        if (geo.self) {
          new google.maps.Marker({ position: geo.self, map, title: 'Ihr Standort', icon: markerIcon(FARBE.self, 11), zIndex: 1000 })
          bounds.extend(geo.self)
        }
        for (const p of geo.partner) {
          const pos = { lat: p.lat, lng: p.lng }
          const m = new google.maps.Marker({
            position: pos,
            map,
            title: p.name,
            icon: markerIcon(p.rolle === 'werkstatt' ? FARBE.werkstatt : FARBE.gutachter, 9),
          })
          m.addListener('click', () => {
            info.setContent(
              `<div style="font-size:12px;line-height:1.4"><strong>${escapeHtml(p.name)}</strong><br/>${p.rolle === 'werkstatt' ? 'Werkstatt' : 'Gutachter'}</div>`,
            )
            info.open({ anchor: m, map })
          })
          bounds.extend(pos)
        }
        const punkteAnzahl = (geo.self ? 1 : 0) + geo.partner.length
        if (punkteAnzahl > 1) map.fitBounds(bounds, 60)
      })
      .catch(() => {
        /* silent — Hinweis-Fallback unten deckt fehlenden Key ab, Netzfehler = leere Karte */
      })
    return () => {
      cancelled = true
    }
    // geo ist pro Mount stabil (Server-gerendert) — einmalige Initialisierung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  if (!apiKey) return <Hinweis text="Karte nicht verfügbar — Maps-Key fehlt." />
  if (!geo.self && geo.partner.length === 0) {
    return (
      <Hinweis text="Noch keine Verbindungen mit hinterlegtem Standort — bestätige Verbindungen im Reiter Verbindungen, dann erscheinen sie hier auf der Karte." />
    )
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="w-full h-[70vh] min-h-[360px] rounded-ios-xl border border-claimondo-border overflow-hidden bg-claimondo-bg" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-claimondo-ondo/80">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-claimondo-navy" /> Ihr Standort</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-claimondo-ondo" /> Gutachter</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[#C9A84C]" /> Werkstatt</span>
        <span className="ml-auto">{geo.partner.length} {geo.partner.length === 1 ? 'Verbindung' : 'Verbindungen'} auf der Karte</span>
      </div>
    </div>
  )
}
