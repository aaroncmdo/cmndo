'use client'

// Token-Audit-Skip: Mapbox-GL-Marker sind raw DOM und brauchen Inline-Hex
// (dokumentierter Ausnahmefall, AGENTS §branding-rules). Die Farben sind au.io-
// Tokens (au-ink #1E293B / au-amber #C04920 / au-surface #fff) — KEIN Claimondo.
// Entity-Lock bleibt: Karte + Pins sind voll au.io-gebrandet, Daten kommen
// server-seitig aus der geteilten Supabase, kein app.claimondo.de-Ref.

import { useEffect, useRef } from 'react'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { DeadPin, AktiverSVPin } from '@/lib/finder/pins'

const AU_INK = '#1E293B'
const AU_INK_MUTED = '#475569'
const AU_AMBER = '#C04920'
const AU_SURFACE = '#FFFFFF'
const STAR_GOLD = '#F59E0B' // semantisches Rating-Gold (kein Marken-Ton)

type Props = { deadPins: DeadPin[]; aktiveSVs: AktiverSVPin[] }

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export function FinderMap({ deadPins, aktiveSVs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  // Karte initialisieren (Mapbox dynamisch importiert -> kein SSR-window-Crash).
  useEffect(() => {
    if (!token || !containerRef.current) return
    let map: MapboxMap | undefined
    let cancelled = false

    void (async () => {
      const mapboxgl = (await import('mapbox-gl')).default
      if (cancelled || !containerRef.current) return
      mapboxgl.accessToken = token
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [7.55, 51.3], // NRW-Mitte (Schwerpunkt des Partnernetzes)
        zoom: 6.3,
      })
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

      map.on('load', () => {
        if (!map) return
        // Dead-Pins (anonym, nicht klickbar)
        for (const p of deadPins) {
          const el = document.createElement('div')
          el.setAttribute('aria-hidden', 'true')
          el.style.cssText = `width:11px;height:11px;border-radius:50%;background:${AU_INK_MUTED};border:2px solid ${AU_SURFACE};box-shadow:0 1px 4px rgba(15,23,42,0.25);pointer-events:none`
          new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map)
        }
        // Aktive, verifizierte SVs (klickbar, anonymes Trust-Popup)
        for (const sv of aktiveSVs) {
          const initiale = sv.vorname_initiale ?? '·'
          const el = document.createElement('div')
          el.setAttribute('role', 'button')
          el.setAttribute('aria-label', `Sachverständiger in ${sv.stadt ?? 'Ihrer Nähe'} — anfragen`)
          el.style.cssText = `width:34px;height:34px;border-radius:50%;border:3px solid ${AU_AMBER};background:${AU_SURFACE};display:grid;place-items:center;font-family:system-ui,sans-serif;font-size:13px;font-weight:800;color:${AU_INK};box-shadow:0 4px 12px rgba(192,73,32,0.28);cursor:pointer`
          el.textContent = initiale

          const stadt = sv.stadt ?? 'Ihrer Nähe'
          const stars =
            sv.bewertungs_durchschnitt && sv.bewertungs_anzahl
              ? `<div style="margin-top:8px;font-size:12px;color:${AU_INK};font-weight:600"><span style="color:${STAR_GOLD}">★</span> ${sv.bewertungs_durchschnitt.toFixed(1)} <span style="color:${AU_INK_MUTED};font-weight:500">(${sv.bewertungs_anzahl} Bewertungen)</span></div>`
              : ''
          const specs =
            sv.spezifikationen_top3.length > 0
              ? `<div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:4px">${sv.spezifikationen_top3
                  .map(
                    (s) =>
                      `<span style="padding:2px 8px;border-radius:999px;background:rgba(192,73,32,0.08);color:${AU_INK};font-size:10.5px;font-weight:600">${escapeHtml(s)}</span>`,
                  )
                  .join('')}</div>`
              : ''
          const mitgl =
            sv.mitgliedschaften.length > 0
              ? `<div style="margin-top:7px;font-size:10.5px;color:${AU_INK_MUTED};font-weight:600">${sv.mitgliedschaften.map(escapeHtml).join(' · ')}</div>`
              : ''

          const popupHtml = `
            <div style="padding:13px 15px;font-family:system-ui,sans-serif;min-width:230px;max-width:270px">
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:34px;height:34px;border-radius:50%;background:${AU_AMBER};display:grid;place-items:center;font-size:14px;font-weight:800;color:#fff;flex-shrink:0">${escapeHtml(initiale)}</div>
                <div style="min-width:0">
                  <div style="font-size:12.5px;font-weight:700;color:${AU_INK};line-height:1.25">Sachverständiger in ${escapeHtml(stadt)}</div>
                  <div style="font-size:10.5px;color:${AU_INK_MUTED};margin-top:1px">unabhängig · verifiziert</div>
                </div>
              </div>${stars}${specs}${mitgl}
              <button data-sv-select="${escapeHtml(sv.id)}" data-sv-stadt="${escapeHtml(sv.stadt ?? '')}" style="margin-top:12px;width:100%;border:none;border-radius:999px;background:${AU_AMBER};color:#fff;font-family:inherit;font-size:12.5px;font-weight:600;padding:9px 12px;cursor:pointer">Diesen Sachverständigen anfragen</button>
            </div>`

          const popup = new mapboxgl.Popup({ offset: 22, closeButton: true, maxWidth: '270px' }).setHTML(popupHtml)
          new mapboxgl.Marker({ element: el, anchor: 'center' }).setLngLat([sv.lng, sv.lat]).setPopup(popup).addTo(map)
        }

        // Auf die Pins zoomen, wenn welche da sind
        const all = [...deadPins.map((p) => [p.lng, p.lat] as [number, number]), ...aktiveSVs.map((s) => [s.lng, s.lat] as [number, number])]
        if (all.length > 1) {
          const lngs = all.map((c) => c[0])
          const lats = all.map((c) => c[1])
          map.fitBounds(
            [
              [Math.min(...lngs), Math.min(...lats)],
              [Math.max(...lngs), Math.max(...lats)],
            ],
            { padding: 60, maxZoom: 9, duration: 0 },
          )
        }
      })
    })()

    return () => {
      cancelled = true
      if (map) map.remove()
    }
  }, [token, deadPins, aktiveSVs])

  // Popup-CTA-Klick (Event-Delegation, da Popup-HTML von Mapbox injiziert wird)
  // -> Custom-Event an das Lead-Formular (Ort-Prefill + SV-Praeferenz + Scroll).
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const btn = (e.target as HTMLElement | null)?.closest('button[data-sv-select]') as HTMLElement | null
      if (!btn) return
      const svId = btn.getAttribute('data-sv-select') ?? ''
      const stadt = btn.getAttribute('data-sv-stadt') ?? ''
      window.dispatchEvent(new CustomEvent('auio:finder-select', { detail: { svId, stadt } }))
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  // Ohne Token keine Karte (kein Crash) — das Lead-Formular unten bleibt nutzbar.
  if (!token) return null

  return (
    <div className="mb-8 overflow-hidden rounded-ios-md border border-au-sand-dark shadow-au-sm">
      <div ref={containerRef} style={{ height: 'clamp(320px, 50vh, 460px)', width: '100%' }} />
      <p className="bg-au-surface px-4 py-2.5 text-center text-xs text-au-muted">
        Verifizierte, unabhängige Sachverständige in Ihrer Region · auf einen Pin tippen zum Anfragen
      </p>
    </div>
  )
}
