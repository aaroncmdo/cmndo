'use client'

// Kombinierte Live-Karten-Form für gutachter.claimondo.de.
// PLZ-Eingabe geocodet sich (debounced) → Karte zeigt Standort + echte Fahrt-Isochrone
// (= Standard-Paket-Gebiet als Conversion-Trigger). Submit ruft die
// Waitlist-Server-Action.

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useRef, useState, useTransition, useCallback } from 'react'
import { ensureMapboxInitialized, mapboxgl } from '@/lib/mapbox'
import { stelleWaitlistAnfrage } from '@/lib/actions/gutachter-waitlist'
import { CheckCircle2, MapPin, Loader2, ArrowRight } from 'lucide-react'

const STANDARD_RADIUS_KM = 30

type GeoResult = { lat: number; lng: number; ort: string | null }

export default function WaitlistApply() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)

  const [pending, startTransition] = useTransition()
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [plz, setPlz] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geo, setGeo] = useState<GeoResult | null>(null)

  // Mapbox-Init — startet zentriert auf Köln
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    if (!ensureMapboxInitialized()) {
      console.error('[WaitlistApply] Mapbox-Init fehlgeschlagen')
      return
    }
    const map = new mapboxgl.Map({
      container: mapRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [6.9603, 50.9375], // Köln
      zoom: 5.5,
      attributionControl: false,
      pitch: 0,
    })
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('load', () => {
      // GeoJSON-Source für den 30km-Kreis (wird bei PLZ-Update gesetzt)
      map.addSource('einsatzgebiet', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'einsatzgebiet-fill',
        type: 'fill',
        source: 'einsatzgebiet',
        paint: {
          'fill-color': '#4573A2',
          'fill-opacity': 0.18,
        },
      })
      map.addLayer({
        id: 'einsatzgebiet-line',
        type: 'line',
        source: 'einsatzgebiet',
        paint: {
          'line-color': '#4573A2',
          'line-width': 2,
          'line-opacity': 0.7,
        },
      })
    })

    mapInstanceRef.current = map

    return () => {
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  // Geocoding bei PLZ-Änderung (debounced)
  const updateMap = useCallback(async (g: GeoResult) => {
    const map = mapInstanceRef.current
    if (!map) return
    map.flyTo({ center: [g.lng, g.lat], zoom: 9.5, duration: 1200 })

    if (markerRef.current) markerRef.current.remove()
    const el = document.createElement('div')
    el.style.cssText = `
      width: 24px; height: 24px; border-radius: 50%;
      background: #0D1B3E; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(13,27,62,0.5);
    `
    markerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
      .setLngLat([g.lng, g.lat])
      .addTo(map)

    // Mapbox Isochrone API — echte Fahrt-Isochrone statt geometrischer Kreis
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    let coords: [number, number][] | null = null
    if (token) {
      try {
        const meters = STANDARD_RADIUS_KM * 1000
        const isoUrl =
          `https://api.mapbox.com/isochrone/v1/mapbox/driving/${g.lng},${g.lat}` +
          `?contours_meters=${meters}&polygons=true&denoise=1&generalize=0&access_token=${token}`
        const res = await fetch(isoUrl)
        if (res.ok) {
          const data = await res.json()
          const ring = data?.features?.[0]?.geometry?.coordinates?.[0] as [number, number][] | undefined
          if (ring && ring.length >= 3) coords = ring
        }
      } catch { /* Fallback auf Kreis */ }
    }

    // Fallback: geometrischer 30km-Kreis wenn Isochrone-API scheitert
    if (!coords) {
      const points = 64
      coords = []
      const kmPerDegLat = 111
      const kmPerDegLng = 111 * Math.cos((g.lat * Math.PI) / 180)
      for (let i = 0; i <= points; i++) {
        const angle = (i / points) * 2 * Math.PI
        const dLat = (STANDARD_RADIUS_KM / kmPerDegLat) * Math.cos(angle)
        const dLng = (STANDARD_RADIUS_KM / kmPerDegLng) * Math.sin(angle)
        coords.push([g.lng + dLng, g.lat + dLat])
      }
    }

    const source = map.getSource('einsatzgebiet') as mapboxgl.GeoJSONSource | undefined
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [coords] },
            properties: {},
          },
        ],
      })
    }
  }, [])

  useEffect(() => {
    if (!plz.match(/^[0-9]{5}$/)) {
      setGeo(null)
      return
    }
    let cancelled = false
    setGeocoding(true)
    const timer = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          plz,
        )}.json?country=de&limit=1&types=postcode&access_token=${token}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('Geocoding fehlgeschlagen')
        const data = await res.json()
        const feature = data?.features?.[0]
        if (!feature?.center) {
          if (!cancelled) setGeo(null)
          return
        }
        const [lng, lat] = feature.center
        const ort =
          feature.context?.find((c: { id?: string; text?: string }) => c.id?.startsWith('place'))
            ?.text ?? null
        const result: GeoResult = { lat, lng, ort }
        if (!cancelled) {
          setGeo(result)
          updateMap(result)
        }
      } catch (err) {
        console.error('[WaitlistApply] Geocoding-Fehler:', err)
      } finally {
        if (!cancelled) setGeocoding(false)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [plz, updateMap])

  function handleSubmit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await stelleWaitlistAnfrage({
        vorname: String(formData.get('vorname') ?? ''),
        nachname: String(formData.get('nachname') ?? ''),
        email: String(formData.get('email') ?? ''),
        telefon: String(formData.get('telefon') ?? '') || undefined,
        plz: String(formData.get('plz') ?? ''),
        unternehmen: String(formData.get('unternehmen') ?? '') || undefined,
        dat_expert_nummer: String(formData.get('dat_expert_nummer') ?? '') || undefined,
        bvsk_mitgliedsnummer: String(formData.get('bvsk_mitgliedsnummer') ?? '') || undefined,
        ihk_zertifikat_nummer: String(formData.get('ihk_zertifikat_nummer') ?? '') || undefined,
        oebuv_bestellungsnummer: String(formData.get('oebuv_bestellungsnummer') ?? '') || undefined,
        jahre_erfahrung: formData.get('jahre_erfahrung')
          ? Number(formData.get('jahre_erfahrung'))
          : undefined,
        aktuelle_auftraege_pro_monat: formData.get('aktuelle_auftraege_pro_monat')
          ? Number(formData.get('aktuelle_auftraege_pro_monat'))
          : undefined,
        schwerpunkte: String(formData.get('schwerpunkte') ?? '') || undefined,
        honeypot: String(formData.get('website') ?? ''),
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      })
      if (result.ok) {
        setSubmitted(true)
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: document.getElementById('waitlist-anchor')?.offsetTop ?? 0, behavior: 'smooth' })
        }
      } else {
        setError(result.error)
      }
    })
  }

  if (submitted) {
    return (
      <div id="waitlist-anchor" className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 backdrop-blur">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15">
            <CheckCircle2 className="h-7 w-7 text-emerald-400" />
          </div>
          <h3
            className="text-3xl font-bold text-white"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            Eingetragen.
          </h3>
          <p className="mt-3 text-base leading-relaxed text-white/70">
            Wir prüfen deine Angaben und melden uns innerhalb von 2 Werktagen
            telefonisch bei dir. Wenn deine Region zu unserer aktuellen
            Skalierungsphase passt, geht es direkt ins Onboarding.
          </p>
          <div className="mt-6 space-y-2 text-sm text-white/60">
            <p>
              <span className="text-white">Was als Nächstes passiert:</span>
            </p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>Anruf von einem Claimondo-Partnermanager (2 Werktage)</li>
              <li>15-Minuten-Call zu Region, Auslastung, technischer Anbindung</li>
              <li>DAT-Expert-Nachweis + Haftpflicht hochladen</li>
              <li>Freischaltung — erste Aufträge meist innerhalb einer Woche</li>
            </ol>
          </div>
        </div>
        <div className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 lg:h-auto">
          <div ref={mapRef} className="absolute inset-0" />
          <div className="absolute left-4 top-4 rounded-xl border border-white/15 bg-[#0D1B3E]/85 px-3 py-2 text-xs font-medium text-white backdrop-blur-md">
            Dein Einsatzgebiet — {STANDARD_RADIUS_KM} km um {geo?.ort ?? plz}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div id="waitlist-anchor" className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* ── Form ───────────────────────────── */}
      <form
        action={handleSubmit}
        className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur sm:p-8"
      >
        <h3
          className="text-3xl font-bold text-white"
          style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
        >
          Auf die Warteliste.
        </h3>
        <p className="mt-2 text-sm text-white/55">
          Wir nehmen Partner regional gestaffelt auf — sobald deine Region
          dran ist, melden wir uns. Kein Marketing, kein Spam.
        </p>

        {/* Honeypot (versteckt für Bots) */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          className="absolute left-[-9999px] top-[-9999px] h-0 w-0 opacity-0"
          aria-hidden
        />

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="vorname" label="Vorname" required />
          <Field name="nachname" label="Nachname" required />
          <Field name="email" type="email" label="E-Mail" required className="sm:col-span-2" />
          <Field name="telefon" type="tel" label="Telefon" />
          <Field
            name="plz"
            label="PLZ deines Standorts"
            required
            value={plz}
            onChange={(v) => setPlz(v.replace(/\D/g, '').slice(0, 5))}
            inputMode="numeric"
            pattern="[0-9]{5}"
            hint={
              geocoding
                ? 'Suche…'
                : geo
                  ? `${geo.ort ?? 'Standort gefunden'} — Karte rechts zeigt dein Gebiet`
                  : '5-stellig — die Karte zeigt sofort dein Einsatzgebiet'
            }
          />
        </div>

        <h4 className="mt-8 text-xs font-semibold uppercase tracking-widest text-[#7BA3CC]">
          Qualifikation
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="dat_expert_nummer" label="DAT-Expert-Nr." />
          <Field name="bvsk_mitgliedsnummer" label="BVSK-Mitglieds-Nr." />
          <Field name="ihk_zertifikat_nummer" label="IHK-Zertifikat" />
          <Field name="oebuv_bestellungsnummer" label="öbuv-Bestellungs-Nr." />
        </div>

        <h4 className="mt-8 text-xs font-semibold uppercase tracking-widest text-[#7BA3CC]">
          Geschäft (optional)
        </h4>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="unternehmen" label="Unternehmen / Büro" className="sm:col-span-2" />
          <Field name="jahre_erfahrung" type="number" label="Jahre Erfahrung" />
          <Field name="aktuelle_auftraege_pro_monat" type="number" label="Aufträge / Monat" />
          <Field
            name="schwerpunkte"
            label="Fachschwerpunkte (z. B. E-Auto, Oldtimer, Lkw)"
            className="sm:col-span-2"
          />
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4573A2] px-7 py-4 text-base font-bold text-white shadow-[0_10px_32px_rgba(69,115,162,0.45)] transition-all hover:bg-[#7BA3CC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" /> Wird gesendet…
            </>
          ) : (
            <>
              Auf die Warteliste setzen <ArrowRight className="h-5 w-5" />
            </>
          )}
        </button>
        <p className="mt-3 text-center text-xs text-white/40">
          Mit dem Absenden bestätigst du, dass wir dich kontaktieren dürfen.
          Keine Datenweitergabe an Dritte.
        </p>
      </form>

      {/* ── Live-Karte ──────────────────────── */}
      <div className="relative">
        <div className="sticky top-24">
          <div className="relative h-[480px] overflow-hidden rounded-3xl border border-white/10 bg-white/5">
            <div ref={mapRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute left-4 top-4 max-w-xs">
              <div className="rounded-xl border border-white/15 bg-[#0D1B3E]/85 px-3 py-2 backdrop-blur-md">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#7BA3CC]">
                  Dein Gebiet
                </p>
                <p className="mt-0.5 text-sm font-medium text-white">
                  {geo
                    ? `${STANDARD_RADIUS_KM} km um ${geo.ort ?? plz}`
                    : 'PLZ links eingeben'}
                </p>
              </div>
            </div>
            {!geo && !geocoding && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-2xl border border-white/10 bg-[#0D1B3E]/70 px-5 py-3 text-center backdrop-blur-md">
                  <MapPin className="mx-auto h-5 w-5 text-[#7BA3CC]" />
                  <p className="mt-2 text-xs text-white/70">
                    PLZ eintragen → Standard-Paket-Gebiet erscheint
                  </p>
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-white/40">
            Standardgebiet: 30 km Radius (≈ {Math.round(Math.PI * STANDARD_RADIUS_KM ** 2)} km²
            Fläche). Pro/Premium-Pakete liefern größere Radien — das besprechen
            wir im Erstgespräch.
          </p>
        </div>
      </div>
    </div>
  )
}

function Field({
  name,
  label,
  type = 'text',
  required,
  className,
  hint,
  value,
  onChange,
  inputMode,
  pattern,
}: {
  name: string
  label: string
  type?: string
  required?: boolean
  className?: string
  hint?: string
  value?: string
  onChange?: (v: string) => void
  inputMode?: 'text' | 'numeric' | 'tel' | 'email'
  pattern?: string
}) {
  return (
    <label className={`flex flex-col ${className ?? ''}`}>
      <span className="mb-1 text-xs font-medium text-white/65">
        {label}
        {required && <span className="ml-0.5 text-[#7BA3CC]">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        pattern={pattern}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:border-[#4573A2] focus:bg-white/10"
      />
      {hint && <span className="mt-1 text-[11px] text-white/40">{hint}</span>}
    </label>
  )
}
