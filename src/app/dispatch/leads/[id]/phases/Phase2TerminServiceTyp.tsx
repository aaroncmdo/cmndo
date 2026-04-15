'use client'

// AAR-139 / W5: Phase 2 — SV-Termin + Service-Typ (Pfad A/B).
// AAR-176 P2-C: Besichtigungsadresse wird jetzt direkt im onSelect gespeichert
// (kein separater Speichern-Button mehr) + zusätzliches Freitextfeld
// sv_treffpunkt für konkrete Treffpunkt-Hinweise (Parkhaus-Ebene etc.).

import { useState, useTransition } from 'react'
import SvDispatchPanel from '../SvDispatchPanel'
import { useDispatchPhase } from '../lib/phase-context'
import { saveHardGate, setServiceTyp } from '../actions'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { MapPinIcon, CheckCircle2Icon, ScaleIcon } from 'lucide-react'

export default function Phase2TerminServiceTyp() {
  const { lead, aktiverTermin, qualification, setPhase } = useDispatchPhase()
  const l = lead as unknown as {
    unfallort?: string | null
    unfallort_lat?: number | null
    unfallort_lng?: number | null
    sv_treffpunkt?: string | null
    service_typ?: 'komplett' | 'nur_gutachter' | null
  }
  const [pending, startTransition] = useTransition()
  const [unfallortDraft, setUnfallortDraft] = useState(l.unfallort ?? '')
  const [unfallortLat, setUnfallortLat] = useState<number | null>(l.unfallort_lat ?? null)
  const [unfallortLng, setUnfallortLng] = useState<number | null>(l.unfallort_lng ?? null)
  const [svTreffpunkt, setSvTreffpunkt] = useState<string>(l.sv_treffpunkt ?? '')
  const [serviceTyp, setServiceTypLocal] = useState<'komplett' | 'nur_gutachter'>(
    l.service_typ ?? 'komplett',
  )
  const [toast, setToast] = useState('')

  const hardGateOk =
    qualification.q1_schuldfrage && qualification.q2_schaden && qualification.q3_polizei

  const hasKoordinaten = unfallortLat != null && unfallortLng != null

  // AAR-176 P2-C: Auto-Save direkt im onSelect — kein Speichern-Button mehr
  function autoSaveAdresse(adresse: string, lat: number, lng: number) {
    setUnfallortDraft(adresse)
    setUnfallortLat(lat)
    setUnfallortLng(lng)
    startTransition(async () => {
      const r = await saveHardGate(lead.id, {
        unfallort: adresse,
        unfallort_lat: lat,
        unfallort_lng: lng,
      })
      setToast(r.success ? 'Adresse gespeichert' : r.error ?? 'Fehler')
      setTimeout(() => setToast(''), 2000)
    })
  }

  function saveTreffpunkt() {
    startTransition(async () => {
      const r = await saveHardGate(lead.id, { sv_treffpunkt: svTreffpunkt.trim() || null })
      setToast(r.success ? 'Treffpunkt gespeichert' : r.error ?? 'Fehler')
      setTimeout(() => setToast(''), 2000)
    })
  }

  function chooseServiceTyp(typ: 'komplett' | 'nur_gutachter') {
    startTransition(async () => {
      setServiceTypLocal(typ)
      try {
        await setServiceTyp(lead.id, typ)
        setToast('Service-Typ gespeichert')
        // AAR-176 P3-A: Auto-Advance zu Phase 3 sobald alles in Phase 2 steht
        // (Adresse mit Koordinaten + aktiver Termin + Service-Typ gewählt).
        if (hasKoordinaten && aktiverTermin) {
          setPhase(3)
        }
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Fehler')
      }
      setTimeout(() => setToast(''), 2500)
    })
  }

  return (
    <div className="space-y-4">
      {/* Besichtigungsadresse für SV-Dispatch */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-gray-900">Besichtigungsadresse</h3>
          {hasKoordinaten && (
            <span className="ml-auto text-[10px] text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2Icon className="w-3 h-3" /> Koordinaten ok
            </span>
          )}
        </div>
        <p className="text-[11px] text-gray-500">
          Wo soll der Gutachter das Fahrzeug besichtigen? SV-Vorschläge werden anhand dieser
          Adresse gerankt. Standard = Unfallort aus Phase 1.
        </p>
        <GooglePlaceAutocomplete
          defaultValue={unfallortDraft}
          placeholder="Adresse wählen ..."
          onSelect={(r) => autoSaveAdresse(r.adresse, r.lat, r.lng)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
        />
        {/* AAR-176 P2-C: sv_treffpunkt Freitextfeld — wird beim Blur gespeichert */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-gray-500 block">
            Zusätzlicher Treffpunkt-Hinweis (optional)
          </label>
          <input
            type="text"
            value={svTreffpunkt}
            onChange={(e) => setSvTreffpunkt(e.target.value)}
            onBlur={saveTreffpunkt}
            placeholder='z. B. „Parkhaus Ebene 3, Stellplatz 42" oder „Einfahrt links neben Apotheke"'
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* SV + Termin */}
      <SvDispatchPanel
        leadId={lead.id}
        hardGateOk={hardGateOk}
        aktiverTermin={aktiverTermin as Parameters<typeof SvDispatchPanel>[0]['aktiverTermin']}
      />

      {/* Service-Typ (Pfad A/B) — prominent nach SV-Auswahl */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScaleIcon className="w-4 h-4 text-[#4573A2]" />
          <h3 className="text-sm font-semibold text-gray-900">Service-Typ</h3>
          <span className="ml-auto text-[10px] text-gray-400">Standard: Pfad A (Komplett)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => chooseServiceTyp('komplett')}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              serviceTyp === 'komplett'
                ? 'border-[#4573A2] bg-[#4573A2]/5'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-sm text-gray-900 flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4 text-[#4573A2]" />
              Pfad A — Komplett
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Gutachter + LexDrive-Kanzlei · SA + Vollmacht
            </p>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => chooseServiceTyp('nur_gutachter')}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              serviceTyp === 'nur_gutachter'
                ? 'border-amber-500 bg-amber-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="font-semibold text-sm text-gray-900">Pfad B — Nur SV</p>
            <p className="text-xs text-gray-500 mt-1">
              Nur Gutachter · Nur SA (kein Kanzlei-Mandat)
            </p>
          </button>
        </div>
      </div>

      {toast && (
        <div className={`text-xs px-3 py-2 rounded-lg ${toast.includes('gespeichert') ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>
          {toast}
        </div>
      )}
    </div>
  )
}
