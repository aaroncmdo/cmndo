'use client'

// AAR-139 / W5: Phase 2 — SV-Termin + Service-Typ (Pfad A/B).
// AAR-176 P2-C: Besichtigungsadresse wird direkt im onSelect gespeichert
// (kein separater Speichern-Button mehr).
// AAR-581 (N4): Strukturierter Besichtigungsort ersetzt Legacy-Freitext
// `sv_treffpunkt` — Autocomplete liefert adresse + lat/lng + place_id.

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import SvDispatchPanel from '../SvDispatchPanel'
import { useDispatchPhase } from '../_lib/phase-context'
import { setServiceTyp, saveStammdaten } from '../actions'
import { geocodeAndSaveUnfallort } from '../_actions/geocode'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { MapPinIcon, CheckCircle2Icon, ScaleIcon, CalendarIcon } from 'lucide-react'

export default function Phase2TerminServiceTyp() {
  const router = useRouter()
  const { lead, aktiverTermin, qualification, setPhase, patchLead } = useDispatchPhase()
  const l = lead as unknown as {
    unfallort?: string | null
    unfallort_lat?: number | null
    unfallort_lng?: number | null
    besichtigungsort_adresse?: string | null
    besichtigungsort_lat?: number | null
    besichtigungsort_lng?: number | null
    besichtigungsort_place_id?: string | null
    service_typ?: 'komplett' | 'nur_gutachter' | null
    // AAR-264: Wunschtermin des Kunden — fließt ins SV-Matching ein
    wunschtermin?: string | null
    // AAR-270: Wochentag-Präferenz für SV-Slot-Filter (ISO 1=Mo..7=So)
    wunschtermin_wochentage?: number[] | null
  }
  const [pending, startTransition] = useTransition()
  const [unfallortDraft, setUnfallortDraft] = useState(l.unfallort ?? '')
  const [unfallortLat, setUnfallortLat] = useState<number | null>(l.unfallort_lat ?? null)
  const [unfallortLng, setUnfallortLng] = useState<number | null>(l.unfallort_lng ?? null)
  const [besichtigungsortAdresse, setBesichtigungsortAdresse] = useState<string>(
    l.besichtigungsort_adresse ?? '',
  )
  const [serviceTyp, setServiceTypLocal] = useState<'komplett' | 'nur_gutachter'>(
    l.service_typ ?? 'komplett',
  )
  // AAR-264: Wunschtermin als datetime-local-String (YYYY-MM-DDTHH:mm).
  // DB liefert ISO mit Sekunden + Z-Suffix → wir slicen für das Input-Format.
  const [wunschtermin, setWunschtermin] = useState<string>(
    l.wunschtermin ? l.wunschtermin.slice(0, 16) : '',
  )
  // AAR-270: Wochentag-Präferenz (ISO 1=Mo..7=So). Null/leeres Array = Egal.
  const [wochentage, setWochentage] = useState<number[]>(l.wunschtermin_wochentage ?? [])
  const wunschterminDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toast, setToast] = useState('')

  // AAR-264: Debounced auto-save (500ms) für Wunschtermin
  useEffect(() => {
    if (wunschterminDebounceRef.current) clearTimeout(wunschterminDebounceRef.current)
    const dbValue = l.wunschtermin ? l.wunschtermin.slice(0, 16) : ''
    if (wunschtermin === dbValue) return
    wunschterminDebounceRef.current = setTimeout(() => {
      const isoOrNull = wunschtermin ? new Date(wunschtermin).toISOString() : null
      // AAR-realtime: Provider-State sofort patchen (Context-Sync vor Server-Roundtrip)
      patchLead({ wunschtermin: isoOrNull } as Partial<typeof lead>)
      startTransition(async () => {
        const r = await saveStammdaten(lead.id, { wunschtermin: isoOrNull })
        if (r.success) {
          setToast('Wunschtermin gespeichert')
          router.refresh()
        } else {
          setToast(r.error ?? 'Fehler beim Speichern')
        }
        setTimeout(() => setToast(''), 2000)
      })
    }, 500)
    return () => {
      if (wunschterminDebounceRef.current) clearTimeout(wunschterminDebounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wunschtermin])

  const hardGateOk =
    qualification.q1_schuldfrage && qualification.q2_schaden && qualification.q3_polizei

  const hasKoordinaten = unfallortLat != null && unfallortLng != null

  // AAR-176 P2-C: Auto-Save direkt im onSelect — kein Speichern-Button mehr
  // AAR-221: router.refresh() nach Save — sonst liest SvDispatchPanel weiterhin
  // den alten Server-State (lead.unfallort_lat=null) und zeigt fälschlich
  // „Lead hat keine Koordinaten", obwohl der lokale Badge schon „Koordinaten ok"
  // anzeigt. Nach dem Refresh werden die DB-Koordinaten überall sichtbar.
  function autoSaveAdresse(adresse: string, lat: number, lng: number) {
    setUnfallortDraft(adresse)
    setUnfallortLat(lat)
    setUnfallortLng(lng)
    // AAR-realtime: Provider sofort patchen
    patchLead({ unfallort: adresse, unfallort_lat: lat, unfallort_lng: lng } as Partial<typeof lead>)
    startTransition(async () => {
      const r = await saveStammdaten(lead.id, {
        unfallort: adresse,
        unfallort_lat: lat,
        unfallort_lng: lng,
      })
      if (r.success) {
        setToast('Adresse gespeichert')
        router.refresh()
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 2000)
    })
  }

  // AAR-262: Wenn der Dispatcher die Adresse manuell tippt (kein Google-
  // Places-Dropdown), fehlen lat/lng → SV-Vorschläge sind blockiert.
  // onBlur löst Server-Side-Geocoding via Google Maps Geocoding API aus.
  function geocodeOnBlur(currentValue: string) {
    const trimmed = currentValue.trim()
    // Nur wenn Text vorhanden, anders als gespeicherte Adresse, und keine
    // Koordinaten via Dropdown gesetzt.
    if (!trimmed || trimmed === (l.unfallort ?? '') || hasKoordinaten) return
    startTransition(async () => {
      const r = await geocodeAndSaveUnfallort(lead.id, trimmed)
      if (r.success && r.lat != null && r.lng != null) {
        setUnfallortLat(r.lat)
        setUnfallortLng(r.lng)
        setToast('Adresse geocoded + gespeichert')
        router.refresh()
      } else {
        setToast(r.error ?? 'Geocoding fehlgeschlagen')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  function saveBesichtigungsort(place: PlaceResult) {
    setBesichtigungsortAdresse(place.adresse)
    // AAR-realtime: Provider sofort patchen
    patchLead({
      besichtigungsort_adresse: place.adresse,
      besichtigungsort_lat: place.lat,
      besichtigungsort_lng: place.lng,
      besichtigungsort_place_id: place.place_id || null,
    } as Partial<typeof lead>)
    startTransition(async () => {
      const r = await saveStammdaten(lead.id, {
        besichtigungsort_adresse: place.adresse,
        besichtigungsort_lat: place.lat,
        besichtigungsort_lng: place.lng,
        besichtigungsort_place_id: place.place_id || null,
      })
      setToast(r.success ? 'Besichtigungsort gespeichert' : r.error ?? 'Fehler')
      setTimeout(() => setToast(''), 2000)
    })
  }

  function clearBesichtigungsort() {
    if (!besichtigungsortAdresse) return
    setBesichtigungsortAdresse('')
    startTransition(async () => {
      await saveStammdaten(lead.id, {
        besichtigungsort_adresse: null,
        besichtigungsort_lat: null,
        besichtigungsort_lng: null,
        besichtigungsort_place_id: null,
      })
    })
  }

  function chooseServiceTyp(typ: 'komplett' | 'nur_gutachter') {
    startTransition(async () => {
      setServiceTypLocal(typ)
      try {
        await setServiceTyp(lead.id, typ)
        // AAR-268: Auto-Advance entfernt — MA klickt explizit „Weiter zu Phase 3"
        if (!aktiverTermin) {
          setToast('Service-Typ gespeichert — bitte noch SV-Termin reservieren')
        } else if (!hasKoordinaten) {
          setToast('Service-Typ gespeichert — Besichtigungsadresse fehlt noch')
        } else {
          setToast('Service-Typ gespeichert')
          await router.refresh()
        }
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Fehler')
      }
      setTimeout(() => setToast(''), 3000)
    })
  }

  // AAR-270: Wochentag setzen + sofort speichern
  function saveWochentage(next: number[]) {
    setWochentage(next)
    // AAR-realtime: Provider sofort patchen
    patchLead({ wunschtermin_wochentage: next.length > 0 ? next : null } as Partial<typeof lead>)
    startTransition(async () => {
      const r = await saveStammdaten(lead.id, {
        wunschtermin_wochentage: next.length > 0 ? next : null,
      })
      if (r.success) {
        setToast(next.length > 0 ? `Wunschtage gespeichert: ${next.length}` : 'Wunschtage zurückgesetzt')
        router.refresh()
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(''), 1500)
    })
  }
  function toggleWochentag(iso: number) {
    const next = wochentage.includes(iso)
      ? wochentage.filter((w) => w !== iso)
      : [...wochentage, iso].sort()
    saveWochentage(next)
  }
  function resetWochentage() {
    if (wochentage.length === 0) return
    saveWochentage([])
  }

  // datetime-local min-Wert: jetzt (lokale Zeit, ohne Sekunden)
  const nowLocal = new Date()
  nowLocal.setMinutes(nowLocal.getMinutes() - nowLocal.getTimezoneOffset())
  const minDatetime = nowLocal.toISOString().slice(0, 16)

  return (
    <div className="space-y-4">
      {/* AAR-264: Wunschtermin GANZ OBEN — „Wann" ist wichtiger als „Wo" für
          das Gespräch. Auto-Save 500ms Debounce. Der Wunschtermin fließt
          ins SV-Matching ein (verfuegbarAmWunschtermin + Score-Bonus). */}
      <div className="bg-[#f8f9fb] border border-claimondo-border rounded-xl p-4 space-y-3">
        {/* AAR-270: Wochentag-Picker — vor dem datetime-local-Input.
            Mehrfachauswahl, Default=Egal. Filtert die SV-Slot-Vorschläge. */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-claimondo-navy font-semibold block">
            Wunschtag des Kunden (optional, Mehrfachauswahl)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {[
              { iso: 1, label: 'Mo' },
              { iso: 2, label: 'Di' },
              { iso: 3, label: 'Mi' },
              { iso: 4, label: 'Do' },
              { iso: 5, label: 'Fr' },
              { iso: 6, label: 'Sa' },
              { iso: 7, label: 'So' },
            ].map((d) => {
              const sel = wochentage.includes(d.iso)
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => toggleWochentag(d.iso)}
                  disabled={pending}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    sel
                      ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                      : 'bg-white text-claimondo-navy border-claimondo-border hover:border-claimondo-ondo'
                  } disabled:opacity-50`}
                >
                  {d.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={resetWochentage}
              disabled={pending || wochentage.length === 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                wochentage.length === 0
                  ? 'bg-claimondo-ondo text-white border-claimondo-ondo'
                  : 'bg-white text-claimondo-navy border-claimondo-border hover:border-claimondo-ondo'
              } disabled:opacity-50`}
              title="Alle Wochentage zurücksetzen"
            >
              Egal
            </button>
          </div>
        </div>

        <h3 className="text-xs font-semibold text-claimondo-navy flex items-center gap-2 pt-1 border-t border-claimondo-border">
          <CalendarIcon className="w-4 h-4" /> Wunschtermin des Kunden
        </h3>
        <p className="text-[11px] text-claimondo-navy italic">
          Frage-Guidance: „Wann passt es Ihnen am besten? Je konkreter, desto schneller kommt der Termin."
        </p>
        <input
          type="datetime-local"
          value={wunschtermin}
          onChange={(e) => setWunschtermin(e.target.value)}
          min={minDatetime}
          className="w-full px-3 py-2 border border-claimondo-ondo rounded-lg text-sm bg-white"
        />
        {wunschtermin && (
          <p className="text-[10px] text-claimondo-ondo">
            SV-Matching bevorzugt Gutachter die zu diesem Termin verfügbar sind.
          </p>
        )}
      </div>

      {/* Besichtigungsadresse für SV-Dispatch */}
      <div className="glass-light border border-claimondo-border rounded-ios-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <MapPinIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Besichtigungsadresse</h3>
          {hasKoordinaten && (
            <span className="ml-auto text-[10px] text-green-600 font-medium flex items-center gap-1">
              <CheckCircle2Icon className="w-3 h-3" /> Koordinaten ok
            </span>
          )}
        </div>
        <p className="text-[11px] text-claimondo-ondo">
          Wo soll der Gutachter das Fahrzeug besichtigen? SV-Vorschläge werden anhand dieser
          Adresse gerankt. Standard = Unfallort aus Phase 1.
        </p>
        <GooglePlaceAutocomplete
          defaultValue={unfallortDraft}
          placeholder="Adresse wählen ..."
          onSelect={(r) => autoSaveAdresse(r.adresse, r.lat, r.lng)}
          onBlur={(currentValue) => {
            // AAR-262: Wenn der User getippt aber NICHTS aus dem Dropdown
            // gewählt hat, läuft Server-Side-Geocoding als Fallback —
            // damit SV-Vorschläge nicht blockiert sind. currentValue wird
            // als Parameter übergeben, weil setUnfallortDraft async ist
            // und der State sonst stale bleibt.
            setUnfallortDraft(currentValue)
            geocodeOnBlur(currentValue)
          }}
          className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm"
        />
        {/* AAR-581 (N4): Strukturierter SV-Besichtigungsort — Autocomplete
            liefert Adresse + Koordinaten + place_id. Pflichtfeld wenn der
            Besichtigungsort vom Unfallort abweicht. */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-claimondo-ondo block">
            SV-Besichtigungsort (optional, wenn abweichend vom Unfallort)
          </label>
          <GooglePlaceAutocomplete
            defaultValue={besichtigungsortAdresse}
            placeholder='z. B. „Werkstatt Müller, Musterstr. 1, 80331 München"'
            onSelect={saveBesichtigungsort}
            onBlur={(current) => {
              if (!current.trim()) clearBesichtigungsort()
            }}
            className="w-full px-3 py-2 border border-claimondo-border rounded-lg text-sm"
          />
        </div>
      </div>

      {/* SV + Termin */}
      <SvDispatchPanel
        leadId={lead.id}
        hardGateOk={hardGateOk}
        hardGateDetails={{ q1: qualification.q1_schuldfrage, q2: qualification.q2_schaden, q3: qualification.q3_polizei }}
        aktiverTermin={aktiverTermin as Parameters<typeof SvDispatchPanel>[0]['aktiverTermin']}
        wunschterminIso={l.wunschtermin ?? null}
        wunschterminWochentage={wochentage.length > 0 ? wochentage : null}
      />

      {/* Service-Typ (Pfad A/B) — prominent nach SV-Auswahl */}
      <div className="glass-light border border-claimondo-border rounded-ios-md p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ScaleIcon className="w-4 h-4 text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Service-Typ</h3>
          <span className="ml-auto text-[10px] text-claimondo-ondo/70">Standard: Pfad A (Komplett)</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => chooseServiceTyp('komplett')}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${
              serviceTyp === 'komplett'
                ? 'border-claimondo-ondo bg-claimondo-ondo/5'
                : 'border-claimondo-border hover:border-claimondo-border'
            }`}
          >
            <p className="font-semibold text-sm text-claimondo-navy flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4 text-claimondo-ondo" />
              Pfad A — Komplett
            </p>
            <p className="text-xs text-claimondo-ondo mt-1">
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
                : 'border-claimondo-border hover:border-claimondo-border'
            }`}
          >
            <p className="font-semibold text-sm text-claimondo-navy">Pfad B — Nur SV</p>
            <p className="text-xs text-claimondo-ondo mt-1">
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

      {/* AAR-617: Zurück-/Weiter-Row — Zurück-Button war vorher nur über den
          Phase-Header-Stepper erreichbar, was für neue User nicht offensichtlich
          ist. Jetzt explizit innerhalb der Phase sichtbar. State-Persistenz
          ist bereits durch AAR-624 + die autoSave-Hooks dieser Phase garantiert
          — beim Klick gehen keine Eingaben verloren. */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setPhase(1)}
          className="flex-1 px-4 py-2.5 rounded-xl border border-claimondo-border text-claimondo-navy hover:bg-[#f8f9fb] text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          ← Zurück zu Phase 1
        </button>
        {aktiverTermin && hasKoordinaten && (
          <button
            type="button"
            disabled={pending}
            onClick={() => setPhase(3)}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#0D1B3E] text-white text-sm font-semibold hover:bg-claimondo-navy disabled:opacity-50 flex items-center justify-center gap-2"
          >
            Weiter zu Phase 3 →
          </button>
        )}
      </div>
    </div>
  )
}
