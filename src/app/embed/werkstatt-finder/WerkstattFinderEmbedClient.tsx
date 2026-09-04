'use client'

// Öffentlicher Werkstatt-Embed-Finder (Phase 2). Kompositions-Root: hält den geteilten Such-State
// und verdrahtet die Karten-Shell (Pins) mit dem Glass-Wizard (wizardSlot). Der Wizard sammelt die
// Engine-Inputs und ruft runSuche → gerankte Werkstätten mit Begründungs-Chips; Pins + Liste teilen
// sich denselben State. Kein DOM-Event-Bus — State ist gehoben, die Pins SIND die Suchergebnisse.
import { useCallback, useEffect, useRef, useState } from 'react'
import { WerkstattFinderShell } from './_components/WerkstattFinderShell'
import { WerkstattWizard } from './_components/WerkstattWizard'
import { sucheEchteWerkstaetten, sucheWerkstaettenNachOrt } from './actions'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { wizardStateZuSuche } from './_components/wizard-logic'

type Props = { initialLat?: number; initialLng?: number; initialPlz?: string; flowToken?: string; promoCode?: string; oppref?: string }

export function WerkstattFinderEmbedClient({ initialLat, initialLng, initialPlz, flowToken, promoCode, oppref }: Props) {
  const [rows, setRows] = useState<WerkstattVorschlag[]>([])
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    initialLat != null && initialLng != null ? { lat: initialLat, lng: initialLng } : null,
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // D1: erst nach der ersten abgeschlossenen Suche darf der Umkreis-Leer-Hinweis erscheinen.
  const [hatGesucht, setHatGesucht] = useState(false)
  const [keineSpezialisierte, setKeineSpezialisierte] = useState(false)
  // Monotone Request-ID: nur die jüngste Antwort darf den State setzen (Stale-Race-Guard bei
  // schneller Wizard-Eingabe — analog FinderWizard.matchReqRef).
  const reqRef = useRef(0)

  const runSuche = useCallback(async (input: ReturnType<typeof wizardStateZuSuche>) => {
    const lat = input.lat
    const lng = input.lng
    // I3 (Review): center-Identität bewahren, wenn die Koordinaten gleich bleiben — sonst re-feuern die
    // [center]-Karten-Effekte (flyTo/fitBounds) bei jeder Marke/Modell-Eingabe → Kamera-Jitter.
    if (lat != null && lng != null) {
      setCenter((prev) => (prev && prev.lat === lat && prev.lng === lng ? prev : { lat, lng }))
    }
    const req = ++reqRef.current
    setLoading(true)
    try {
      const r = await sucheEchteWerkstaetten({
        lat: input.lat,
        lng: input.lng,
        marke: input.marke,
        fahrzeugklasse: input.fahrzeugklasse,
        bedarf: input.bedarf,
      })
      if (reqRef.current !== req) return // veraltete Antwort — eine neuere Suche hat übernommen
      setRows(r.werkstaetten)
      setKeineSpezialisierte(r.keineSpezialisierte)
      setHatGesucht(true)
    } catch {
      if (reqRef.current !== req) return
      setRows([])
      setKeineSpezialisierte(false)
      setHatGesucht(true)
    } finally {
      if (reqRef.current === req) setLoading(false)
    }
  }, [])

  // Initiale Suche: Koordinaten aus der URL direkt; sonst PLZ/Ort geocodieren (Anker aus dem
  // Geocode-Treffer). So zeigt die Karte sofort nahe Werkstätten — auch beim ?plz=-Einstieg.
  useEffect(() => {
    if (initialLat != null && initialLng != null) {
      void runSuche({ lat: initialLat, lng: initialLng, marke: null, fahrzeugklasse: null })
    } else if (initialPlz) {
      const req = ++reqRef.current
      setLoading(true)
      void sucheWerkstaettenNachOrt(initialPlz)
        .then((res) => {
          if (reqRef.current !== req) return
          setRows(res.werkstaetten)
          setCenter(res.center)
          setKeineSpezialisierte(res.keineSpezialisierte)
          setHatGesucht(true)
        })
        .catch(() => {
          if (reqRef.current === req) {
            setRows([])
            setKeineSpezialisierte(false)
          }
        })
        .finally(() => {
          if (reqRef.current === req) setLoading(false)
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLat, initialLng, initialPlz])

  return (
    <WerkstattFinderShell
      rows={rows}
      center={center}
      selectedId={selectedId}
      onSelectPin={setSelectedId}
      wizardSlot={
        <WerkstattWizard
          rows={rows}
          selectedId={selectedId}
          loading={loading}
          hatGesucht={hatGesucht}
          keineSpezialisierte={keineSpezialisierte}
          onSelectWerkstatt={setSelectedId}
          onSuche={runSuche}
          flowToken={flowToken}
          promoCode={promoCode}
          oppref={oppref}
        />
      }
    />
  )
}
