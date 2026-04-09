'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { saveLeadQualifizierung, confirmGutachterTermin, setSvGesucht } from './actions'
import { sendFlowLink } from '../../actions'
import VersicherungCombobox from '@/components/VersicherungCombobox'
import {
  PhoneCallIcon,
  ClipboardListIcon,
  UsersIcon,
  ShieldIcon,
  CalendarIcon,
  FileTextIcon,
  SendIcon,
  CheckCircle2Icon,
  SearchIcon,
  MapPinIcon,
  ClockIcon,
  UserCheckIcon,
  AlertCircleIcon,
  StarIcon,
} from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'

// ─── Types ──────────────────────────────────────────────────────────────────

type LeadData = {
  id: string
  vorname: string | null
  nachname: string | null
  telefon: string | null
  email: string | null
  status: string
  schadenfall_typ: string | null
  kunden_konstellation: string | null
  // KFZ-154
  spezifikation: string | null
  schadenart: string | null
  sf_variante: string | null
  gegner_name: string | null
  gegner_versicherung: string | null
  gegner_kennzeichen: string | null
  gegner_bekannt: boolean | null
  eigene_versicherung: string | null
  eigene_policennr: string | null
  polizei_aktenzeichen: string | null
  polizeibericht_pflicht: boolean | null
  personenschaden_flag: boolean | null
  mietwagen_flag: boolean | null
  schadensursache: string | null
  leasing_geber: string | null
  leasing_flag: boolean | null
  finanzierung_bank: string | null
  finanzierung_flag: boolean | null
  firma_name: string | null
  firma_ustid: string | null
  gewerbe_flag: boolean | null
  halter_name: string | null
  halter_ungleich_fahrer_flag: boolean | null
  qualifizierungs_phase: string | null
  fahrzeug_standort_plz: string | null
  fahrzeug_standort_adresse: string | null
  gutachter_termin: string | null
  sa_unterschrieben: boolean
  sa_datum: string | null
  vollmacht_unterschrieben: boolean
  vollmacht_datum: string | null
  mandatstyp: string | null
  wa_gesendet: boolean
  unfallhergang?: string | null
  kennzeichen?: string | null
  fahrzeug_hersteller?: string | null
  fahrzeug_modell?: string | null
  fahrzeug_farbe?: string | null
  erstzulassung?: string | null
  fin?: string | null
  kilometerstand?: number | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SF_OPTIONS = [
  { value: 'sf-01', label: 'SF-01 Unverschuldeter Unfall (Gegner ist schuld)', pct: '~60%' },
  { value: 'sf-02', label: 'SF-02 Teilschuld-Unfall', pct: '~10%' },
  { value: 'sf-03', label: 'SF-03 Parkschaden / Fahrerflucht', pct: '~8%' },
]

const KK_OPTIONS = [
  { value: 'kk-01', label: 'KK-01 Privatperson eigenes Fahrzeug' },
  { value: 'kk-02', label: 'KK-02 Leasing-Fahrzeug' },
  { value: 'kk-03', label: 'KK-03 Finanziertes Fahrzeug' },
  { value: 'kk-04', label: 'KK-04 Firmenfahrzeug' },
  { value: 'kk-05', label: 'KK-05 Halter ungleich Fahrer' },
]

const PHASE_ORDER = [
  'neu', 'erstkontakt', 'schadentyp-erfasst', 'konstellation-erfasst',
  'gegner-daten', 'gutachtertermin', 'flow-gesendet', 'abgeschlossen',
]

type GutachterSlot = {
  sv_id: string; name: string; entfernung_km: number | null; auslastung: string
  offene_faelle: number; max_faelle_monat: number; paket: string | null
  termin: string; wunschtermin_moeglich: boolean
}
type MatchResult = { empfohlen: GutachterSlot | null; alternative_1: GutachterSlot | null; alternative_2: GutachterSlot | null }

const STEPS = [
  { key: 'erstkontakt', label: 'Erstkontakt', icon: PhoneCallIcon, phase: 'erstkontakt' },
  { key: 'schadentyp', label: 'Schadentyp', icon: ClipboardListIcon, phase: 'schadentyp-erfasst' },
  { key: 'konstellation', label: 'Konstellation', icon: UsersIcon, phase: 'konstellation-erfasst' },
  { key: 'gegner', label: 'Gegner-Daten', icon: ShieldIcon, phase: 'gegner-daten' },
  { key: 'termin', label: 'Gutachtertermin', icon: CalendarIcon, phase: 'gutachtertermin' },
  { key: 'flow', label: 'FlowLink', icon: SendIcon, phase: 'flow-gesendet' },
]

function phaseIndex(phase: string | null): number { return PHASE_ORDER.indexOf(phase ?? 'neu') }

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LeadStepper({ lead, rightSidebar }: { lead: LeadData; rightSidebar?: ReactNode }) {
  const router = useRouter()
  const currentPhaseIdx = phaseIndex(lead.qualifizierungs_phase)
  const defaultOpen = STEPS.findIndex(s => phaseIndex(s.phase) > currentPhaseIdx)
  const [openStep, setOpenStep] = useState(defaultOpen >= 0 ? defaultOpen : 0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Form state — BUG-57: Vorname, Nachname, Telefon, Email EDITIERBAR
  const [vorname, setVorname] = useState(lead.vorname ?? '')
  const [nachname, setNachname] = useState(lead.nachname ?? '')
  const [telefon, setTelefon] = useState(lead.telefon ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [sf, setSf] = useState(lead.schadenfall_typ ?? '')
  const [kk, setKk] = useState(lead.kunden_konstellation ?? 'kk-01')
  const [sfVariante, setSfVariante] = useState(lead.sf_variante ?? '')
  const [gegnerName, setGegnerName] = useState(lead.gegner_name ?? '')
  const [gegnerVersicherung, setGegnerVersicherung] = useState(lead.gegner_versicherung ?? '')
  const [gegnerKennzeichen, setGegnerKennzeichen] = useState(lead.gegner_kennzeichen ?? '')
  const [eigeneVersicherung, setEigeneVersicherung] = useState(lead.eigene_versicherung ?? '')
  const [eigenePolicennr, setEigenePolicennr] = useState(lead.eigene_policennr ?? '')
  const [polizeiAktenzeichen, setPolizeiAktenzeichen] = useState(lead.polizei_aktenzeichen ?? '')
  const [polizeibericht, setPolizeibericht] = useState(lead.polizeibericht_pflicht ?? false)
  const [personenschaden, setPersonenschaden] = useState(lead.personenschaden_flag ?? false)
  const [mietwagen, setMietwagen] = useState(lead.mietwagen_flag ?? false)
  const [schadensursache, setSchadensursache] = useState(lead.schadensursache ?? '')
  const [leasingGeber, setLeasingGeber] = useState(lead.leasing_geber ?? '')
  const [finanzierungBank, setFinanzierungBank] = useState(lead.finanzierung_bank ?? '')
  const [firmaName, setFirmaName] = useState(lead.firma_name ?? '')
  const [firmaUstid, setFirmaUstid] = useState(lead.firma_ustid ?? '')
  const [halterName, setHalterName] = useState(lead.halter_name ?? '')
  const [unfallhergang, setUnfallhergang] = useState(lead.unfallhergang ?? '')

  // Fahrzeugdaten
  const [kennzeichen, setKennzeichen] = useState(lead.kennzeichen ?? '')
  const [fzHersteller, setFzHersteller] = useState(lead.fahrzeug_hersteller ?? '')
  const [fzModell, setFzModell] = useState(lead.fahrzeug_modell ?? '')
  const [fzFarbe, setFzFarbe] = useState(lead.fahrzeug_farbe ?? '')
  const [erstzulassung, setErstzulassung] = useState(lead.erstzulassung ?? '')
  const [fin, setFin] = useState(lead.fin ?? '')
  const [kilometerstand, setKilometerstand] = useState(lead.kilometerstand ?? '')

  // BUG-52: Kundenadresse, Unfallort, Unfalldatum
  const [kundeAdresse, setKundeAdresse] = useState((lead as Record<string, unknown>).kunde_adresse as string ?? '')
  const [kundeLat, setKundeLat] = useState<number | null>((lead as Record<string, unknown>).kunde_lat as number ?? null)
  const [kundeLng, setKundeLng] = useState<number | null>((lead as Record<string, unknown>).kunde_lng as number ?? null)
  const [unfallort, setUnfallort] = useState((lead as Record<string, unknown>).unfallort as string ?? '')
  const [unfallortLat, setUnfallortLat] = useState<number | null>((lead as Record<string, unknown>).unfallort_lat as number ?? null)
  const [unfallortLng, setUnfallortLng] = useState<number | null>((lead as Record<string, unknown>).unfallort_lng as number ?? null)
  const [unfalldatum, setUnfalldatum] = useState((lead as Record<string, unknown>).unfalldatum as string ?? '')

  const needsGegner = sf === 'sf-01' || sf === 'sf-02' || (sf === 'sf-03' && sfVariante === 'a')
  const needsEigeneVers = sf === 'sf-02' || (sf === 'sf-03' && sfVariante === 'b')
  const needsPolizei = sf === 'sf-02' || sf === 'sf-03'
  const gegnerStepVisible = needsGegner

  async function saveAndAdvance(newPhase: string, extraData?: Record<string, unknown>) {
    setSaving(true); setSaved(false)
    try {
      await saveLeadQualifizierung(lead.id, {
        vorname: vorname || null, nachname: nachname || null,
        telefon: telefon || null, email: email || null,
        schadenfall_typ: sf || null, kunden_konstellation: kk || null,
        qualifizierungs_phase: newPhase,
        sf_variante: sf === 'sf-03' ? sfVariante || null : null,
        gegner_name: needsGegner ? gegnerName || null : null,
        gegner_versicherung: needsGegner ? gegnerVersicherung || null : null,
        gegner_kennzeichen: needsGegner ? gegnerKennzeichen || null : null,
        gegner_bekannt: sf === 'sf-03' ? sfVariante === 'a' : sf === 'sf-01' || sf === 'sf-02',
        eigene_versicherung: needsEigeneVers ? eigeneVersicherung || null : null,
        eigene_policennr: needsEigeneVers ? eigenePolicennr || null : null,
        polizei_aktenzeichen: needsPolizei ? polizeiAktenzeichen || null : null,
        polizeibericht_pflicht: polizeibericht, personenschaden_flag: personenschaden, mietwagen_flag: mietwagen,
        schadensursache: schadensursache || null, unfallhergang: unfallhergang || null,
        kennzeichen: kennzeichen || null, fahrzeug_hersteller: fzHersteller || null,
        fahrzeug_modell: fzModell || null, fahrzeug_farbe: fzFarbe || null,
        erstzulassung: erstzulassung || null, fin: fin || null,
        kilometerstand: kilometerstand ? Number(kilometerstand) : null,
        leasing_geber: kk === 'kk-02' ? leasingGeber || null : null, leasing_flag: kk === 'kk-02',
        finanzierung_bank: kk === 'kk-03' ? finanzierungBank || null : null, finanzierung_flag: kk === 'kk-03',
        firma_name: kk === 'kk-04' ? firmaName || null : null, firma_ustid: kk === 'kk-04' ? firmaUstid || null : null, gewerbe_flag: kk === 'kk-04',
        halter_name: kk === 'kk-05' ? halterName || null : null, halter_ungleich_fahrer_flag: kk === 'kk-05',
        // BUG-52: Adressen
        kunde_adresse: kundeAdresse || null, kunde_lat: kundeLat, kunde_lng: kundeLng,
        unfallort: unfallort || null, unfallort_lat: unfallortLat, unfallort_lng: unfallortLng,
        unfalldatum: unfalldatum || null,
        ...extraData,
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
      const nextStepIdx = STEPS.findIndex(s => s.phase === newPhase)
      if (nextStepIdx >= 0 && nextStepIdx < STEPS.length - 1) setOpenStep(nextStepIdx + 1)
      router.refresh()
    } catch { /* handled */ }
    setSaving(false)
  }

  function isStepDone(idx: number) { return currentPhaseIdx >= phaseIndex(STEPS[idx].phase) }
  function isStepCurrent(idx: number) {
    if (isStepDone(idx)) return false
    for (let i = 0; i < idx; i++) {
      if (STEPS[i].key === 'gegner' && !gegnerStepVisible) continue
      if (!isStepDone(i)) return false
    }
    return true
  }

  // ─── Render: 3-column split layout ─────────────────────────────────

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-5">
      {saved && (
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 text-emerald-600 text-xs font-medium">
          Gespeichert
        </div>
      )}

      <div className="flex min-h-[400px]">
        {/* ── LEFT: Step Navigation ──────────────────────────────── */}
        <div className="w-48 border-r border-gray-100 bg-gray-50/50 flex-shrink-0 py-3">
          <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider px-3 mb-2">Qualifizierung</p>
          {(() => {
            const visibleSteps = STEPS.filter(s => !(s.key === 'gegner' && !gegnerStepVisible))
            return visibleSteps.map((step, vIdx) => {
              const idx = STEPS.indexOf(step)
              const Icon = step.icon
              const done = isStepDone(idx)
              const current = isStepCurrent(idx)
              const active = openStep === idx
              const isLast = vIdx === visibleSteps.length - 1
              const nextDone = !isLast && isStepDone(STEPS.indexOf(visibleSteps[vIdx + 1]))
              const nextCurrent = !isLast && isStepCurrent(STEPS.indexOf(visibleSteps[vIdx + 1]))

              return (
                <div key={step.key}>
                  <button
                    onClick={() => setOpenStep(idx)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                      active ? 'bg-white border-r-2 border-[#4573A2] shadow-sm' : 'hover:bg-white/60'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      done ? 'bg-emerald-500' : current ? 'bg-[#4573A2] animate-stepper-pulse' : 'bg-gray-200'
                    }`}>
                      {done ? (
                        <CheckCircle2Icon className="w-3 h-3 text-white" />
                      ) : (
                        <Icon className={`w-2.5 h-2.5 ${current ? 'text-white' : 'text-gray-400'}`} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[11px] font-medium truncate ${
                        done ? 'text-emerald-600' : current ? 'text-[#4573A2]' : active ? 'text-gray-800' : 'text-gray-500'
                      }`}>
                        {step.label}
                      </p>
                    </div>
                  </button>
                  {!isLast && (
                    <div className="pl-3">
                      <div className={`w-0.5 h-3 ml-[9px] rounded-full ${
                        done && nextDone ? 'bg-emerald-400' :
                        done && nextCurrent ? 'bg-gradient-to-b from-emerald-400 to-gray-300' :
                        'bg-gray-200'
                      }`} />
                    </div>
                  )}
                </div>
              )
            })
          })()}
        </div>

        {/* ── MIDDLE: Active Step Content ─────────────────────────── */}
        <div className="flex-1 p-4 overflow-y-auto min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">
            Schritt {openStep + 1}: {STEPS[openStep]?.label}
          </h3>

          {STEPS[openStep]?.key === 'erstkontakt' && (
            <StepErstkontakt done={isStepDone(0)} saving={saving} onAdvance={() => saveAndAdvance('erstkontakt')}
              lead={lead}
              vorname={vorname} setVorname={setVorname}
              nachname={nachname} setNachname={setNachname}
              telefon={telefon} setTelefon={setTelefon}
              email={email} setEmail={setEmail}
              kundeAdresse={kundeAdresse} onAdresseChange={(a, lat, lng) => { setKundeAdresse(a); setKundeLat(lat); setKundeLng(lng) }} />
          )}
          {STEPS[openStep]?.key === 'schadentyp' && (
            <StepSchadentyp
              sf={sf} setSf={setSf} sfVariante={sfVariante} setSfVariante={setSfVariante}
              needsEigeneVers={needsEigeneVers} eigeneVersicherung={eigeneVersicherung} setEigeneVersicherung={setEigeneVersicherung}
              eigenePolicennr={eigenePolicennr} setEigenePolicennr={setEigenePolicennr}
              needsPolizei={needsPolizei} polizeiAktenzeichen={polizeiAktenzeichen} setPolizeiAktenzeichen={setPolizeiAktenzeichen}
              polizeibericht={polizeibericht} setPolizeibericht={setPolizeibericht}
              personenschaden={personenschaden} setPersonenschaden={setPersonenschaden}
              mietwagen={mietwagen} setMietwagen={setMietwagen}
              unfallhergang={unfallhergang} setUnfallhergang={setUnfallhergang}
              kennzeichen={kennzeichen} setKennzeichen={setKennzeichen}
              fzHersteller={fzHersteller} setFzHersteller={setFzHersteller}
              fzModell={fzModell} setFzModell={setFzModell}
              fzFarbe={fzFarbe} setFzFarbe={setFzFarbe}
              erstzulassung={erstzulassung} setErstzulassung={setErstzulassung}
              fin={fin} setFin={setFin}
              kilometerstand={kilometerstand} setKilometerstand={setKilometerstand}
              unfallort={unfallort} onUnfallortChange={(a, lat, lng) => { setUnfallort(a); setUnfallortLat(lat); setUnfallortLng(lng) }}
              unfalldatum={unfalldatum} setUnfalldatum={setUnfalldatum}
              saving={saving} onAdvance={() => saveAndAdvance('schadentyp-erfasst')}
            />
          )}
          {STEPS[openStep]?.key === 'konstellation' && (
            <StepKonstellation kk={kk} setKk={setKk} leasingGeber={leasingGeber} setLeasingGeber={setLeasingGeber}
              finanzierungBank={finanzierungBank} setFinanzierungBank={setFinanzierungBank}
              firmaName={firmaName} setFirmaName={setFirmaName} firmaUstid={firmaUstid} setFirmaUstid={setFirmaUstid}
              halterName={halterName} setHalterName={setHalterName} saving={saving} onAdvance={() => saveAndAdvance('konstellation-erfasst')} />
          )}
          {STEPS[openStep]?.key === 'gegner' && (
            <StepGegner gegnerName={gegnerName} setGegnerName={setGegnerName}
              gegnerVersicherung={gegnerVersicherung} setGegnerVersicherung={setGegnerVersicherung}
              gegnerKennzeichen={gegnerKennzeichen} setGegnerKennzeichen={setGegnerKennzeichen}
              saving={saving} onAdvance={() => saveAndAdvance('gegner-daten')} />
          )}
          {STEPS[openStep]?.key === 'termin' && (
            <StepGutachterTermin lead={lead} saving={saving}
              onAdvance={(svId, termin, plz, adresse, bLat, bLng, svName) => {
                setSaving(true)
                confirmGutachterTermin(lead.id, svId, termin, plz, adresse, bLat, bLng)
                  .then((result) => {
                    if (result.success) {
                      // BUG-65D: Toast mit Details
                      const terminStr = new Date(termin).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      toast.success(`Termin reserviert mit ${svName ?? 'Gutachter'} am ${terminStr} an ${adresse || plz}`)
                      return saveAndAdvance('gutachtertermin')
                    } else {
                      toast.error(`Fehler: ${result.error ?? 'Unbekannt'}`)
                      setSaving(false)
                    }
                  })
                  .catch((err) => {
                    console.error('[LeadStepper] confirmGutachterTermin FEHLER:', err)
                    setSaving(false)
                    toast.error(`Fehler beim Zuweisen: ${err instanceof Error ? err.message : String(err)}`)
                  })
              }} />
          )}
          {STEPS[openStep]?.key === 'flow' && <StepFlowLink lead={lead} />}
        </div>

        {/* ── RIGHT: Notizen + Timeline ──────────────────────────── */}
        {rightSidebar && (
          <div className="w-[280px] border-l border-gray-100 bg-gray-50/30 flex-shrink-0 overflow-y-auto p-3">
            {rightSidebar}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Step 1: Erstkontakt ────────────────────────────────────────────────────

function StepErstkontakt({ done, saving, onAdvance, lead,
  vorname, setVorname, nachname, setNachname, telefon, setTelefon, email, setEmail,
  kundeAdresse, onAdresseChange,
}: {
  done: boolean; saving: boolean; onAdvance: () => void
  lead: LeadData
  vorname: string; setVorname: (v: string) => void
  nachname: string; setNachname: (v: string) => void
  telefon: string; setTelefon: (v: string) => void
  email: string; setEmail: (v: string) => void
  kundeAdresse: string; onAdresseChange: (adresse: string, lat: number | null, lng: number | null) => void
}) {
  if (done) {
    const name = [vorname || lead.vorname, nachname || lead.nachname].filter(Boolean).join(' ') || '—'
    return (
      <div className="space-y-2">
        <p className="text-emerald-500 text-sm flex items-center gap-2"><CheckCircle2Icon className="w-4 h-4" /> Erstkontakt hergestellt</p>
        <div className="text-xs text-gray-500 space-y-0.5">
          <p><strong>Name:</strong> {name}</p>
          {(telefon || lead.telefon) && <p><strong>Telefon:</strong> {telefon || lead.telefon}</p>}
          {(email || lead.email) && <p><strong>Email:</strong> {email || lead.email}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-gray-500 text-sm">Rufen Sie den Lead an und stellen Sie den Erstkontakt her.</p>

      {/* Kontaktdaten — BUG-57: EDITIERBAR */}
      <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2">
        <legend className="text-xs text-[#4573A2] font-medium px-2">Kontaktdaten</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Vorname *" value={vorname} onChange={setVorname} />
          <Input label="Nachname *" value={nachname} onChange={setNachname} />
          <Input label="Telefon *" value={telefon} onChange={setTelefon} />
          <Input label="Email" value={email} onChange={setEmail} />
        </div>
      </fieldset>

      {/* Kundenadresse mit Google Places */}
      <div>
        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> Kundenadresse (Wohnadresse)</label>
        <GooglePlaceAutocomplete
          defaultValue={kundeAdresse}
          placeholder="Wohnadresse eingeben..."
          onSelect={r => onAdresseChange(r.adresse, r.lat, r.lng)}
          className={inputCls}
        />
      </div>

      <button onClick={onAdvance} disabled={saving || !vorname || !nachname}
        className="bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-colors flex items-center gap-2">
        <PhoneCallIcon className="w-4 h-4" /> {saving ? 'Speichert...' : 'Erstkontakt hergestellt'}
      </button>
    </div>
  )
}

// ─── Step 2: Schadentyp + Unfallhergang ─────────────────────────────────────

function StepSchadentyp({
  sf, setSf, sfVariante, setSfVariante,
  needsEigeneVers, eigeneVersicherung, setEigeneVersicherung, eigenePolicennr, setEigenePolicennr,
  needsPolizei, polizeiAktenzeichen, setPolizeiAktenzeichen, polizeibericht, setPolizeibericht,
  personenschaden, setPersonenschaden, mietwagen, setMietwagen,
  unfallhergang, setUnfallhergang,
  kennzeichen, setKennzeichen, fzHersteller, setFzHersteller,
  fzModell, setFzModell, fzFarbe, setFzFarbe,
  erstzulassung, setErstzulassung, fin, setFin,
  kilometerstand, setKilometerstand,
  unfallort, onUnfallortChange,
  unfalldatum, setUnfalldatum,
  saving, onAdvance,
}: {
  sf: string; setSf: (v: string) => void; sfVariante: string; setSfVariante: (v: string) => void
  needsEigeneVers: boolean; eigeneVersicherung: string; setEigeneVersicherung: (v: string) => void
  eigenePolicennr: string; setEigenePolicennr: (v: string) => void
  needsPolizei: boolean; polizeiAktenzeichen: string; setPolizeiAktenzeichen: (v: string) => void
  polizeibericht: boolean; setPolizeibericht: (v: boolean) => void
  personenschaden: boolean; setPersonenschaden: (v: boolean) => void
  mietwagen: boolean; setMietwagen: (v: boolean) => void
  unfallhergang: string; setUnfallhergang: (v: string) => void
  kennzeichen: string; setKennzeichen: (v: string) => void
  fzHersteller: string; setFzHersteller: (v: string) => void
  fzModell: string; setFzModell: (v: string) => void
  fzFarbe: string; setFzFarbe: (v: string) => void
  erstzulassung: string; setErstzulassung: (v: string) => void
  fin: string; setFin: (v: string) => void
  kilometerstand: string | number; setKilometerstand: (v: string | number) => void
  unfallort: string; onUnfallortChange: (adresse: string, lat: number | null, lng: number | null) => void
  unfalldatum: string; setUnfalldatum: (v: string) => void
  saving: boolean; onAdvance: () => void
}) {
  return (
    <div className="space-y-3">
      {/* Fahrzeugdaten */}
      <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2">
        <legend className="text-xs text-[#4573A2] font-medium px-2">Fahrzeugdaten</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Kennzeichen *" value={kennzeichen} onChange={setKennzeichen} />
          <Input label="Marke / Hersteller" value={fzHersteller} onChange={setFzHersteller} />
          <Input label="Modell" value={fzModell} onChange={setFzModell} />
          <Input label="Farbe" value={fzFarbe} onChange={setFzFarbe} />
          <Input label="Erstzulassung (MM/YYYY)" value={erstzulassung} onChange={setErstzulassung} />
          <Input label="FIN / Fahrgestellnr." value={fin} onChange={setFin} />
          <Input label="Kilometerstand" value={String(kilometerstand)} onChange={v => setKilometerstand(v)} />
        </div>
      </fieldset>

      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Schadentyp *</label>
        <select value={sf} onChange={e => setSf(e.target.value)} className={selectCls}>
          <option value="">Bitte wählen</option>
          {SF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} {o.pct}</option>)}
        </select>
      </div>

      {sf === 'sf-03' && (
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="sf03var" value="a" checked={sfVariante === 'a'} onChange={() => setSfVariante('a')} className="accent-[#4573A2]" />
            A - Gegner bekannt
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="sf03var" value="b" checked={sfVariante === 'b'} onChange={() => setSfVariante('b')} className="accent-[#4573A2]" />
            B - Fahrerflucht
          </label>
        </div>
      )}

      {/* Unfallhergang + Unfallort + Unfalldatum */}
      {sf && (
        <>
          <div>
            <label className="text-xs text-gray-500 mb-1.5 block flex items-center gap-1">
              <AlertCircleIcon className="w-3 h-3" /> Unfallhergang
            </label>
            <textarea
              value={unfallhergang}
              onChange={e => setUnfallhergang(e.target.value)}
              placeholder="Wie ist der Unfall passiert? (Ort, Zeit, Ablauf, Beteiligte...)"
              rows={4}
              className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2] resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-1">Freitext-Beschreibung des Unfallhergangs durch den Kunden</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> Unfallort</label>
              <GooglePlaceAutocomplete
                defaultValue={unfallort}
                placeholder="Unfallort eingeben..."
                onSelect={r => onUnfallortChange(r.adresse, r.lat, r.lng)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Unfalldatum</label>
              <input type="date" value={unfalldatum} onChange={e => setUnfalldatum(e.target.value)} className={inputCls} />
            </div>
          </div>
        </>
      )}

      {needsEigeneVers && (
        <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-amber-600 font-medium px-2">Eigene Versicherung</legend>
          <VersicherungCombobox label="Versicherung" value={eigeneVersicherung} onChange={setEigeneVersicherung} />
          <Input label="Policennummer" value={eigenePolicennr} onChange={setEigenePolicennr} />
        </fieldset>
      )}

      {needsPolizei && (
        <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-orange-600 font-medium px-2">Polizei</legend>
          <Input label="Aktenzeichen" value={polizeiAktenzeichen} onChange={setPolizeiAktenzeichen} />
          <Checkbox label="Polizeibericht vorhanden" checked={polizeibericht} onChange={setPolizeibericht} />
        </fieldset>
      )}

      <div className="flex flex-wrap gap-4">
        <Checkbox label="Personenschaden vorhanden?" checked={personenschaden} onChange={setPersonenschaden} />
        <Checkbox label="Mietwagen gewuenscht?" checked={mietwagen} onChange={setMietwagen} />
      </div>

      <button onClick={onAdvance} disabled={saving || !sf}
        className="bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-colors">
        {saving ? 'Speichert...' : 'Schadentyp bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 3: Konstellation ──────────────────────────────────────────────────

function StepKonstellation({
  kk, setKk, leasingGeber, setLeasingGeber, finanzierungBank, setFinanzierungBank,
  firmaName, setFirmaName, firmaUstid, setFirmaUstid, halterName, setHalterName,
  saving, onAdvance,
}: {
  kk: string; setKk: (v: string) => void
  leasingGeber: string; setLeasingGeber: (v: string) => void
  finanzierungBank: string; setFinanzierungBank: (v: string) => void
  firmaName: string; setFirmaName: (v: string) => void; firmaUstid: string; setFirmaUstid: (v: string) => void
  halterName: string; setHalterName: (v: string) => void
  saving: boolean; onAdvance: () => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Kunden-Konstellation *</label>
        <select value={kk} onChange={e => setKk(e.target.value)} className={selectCls}>{KK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </div>
      {kk === 'kk-02' && <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2"><legend className="text-xs text-cyan-600 font-medium px-2">Leasing</legend><Input label="Leasinggeber" value={leasingGeber} onChange={setLeasingGeber} /></fieldset>}
      {kk === 'kk-03' && <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2"><legend className="text-xs text-cyan-600 font-medium px-2">Finanzierung</legend><Input label="Bank" value={finanzierungBank} onChange={setFinanzierungBank} /></fieldset>}
      {kk === 'kk-04' && <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2"><legend className="text-xs text-cyan-600 font-medium px-2">Firma</legend><Input label="Firmenname" value={firmaName} onChange={setFirmaName} /><Input label="USt-IdNr" value={firmaUstid} onChange={setFirmaUstid} /></fieldset>}
      {kk === 'kk-05' && <fieldset className="border border-gray-200 rounded-xl p-3 space-y-2"><legend className="text-xs text-cyan-600 font-medium px-2">Halter (SA vom Halter!)</legend><Input label="Name Halter" value={halterName} onChange={setHalterName} /></fieldset>}
      <button onClick={onAdvance} disabled={saving}
        className="bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-colors">
        {saving ? 'Speichert...' : 'Konstellation bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 4: Gegner ───────────────────────────────────���─────────────────────

function StepGegner({ gegnerName, setGegnerName, gegnerVersicherung, setGegnerVersicherung, gegnerKennzeichen, setGegnerKennzeichen, saving, onAdvance }: {
  gegnerName: string; setGegnerName: (v: string) => void; gegnerVersicherung: string; setGegnerVersicherung: (v: string) => void
  gegnerKennzeichen: string; setGegnerKennzeichen: (v: string) => void; saving: boolean; onAdvance: () => void
}) {
  return (
    <div className="space-y-3">
      <Input label="Name Gegner" value={gegnerName} onChange={setGegnerName} />
      <VersicherungCombobox label="Versicherung Gegner" value={gegnerVersicherung} onChange={setGegnerVersicherung} />
      <Input label="Kennzeichen Gegner" value={gegnerKennzeichen} onChange={setGegnerKennzeichen} />
      <button onClick={onAdvance} disabled={saving}
        className="bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium rounded-xl px-5 py-2.5 transition-colors">
        {saving ? 'Speichert...' : 'Gegner-Daten bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 5: Gutachtertermin ────────────────────────────────────────────────

function StepGutachterTermin({ lead, saving: parentSaving, onAdvance }: {
  lead: LeadData; saving: boolean; onAdvance: (svId: string, termin: string, plz: string, adresse: string, lat?: number | null, lng?: number | null, svName?: string) => void
}) {
  const router = useRouter()
  const [plz, setPlz] = useState(lead.fahrzeug_standort_plz ?? '')
  const [adresse, setAdresse] = useState(lead.fahrzeug_standort_adresse ?? '')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [wunschtermin, setWunschtermin] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settingSvGesucht, setSettingSvGesucht] = useState(false)
  // BUG-65C: Loading-State pro SV-Karte (nicht global)
  const [loadingSvId, setLoadingSvId] = useState<string | null>(null)

  function handlePlaceSelect(r: PlaceResult) {
    setAdresse(r.adresse)
    setPlz(r.plz)
    setLat(r.lat)
    setLng(r.lng)
  }

  if (lead.gutachter_termin) {
    return (
      <div className="flex items-center gap-3">
        <CheckCircle2Icon className="w-4 h-4 text-green-500" />
        <div>
          <p className="text-green-600 text-sm">Termin bestätigt</p>
          <p className="text-gray-500 text-xs">{new Date(lead.gutachter_termin).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    )
  }

  async function handleSearch() {
    if (!plz || !wunschtermin) return
    setSearching(true); setError(null); setResult(null)
    try {
      // KFZ-154: spezifikation + schadenart aus dem Lead mit reichen
      const res = await fetch('/api/gutachter-matching', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plz, lat, lng, wunschtermin: new Date(wunschtermin).toISOString(), schadenfall_typ: lead.schadenfall_typ, spezifikation: lead.spezifikation, schadenart: lead.schadenart }) })
      if (!res.ok) { const data = await res.json(); throw new Error(data?.error ?? 'Suche fehlgeschlagen') }
      setResult(await res.json())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler'
      setError(msg)
      toast.error(msg)
    }
    finally { setSearching(false) }
  }

  async function handleSvGesucht() {
    setSettingSvGesucht(true)
    try {
      const res = await setSvGesucht(lead.id)
      if (res?.success) {
        toast.success('Status auf "SV gesucht" gesetzt — Termin verfaellt NICHT')
        router.refresh()
      } else {
        toast.error(res?.error ?? 'Fehler beim Setzen')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSettingSvGesucht(false)
    }
  }

  const svGesucht = result && (result as Record<string, unknown>).sv_gesucht === true
  const slots = result ? [result.empfohlen, result.alternative_1, result.alternative_2].filter(Boolean) : []

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1 flex items-center gap-1"><MapPinIcon className="w-3 h-3" /> Besichtigungsort (Google Places)</label>
        <GooglePlaceAutocomplete
          defaultValue={adresse}
          placeholder="Adresse eingeben..."
          onSelect={handlePlaceSelect}
          className={inputCls}
        />
        {plz && (
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
            <span>PLZ: {plz}</span>
            {lat != null && <span>Lat: {lat.toFixed(4)}</span>}
            {lng != null && <span>Lng: {lng.toFixed(4)}</span>}
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Wunschtermin</label>
        <input type="datetime-local" value={wunschtermin} onChange={e => setWunschtermin(e.target.value)} min={new Date().toISOString().slice(0, 16)} className={inputCls} />
      </div>
      {error && <p className="text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-3 py-2">{error}</p>}
      {!result && (
        <button onClick={handleSearch} disabled={searching || !plz || !wunschtermin || parentSaving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 bg-[#1E3A5F] hover:bg-[#4573A2] text-white flex items-center justify-center gap-2">
          {searching ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Suche...</> : <><SearchIcon className="w-4 h-4" />Gutachter suchen</>}
        </button>
      )}
      {result && (
        <div className="space-y-2">
          {slots.length > 0 ? (
            <>
              {slots.map((slot, i) => (
                <SlotCard key={slot!.sv_id + slot!.termin} slot={slot!} label={i === 0 ? 'Empfohlen' : `Alternative ${i}`} variant={i === 0 ? 'empfohlen' : 'alternative'}
                  onConfirm={() => { setLoadingSvId(slot!.sv_id); onAdvance(slot!.sv_id, slot!.termin, plz, adresse, lat, lng, slot!.name) }}
                  confirming={loadingSvId === slot!.sv_id}
                  disabled={loadingSvId !== null && loadingSvId !== slot!.sv_id} />
              ))}
            </>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center">
              <AlertCircleIcon className="w-5 h-5 text-amber-500 mx-auto mb-2" />
              <p className="text-sm text-amber-700 font-medium">Kein Gutachter verfügbar</p>
              <p className="text-xs text-amber-600 mt-1">Es konnte kein passender SV im Gebiet gefunden werden.</p>
            </div>
          )}

          {/* SV gesucht Button — immer anzeigen wenn sv_gesucht oder keine Slots */}
          {(svGesucht || slots.length === 0) && (
            <button onClick={handleSvGesucht} disabled={settingSvGesucht}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 bg-amber-500 hover:bg-amber-400 text-white flex items-center justify-center gap-2">
              {settingSvGesucht ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Wird gesetzt...</> : <><SearchIcon className="w-4 h-4" />SV gesucht setzen</>}
            </button>
          )}

          <button onClick={() => setResult(null)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Anderen Termin</button>
        </div>
      )}
    </div>
  )
}

function SlotCard({ slot, label, variant, onConfirm, confirming, disabled }: {
  slot: GutachterSlot; label: string; variant: 'empfohlen' | 'alternative'; onConfirm: () => void; confirming: boolean; disabled?: boolean
}) {
  const isEmpf = variant === 'empfohlen'
  const wunsch = slot.wunschtermin_moeglich
  const prio = (slot as Record<string, unknown>).prio as number | undefined
  const routeInfo = (slot as Record<string, unknown>).route_info as string | undefined
  const fahrzeitM = (slot as Record<string, unknown>).fahrzeit_min as number | undefined
  const nextSlot = (slot as Record<string, unknown>).naechster_freier_slot as string | undefined
  const partnerSeit = (slot as Record<string, unknown>).partner_seit as string | undefined

  // BUG-65B: Empfohlener SV bekommt bg-[#4573A2] (Ondo Blue) + weiss + *EMPFEHLUNG Badge
  return (
    <div className={`rounded-xl p-3 border transition-all ${
      isEmpf
        ? 'bg-[#4573A2] border-[#4573A2] text-white'
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-center gap-2">
        {isEmpf && <StarIcon className="w-3.5 h-3.5 text-white fill-current" />}
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${isEmpf ? 'text-white' : 'text-[#4573A2]'}`}>
          {isEmpf ? '*EMPFEHLUNG' : label}
        </span>
        {wunsch && <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isEmpf ? 'bg-white/20 text-white' : 'bg-green-50 text-green-600'}`}>Wunschtermin</span>}
      </div>
      <div className="flex items-center gap-2 mt-1.5 mb-1">
        <UserCheckIcon className={`w-3.5 h-3.5 ${isEmpf ? 'text-white/80' : 'text-[#4573A2]'}`} />
        <span className={`text-sm font-medium ${isEmpf ? 'text-white' : 'text-gray-800'}`}>{slot.name}</span>
        {slot.entfernung_km != null && <span className={`text-[11px] flex items-center gap-0.5 ${isEmpf ? 'text-white/70' : 'text-gray-500'}`}><MapPinIcon className="w-3 h-3" />{slot.entfernung_km}km</span>}
        {fahrzeitM != null && <span className={`text-[10px] ${isEmpf ? 'text-white/60' : 'text-gray-400'}`}>~{fahrzeitM}min</span>}
      </div>
      {partnerSeit && <p className={`text-[10px] mb-1 ${isEmpf ? 'text-white/60' : 'text-gray-400'}`}>Partner seit {new Date(partnerSeit).toLocaleDateString('de-DE')}</p>}
      {routeInfo && <p className={`text-[10px] mb-1.5 italic ${isEmpf ? 'text-white/70' : 'text-gray-500'}`}>{routeInfo}</p>}
      {!wunsch && nextSlot && (
        <p className={`text-[10px] font-medium mb-1 ${isEmpf ? 'text-white/80' : 'text-amber-600'}`}>Nächster freier Slot: {new Date(nextSlot).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
      )}
      <div className={`flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg ${isEmpf ? 'bg-white/10' : 'bg-gray-50 border border-gray-100'}`}>
        <CalendarIcon className={`w-3 h-3 ${isEmpf ? 'text-white/70' : 'text-gray-400'}`} />
        <span className={`text-sm ${isEmpf ? 'text-white' : 'text-gray-700'}`}>{new Date(slot.termin).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className={`text-[10px] mb-2 ${isEmpf ? 'text-white/60' : 'text-gray-400'}`}>Auslastung: {slot.auslastung}</div>
      {/* BUG-65C: Button disabled wenn ANDERER SV in Bearbeitung */}
      <button onClick={onConfirm} disabled={confirming || disabled}
        className={`w-full py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all flex items-center justify-center gap-2 ${
          isEmpf
            ? 'bg-white text-[#4573A2] hover:bg-white/90'
            : 'bg-[#0D1B3E] hover:bg-[#1E3A5F] text-white'
        }`}>
        {confirming ? <><div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Wird zugewiesen...</> : 'Zuweisen'}
      </button>
    </div>
  )
}

// ─���─ Step 6: SA ─────────────────────────────────────────────────────────────

// ─── Step 6: FlowLink ───────────────────────────────────────────────────────

function StepFlowLink({ lead }: { lead: LeadData }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [flowUrl, setFlowUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alreadySent = lead.wa_gesendet || lead.status === 'flow-gesendet'
  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || ''

  async function handleSend() {
    setSending(true); setError(null)
    try {
      const { token } = await sendFlowLink(lead.id)
      const url = `${window.location.origin}/flow/${token}`
      setFlowUrl(url)
      // Send via Twilio WhatsApp API
      if (lead.telefon) {
        const { sendWhatsAppFromLead } = await import('./actions')
        const msg = `Hallo ${name}, hier ist Ihr Link zur Schadensaufnahme: ${url}\n\nIhr Claimondo-Team`
        await sendWhatsAppFromLead(lead.telefon, msg)
      }
      router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler') }
    finally { setSending(false) }
  }

  if (alreadySent && !flowUrl) return <p className="text-green-600 text-sm flex items-center gap-2"><CheckCircle2Icon className="w-4 h-4" /> WhatsApp bereits gesendet</p>

  if (flowUrl) {
    return (
      <div className="space-y-2">
        <p className="text-green-600 text-sm font-medium">Link erstellt & WhatsApp gesendet</p>
        <div className="flex items-stretch gap-2">
          <input type="text" readOnly value={flowUrl} className="flex-1 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 font-mono truncate" />
          <button onClick={async () => { await navigator.clipboard.writeText(flowUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="px-3 py-2 rounded-xl text-sm bg-gray-50 border border-gray-200 text-gray-700 hover:bg-gray-100 shrink-0">
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {!lead.telefon && <p className="text-amber-600 text-sm mb-3">Keine Telefonnummer hinterlegt.</p>}
      <button onClick={handleSend} disabled={sending || !lead.telefon}
        className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40 bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-2 transition-all">
        <SendIcon className="w-4 h-4" /> {sending ? 'Wird erstellt...' : 'Flow-Link senden via WhatsApp'}
      </button>
    </div>
  )
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

const selectCls = 'w-full bg-white border border-gray-200 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#4573A2]'
const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-800 placeholder-gray-400 text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2] transition-colors'

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}

function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="accent-[#4573A2] rounded" />
      {label}
    </label>
  )
}
