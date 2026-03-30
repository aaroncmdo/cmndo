'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadQualifizierung, confirmGutachterTermin } from './actions'
import { sendFlowLink } from '../../actions'
import {
  PhoneCallIcon,
  ClipboardListIcon,
  UsersIcon,
  ShieldIcon,
  CalendarIcon,
  FileTextIcon,
  SendIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  SearchIcon,
  MapPinIcon,
  ClockIcon,
  UserCheckIcon,
} from 'lucide-react'

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
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SF_OPTIONS = [
  { value: 'sf-01', label: 'SF-01 Unverschuldeter Unfall (Gegner ist schuld)', pct: '~60%' },
  { value: 'sf-02', label: 'SF-02 Teilschuld-Unfall', pct: '~10%' },
  { value: 'sf-03', label: 'SF-03 Parkschaden / Fahrerflucht', pct: '~8%' },
  // SF-04 (Kasko) entfernt - ist Disqualifizierungsgrund
  // SF-05 Personenschaden wird als Zusatz-Toggle angezeigt, nicht als eigener Typ
  // SF-06 Nutzungsausfall gehoert in die Fallakte, nicht in den Lead
]

const KK_OPTIONS = [
  { value: 'kk-01', label: 'KK-01 Privatperson eigenes Fahrzeug' },
  { value: 'kk-02', label: 'KK-02 Leasing-Fahrzeug' },
  { value: 'kk-03', label: 'KK-03 Finanziertes Fahrzeug' },
  { value: 'kk-04', label: 'KK-04 Firmenfahrzeug' },
  { value: 'kk-05', label: 'KK-05 Halter ungleich Fahrer' },
]

const SF04_URSACHEN = [
  { value: 'wild', label: 'Wildunfall' },
  { value: 'hagel', label: 'Hagel' },
  { value: 'vandalismus', label: 'Vandalismus' },
  { value: 'marderbiss', label: 'Marderbiss' },
  { value: 'sturm', label: 'Sturm' },
]

const PHASE_ORDER = [
  'neu', 'erstkontakt', 'schadentyp-erfasst', 'konstellation-erfasst',
  'gegner-daten', 'gutachtertermin', 'sa-unterschrieben', 'flow-gesendet', 'abgeschlossen',
]

type GutachterSlot = {
  sv_id: string
  name: string
  entfernung_km: number | null
  auslastung: string
  offene_faelle: number
  max_faelle_monat: number
  paket: string | null
  termin: string
  wunschtermin_moeglich: boolean
}

type MatchResult = {
  empfohlen: GutachterSlot | null
  alternative_1: GutachterSlot | null
  alternative_2: GutachterSlot | null
}

// ─── Steps Definition ───────────────────────────────────────────────────────

const STEPS = [
  { key: 'erstkontakt', label: 'Erstkontakt', icon: PhoneCallIcon, phase: 'erstkontakt' },
  { key: 'schadentyp', label: 'Schadentyp erfassen', icon: ClipboardListIcon, phase: 'schadentyp-erfasst' },
  { key: 'konstellation', label: 'Kunden-Konstellation', icon: UsersIcon, phase: 'konstellation-erfasst' },
  { key: 'gegner', label: 'Gegner-Daten', icon: ShieldIcon, phase: 'gegner-daten' },
  { key: 'termin', label: 'Gutachtertermin', icon: CalendarIcon, phase: 'gutachtertermin' },
  { key: 'sa', label: 'SA unterschrieben', icon: FileTextIcon, phase: 'sa-unterschrieben' },
  { key: 'flow', label: 'FlowLink senden', icon: SendIcon, phase: 'flow-gesendet' },
]

function phaseIndex(phase: string | null): number {
  return PHASE_ORDER.indexOf(phase ?? 'neu')
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function LeadStepper({ lead }: { lead: LeadData }) {
  const router = useRouter()
  const currentPhaseIdx = phaseIndex(lead.qualifizierungs_phase)

  // Which step is currently expanded
  const defaultOpen = STEPS.findIndex(s => phaseIndex(s.phase) >= currentPhaseIdx)
  const [openStep, setOpenStep] = useState(defaultOpen >= 0 ? defaultOpen : 0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // ─── Form state ─────────────────────────────────────────────────────
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

  const needsGegner = sf === 'sf-01' || sf === 'sf-02' || (sf === 'sf-03' && sfVariante === 'a')
  const needsEigeneVers = sf === 'sf-02' || (sf === 'sf-03' && sfVariante === 'b')
  const needsPolizei = sf === 'sf-02' || sf === 'sf-03'
  const needsUrsache = false // SF-04 removed

  // Skip gegner step if not needed
  const gegnerStepVisible = needsGegner

  async function saveAndAdvance(newPhase: string, extraData?: Record<string, unknown>) {
    setSaving(true)
    setSaved(false)
    try {
      await saveLeadQualifizierung(lead.id, {
        schadenfall_typ: sf || null,
        kunden_konstellation: kk || null,
        qualifizierungs_phase: newPhase,
        sf_variante: sf === 'sf-03' ? sfVariante || null : null,
        gegner_name: needsGegner ? gegnerName || null : null,
        gegner_versicherung: needsGegner ? gegnerVersicherung || null : null,
        gegner_kennzeichen: needsGegner ? gegnerKennzeichen || null : null,
        gegner_bekannt: sf === 'sf-03' ? sfVariante === 'a' : sf === 'sf-01' || sf === 'sf-02',
        eigene_versicherung: needsEigeneVers ? eigeneVersicherung || null : null,
        eigene_policennr: needsEigeneVers ? eigenePolicennr || null : null,
        polizei_aktenzeichen: needsPolizei ? polizeiAktenzeichen || null : null,
        polizeibericht_pflicht: polizeibericht,
        personenschaden_flag: personenschaden,
        mietwagen_flag: mietwagen,
        schadensursache: needsUrsache ? schadensursache || null : null,
        leasing_geber: kk === 'kk-02' ? leasingGeber || null : null,
        leasing_flag: kk === 'kk-02',
        finanzierung_bank: kk === 'kk-03' ? finanzierungBank || null : null,
        finanzierung_flag: kk === 'kk-03',
        firma_name: kk === 'kk-04' ? firmaName || null : null,
        firma_ustid: kk === 'kk-04' ? firmaUstid || null : null,
        gewerbe_flag: kk === 'kk-04',
        halter_name: kk === 'kk-05' ? halterName || null : null,
        halter_ungleich_fahrer_flag: kk === 'kk-05',
        ...extraData,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)

      // Auto-advance to next step
      const nextStepIdx = STEPS.findIndex(s => s.phase === newPhase)
      if (nextStepIdx >= 0 && nextStepIdx < STEPS.length - 1) {
        setOpenStep(nextStepIdx + 1)
      }
      router.refresh()
    } catch {
      // handled
    }
    setSaving(false)
  }

  function isStepDone(stepIdx: number): boolean {
    const stepPhaseIdx = phaseIndex(STEPS[stepIdx].phase)
    return currentPhaseIdx > stepPhaseIdx
  }

  function isStepCurrent(stepIdx: number): boolean {
    const stepPhaseIdx = phaseIndex(STEPS[stepIdx].phase)
    return currentPhaseIdx === stepPhaseIdx
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <h2 className="text-sm font-medium text-gray-500 mb-4">Qualifizierungs-Stepper</h2>
      {saved && <p className="text-emerald-400 text-xs mb-3">Gespeichert</p>}

      <div className="space-y-2">
        {STEPS.map((step, idx) => {
          // Hide gegner step if not needed
          if (step.key === 'gegner' && !gegnerStepVisible) return null

          const Icon = step.icon
          const done = isStepDone(idx)
          const current = isStepCurrent(idx)
          const isOpen = openStep === idx

          return (
            <div key={step.key} className={`rounded-xl border ${
              done ? 'border-emerald-800/50 bg-emerald-50/20' :
              current ? 'border-blue-800/50 bg-blue-50/20' :
              'border-gray-200 bg-gray-100/30'
            }`}>
              {/* Step header */}
              <button
                onClick={() => setOpenStep(isOpen ? -1 : idx)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  done ? 'bg-emerald-500/20' : current ? 'bg-blue-500/20' : 'bg-zinc-700/50'
                }`}>
                  {done ? (
                    <CheckCircle2Icon className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Icon className={`w-3.5 h-3.5 ${current ? 'text-blue-400' : 'text-gray-500'}`} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`text-sm font-medium ${
                    done ? 'text-emerald-400' : current ? 'text-blue-400' : 'text-gray-500'
                  }`}>
                    Schritt {idx + 1}: {step.label}
                  </span>
                </div>
                {isOpen ? (
                  <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                )}
              </button>

              {/* Step content */}
              {isOpen && (
                <div className="px-3 pb-4 pt-1">
                  {step.key === 'erstkontakt' && (
                    <StepErstkontakt done={done} saving={saving} onAdvance={() => saveAndAdvance('erstkontakt')} />
                  )}
                  {step.key === 'schadentyp' && (
                    <StepSchadentyp
                      sf={sf} setSf={setSf}
                      sfVariante={sfVariante} setSfVariante={setSfVariante}
                      needsEigeneVers={needsEigeneVers}
                      eigeneVersicherung={eigeneVersicherung} setEigeneVersicherung={setEigeneVersicherung}
                      eigenePolicennr={eigenePolicennr} setEigenePolicennr={setEigenePolicennr}
                      needsPolizei={needsPolizei}
                      polizeiAktenzeichen={polizeiAktenzeichen} setPolizeiAktenzeichen={setPolizeiAktenzeichen}
                      polizeibericht={polizeibericht} setPolizeibericht={setPolizeibericht}
                      needsUrsache={needsUrsache}
                      schadensursache={schadensursache} setSchadensursache={setSchadensursache}
                      personenschaden={personenschaden} setPersonenschaden={setPersonenschaden}
                      mietwagen={mietwagen} setMietwagen={setMietwagen}
                      saving={saving}
                      onAdvance={() => saveAndAdvance('schadentyp-erfasst')}
                    />
                  )}
                  {step.key === 'konstellation' && (
                    <StepKonstellation
                      kk={kk} setKk={setKk}
                      leasingGeber={leasingGeber} setLeasingGeber={setLeasingGeber}
                      finanzierungBank={finanzierungBank} setFinanzierungBank={setFinanzierungBank}
                      firmaName={firmaName} setFirmaName={setFirmaName}
                      firmaUstid={firmaUstid} setFirmaUstid={setFirmaUstid}
                      halterName={halterName} setHalterName={setHalterName}
                      saving={saving}
                      onAdvance={() => saveAndAdvance('konstellation-erfasst')}
                    />
                  )}
                  {step.key === 'gegner' && (
                    <StepGegner
                      gegnerName={gegnerName} setGegnerName={setGegnerName}
                      gegnerVersicherung={gegnerVersicherung} setGegnerVersicherung={setGegnerVersicherung}
                      gegnerKennzeichen={gegnerKennzeichen} setGegnerKennzeichen={setGegnerKennzeichen}
                      saving={saving}
                      onAdvance={() => saveAndAdvance('gegner-daten')}
                    />
                  )}
                  {step.key === 'termin' && (
                    <StepGutachterTermin
                      lead={lead}
                      saving={saving}
                      onAdvance={(svId: string, termin: string, plz: string, adresse: string) => {
                        setSaving(true)
                        confirmGutachterTermin(lead.id, svId, termin, plz, adresse)
                          .then(() => {
                            saveAndAdvance('gutachtertermin')
                          })
                          .catch(() => setSaving(false))
                      }}
                    />
                  )}
                  {step.key === 'sa' && (
                    <StepSA
                      lead={lead}
                      saving={saving}
                      onAdvance={(data: Record<string, unknown>) => saveAndAdvance('sa-unterschrieben', data)}
                    />
                  )}
                  {step.key === 'flow' && (
                    <StepFlowLink lead={lead} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Step 1: Erstkontakt ────────────────────────────────────────────────────

function StepErstkontakt({ done, saving, onAdvance }: { done: boolean; saving: boolean; onAdvance: () => void }) {
  if (done) {
    return <p className="text-emerald-400 text-sm">Erstkontakt hergestellt</p>
  }
  return (
    <div>
      <p className="text-gray-500 text-sm mb-3">
        Rufen Sie den Lead an und stellen Sie den Erstkontakt her.
      </p>
      <button
        onClick={onAdvance}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-5 py-2.5 transition-colors flex items-center gap-2"
      >
        <PhoneCallIcon className="w-4 h-4" />
        {saving ? 'Speichert...' : 'Erstkontakt hergestellt'}
      </button>
    </div>
  )
}

// ─── Step 2: Schadentyp ─────────────────────────────────────────────────────

function StepSchadentyp({
  sf, setSf, sfVariante, setSfVariante,
  needsEigeneVers, eigeneVersicherung, setEigeneVersicherung, eigenePolicennr, setEigenePolicennr,
  needsPolizei, polizeiAktenzeichen, setPolizeiAktenzeichen, polizeibericht, setPolizeibericht,
  needsUrsache, schadensursache, setSchadensursache,
  personenschaden, setPersonenschaden, mietwagen, setMietwagen,
  saving, onAdvance,
}: {
  sf: string; setSf: (v: string) => void
  sfVariante: string; setSfVariante: (v: string) => void
  needsEigeneVers: boolean; eigeneVersicherung: string; setEigeneVersicherung: (v: string) => void
  eigenePolicennr: string; setEigenePolicennr: (v: string) => void
  needsPolizei: boolean; polizeiAktenzeichen: string; setPolizeiAktenzeichen: (v: string) => void
  polizeibericht: boolean; setPolizeibericht: (v: boolean) => void
  needsUrsache: boolean; schadensursache: string; setSchadensursache: (v: string) => void
  personenschaden: boolean; setPersonenschaden: (v: boolean) => void
  mietwagen: boolean; setMietwagen: (v: boolean) => void
  saving: boolean; onAdvance: () => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Schadentyp *</label>
        <select value={sf} onChange={e => setSf(e.target.value)} className={selectCls}>
          <option value="">Bitte waehlen</option>
          {SF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} {o.pct}</option>)}
        </select>
      </div>

      {sf === 'sf-03' && (
        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="sf03var" value="a" checked={sfVariante === 'a'} onChange={() => setSfVariante('a')} className="accent-blue-500" />
            A - Gegner bekannt
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="radio" name="sf03var" value="b" checked={sfVariante === 'b'} onChange={() => setSfVariante('b')} className="accent-blue-500" />
            B - Fahrerflucht
          </label>
        </div>
      )}

      {needsEigeneVers && (
        <fieldset className="border border-gray-300 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-amber-400 font-medium px-2">Eigene Versicherung</legend>
          <Input label="Versicherung" value={eigeneVersicherung} onChange={setEigeneVersicherung} />
          <Input label="Policennummer" value={eigenePolicennr} onChange={setEigenePolicennr} />
        </fieldset>
      )}

      {needsPolizei && (
        <fieldset className="border border-gray-300 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-orange-400 font-medium px-2">Polizei</legend>
          <Input label="Aktenzeichen" value={polizeiAktenzeichen} onChange={setPolizeiAktenzeichen} />
          <Checkbox label="Polizeibericht vorhanden" checked={polizeibericht} onChange={setPolizeibericht} />
        </fieldset>
      )}

      {needsUrsache && (
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Schadensursache (SF-04)</label>
          <select value={schadensursache} onChange={e => setSchadensursache(e.target.value)} className={selectCls}>
            <option value="">Bitte waehlen</option>
            {SF04_URSACHEN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      <div className="flex flex-wrap gap-4">
        <Checkbox label="Personenschaden vorhanden? (Zusatz)" checked={personenschaden} onChange={setPersonenschaden} />
        <Checkbox label="Mietwagen gewuenscht?" checked={mietwagen} onChange={setMietwagen} />
      </div>

      <button
        onClick={onAdvance}
        disabled={saving || !sf}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-5 py-2.5 transition-colors"
      >
        {saving ? 'Speichert...' : 'Schadentyp bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 3: Konstellation ──────────────────────────────────────────────────

function StepKonstellation({
  kk, setKk,
  leasingGeber, setLeasingGeber,
  finanzierungBank, setFinanzierungBank,
  firmaName, setFirmaName, firmaUstid, setFirmaUstid,
  halterName, setHalterName,
  saving, onAdvance,
}: {
  kk: string; setKk: (v: string) => void
  leasingGeber: string; setLeasingGeber: (v: string) => void
  finanzierungBank: string; setFinanzierungBank: (v: string) => void
  firmaName: string; setFirmaName: (v: string) => void
  firmaUstid: string; setFirmaUstid: (v: string) => void
  halterName: string; setHalterName: (v: string) => void
  saving: boolean; onAdvance: () => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Kunden-Konstellation *</label>
        <select value={kk} onChange={e => setKk(e.target.value)} className={selectCls}>
          {KK_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {kk === 'kk-02' && (
        <fieldset className="border border-gray-300 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-cyan-400 font-medium px-2">Leasing-Daten</legend>
          <Input label="Leasinggeber" value={leasingGeber} onChange={setLeasingGeber} />
        </fieldset>
      )}
      {kk === 'kk-03' && (
        <fieldset className="border border-gray-300 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-cyan-400 font-medium px-2">Finanzierungs-Daten</legend>
          <Input label="Bank" value={finanzierungBank} onChange={setFinanzierungBank} />
        </fieldset>
      )}
      {kk === 'kk-04' && (
        <fieldset className="border border-gray-300 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-cyan-400 font-medium px-2">Firmen-Daten</legend>
          <Input label="Firmenname" value={firmaName} onChange={setFirmaName} />
          <Input label="USt-IdNr" value={firmaUstid} onChange={setFirmaUstid} />
        </fieldset>
      )}
      {kk === 'kk-05' && (
        <fieldset className="border border-gray-300 rounded-xl p-3 space-y-2">
          <legend className="text-xs text-cyan-400 font-medium px-2">Halter-Daten (SA vom Halter!)</legend>
          <Input label="Name Halter" value={halterName} onChange={setHalterName} />
        </fieldset>
      )}

      <button
        onClick={onAdvance}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-5 py-2.5 transition-colors"
      >
        {saving ? 'Speichert...' : 'Konstellation bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 4: Gegner-Daten ───────────────────────────────────────────────────

function StepGegner({
  gegnerName, setGegnerName,
  gegnerVersicherung, setGegnerVersicherung,
  gegnerKennzeichen, setGegnerKennzeichen,
  saving, onAdvance,
}: {
  gegnerName: string; setGegnerName: (v: string) => void
  gegnerVersicherung: string; setGegnerVersicherung: (v: string) => void
  gegnerKennzeichen: string; setGegnerKennzeichen: (v: string) => void
  saving: boolean; onAdvance: () => void
}) {
  return (
    <div className="space-y-3">
      <Input label="Name Gegner" value={gegnerName} onChange={setGegnerName} />
      <Input label="Versicherung Gegner" value={gegnerVersicherung} onChange={setGegnerVersicherung} />
      <Input label="Kennzeichen Gegner" value={gegnerKennzeichen} onChange={setGegnerKennzeichen} />

      <button
        onClick={onAdvance}
        disabled={saving}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-5 py-2.5 transition-colors"
      >
        {saving ? 'Speichert...' : 'Gegner-Daten bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 5: Gutachtertermin ────────────────────────────────────────────────

function StepGutachterTermin({
  lead,
  saving: parentSaving,
  onAdvance,
}: {
  lead: LeadData
  saving: boolean
  onAdvance: (svId: string, termin: string, plz: string, adresse: string) => void
}) {
  const [plz, setPlz] = useState(lead.fahrzeug_standort_plz ?? '')
  const [adresse, setAdresse] = useState(lead.fahrzeug_standort_adresse ?? '')
  const [wunschtermin, setWunschtermin] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<MatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (lead.gutachter_termin) {
    return (
      <div className="flex items-center gap-3">
        <CheckCircle2Icon className="w-4 h-4 text-green-400" />
        <div>
          <p className="text-green-400 text-sm">Termin bestaetigt</p>
          <p className="text-gray-500 text-xs">
            {new Date(lead.gutachter_termin).toLocaleString('de-DE', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    )
  }

  async function handleSearch() {
    if (!plz || !wunschtermin) return
    setSearching(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/gutachter-matching', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plz,
          wunschtermin: new Date(wunschtermin).toISOString(),
          schadenfall_typ: lead.schadenfall_typ,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Suche fehlgeschlagen')
      }
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSearching(false)
    }
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-100 text-zinc-100 placeholder-zinc-500 text-sm focus:outline-none focus:border-zinc-500 transition-colors'

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <MapPinIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input type="text" value={plz} onChange={e => setPlz(e.target.value)} placeholder="PLZ" className={`${inputCls} pl-9`} />
        </div>
        <input type="text" value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse (optional)" className={inputCls} />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">Wunschtermin</label>
        <input type="datetime-local" value={wunschtermin} onChange={e => setWunschtermin(e.target.value)}
          min={new Date().toISOString().slice(0, 16)} className={`${inputCls} [color-scheme:dark]`} />
      </div>

      {error && <p className="text-sm text-red-400 rounded-xl bg-red-500/10 border border-red-900/50 px-3 py-2">{error}</p>}

      {!result && (
        <button
          onClick={handleSearch}
          disabled={searching || !plz || !wunschtermin || parentSaving}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center gap-2"
        >
          {searching ? (
            <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Suche Gutachter...</>
          ) : (
            <><SearchIcon className="w-4 h-4" />Verfuegbare Gutachter suchen</>
          )}
        </button>
      )}

      {result && (
        <div className="space-y-2">
          {[result.empfohlen, result.alternative_1, result.alternative_2].filter(Boolean).map((slot, i) => (
            <SlotCard
              key={slot!.sv_id + slot!.termin}
              slot={slot!}
              label={i === 0 ? 'Empfohlen' : `Alternative ${i}`}
              variant={i === 0 ? 'empfohlen' : 'alternative'}
              onConfirm={() => onAdvance(slot!.sv_id, slot!.termin, plz, adresse)}
              confirming={parentSaving}
            />
          ))}
          <button onClick={() => setResult(null)} className="w-full py-2 text-sm text-gray-500 hover:text-gray-800">
            Anderen Termin pruefen
          </button>
        </div>
      )}
    </div>
  )
}

function SlotCard({ slot, label, variant, onConfirm, confirming }: {
  slot: GutachterSlot; label: string; variant: 'empfohlen' | 'alternative'
  onConfirm: () => void; confirming: boolean
}) {
  const isEmpf = variant === 'empfohlen'
  return (
    <div className={`rounded-xl p-3 border ${isEmpf ? 'bg-green-50/30 border-green-800/50' : 'bg-blue-50/30 border-blue-800/50'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase ${isEmpf ? 'text-green-400' : 'text-blue-400'}`}>{label}</span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <UserCheckIcon className={`w-3.5 h-3.5 ${isEmpf ? 'text-green-400' : 'text-blue-400'}`} />
        <span className="text-gray-900 text-sm font-medium">{slot.name}</span>
        {slot.entfernung_km != null && (
          <span className="text-gray-500 text-[11px] flex items-center gap-1"><MapPinIcon className="w-3 h-3" />{slot.entfernung_km} km</span>
        )}
        <span className="text-gray-500 text-[11px] flex items-center gap-1"><ClockIcon className="w-3 h-3" />Auslastung {slot.auslastung}</span>
      </div>
      <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-gray-100/50">
        <CalendarIcon className="w-3 h-3 text-gray-500" />
        <span className="text-gray-800 text-sm">
          {new Date(slot.termin).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <button onClick={onConfirm} disabled={confirming}
        className={`w-full py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${isEmpf ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
      >
        {confirming ? 'Wird bestaetigt...' : 'Diesen Termin bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 6: SA unterschrieben ──────────────────────────────────────────────

function StepSA({ lead, saving, onAdvance }: {
  lead: LeadData; saving: boolean; onAdvance: (data: Record<string, unknown>) => void
}) {
  const [sa, setSa] = useState(lead.sa_unterschrieben)
  const [vollmacht, setVollmacht] = useState(lead.vollmacht_unterschrieben)
  const [mandatstyp, setMandatstyp] = useState(lead.mandatstyp ?? 'claimondo')

  // Auto-set kanzlei-claimondo for SF-05 (Personenschaden) or SF-02 (Teilschuld)
  const autoKanzlei = lead.schadenfall_typ === 'sf-05' || lead.schadenfall_typ === 'sf-02'

  if (lead.sa_unterschrieben && lead.vollmacht_unterschrieben) {
    return (
      <div className="space-y-2">
        <p className="text-emerald-400 text-sm">SA + Vollmacht erhalten</p>
        {lead.sa_datum && <p className="text-gray-500 text-xs">SA: {new Date(lead.sa_datum).toLocaleDateString('de-DE')}</p>}
        {lead.vollmacht_datum && <p className="text-gray-500 text-xs">Vollmacht: {new Date(lead.vollmacht_datum).toLocaleDateString('de-DE')}</p>}
        <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${mandatstyp === 'kanzlei-claimondo' ? 'bg-purple-50 text-purple-300' : 'bg-blue-50 text-blue-300'}`}>
          {mandatstyp === 'kanzlei-claimondo' ? 'Kanzlei + Claimondo' : 'Nur Claimondo'}
        </span>
      </div>
    )
  }

  const now = new Date().toISOString()

  return (
    <div className="space-y-3">
      <Checkbox label="Sicherungsabtretung (SA) erhalten" checked={sa} onChange={setSa} />
      <Checkbox label="Vollmacht erhalten" checked={vollmacht} onChange={setVollmacht} />

      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Mandatstyp</label>
        <select
          value={autoKanzlei ? 'kanzlei-claimondo' : mandatstyp}
          onChange={e => setMandatstyp(e.target.value)}
          disabled={autoKanzlei}
          className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
        >
          <option value="claimondo">Nur Claimondo</option>
          <option value="kanzlei-claimondo">Kanzlei + Claimondo</option>
        </select>
        {autoKanzlei && (
          <p className="text-amber-400 text-[11px] mt-1">
            Automatisch Kanzlei + Claimondo (bei {lead.schadenfall_typ === 'sf-05' ? 'Personenschaden' : 'Teilschuld'})
          </p>
        )}
      </div>

      <button
        onClick={() => onAdvance({
          sa_unterschrieben: sa,
          sa_datum: sa ? now : null,
          vollmacht_unterschrieben: vollmacht,
          vollmacht_datum: vollmacht ? now : null,
          mandatstyp: autoKanzlei ? 'kanzlei-claimondo' : mandatstyp,
        })}
        disabled={saving || !sa || !vollmacht}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-5 py-2.5 transition-colors"
      >
        {saving ? 'Speichert...' : 'SA + Vollmacht bestaetigen'}
      </button>
    </div>
  )
}

// ─── Step 7: FlowLink ───────────────────────────────────────────────────────

function StepFlowLink({ lead }: { lead: LeadData }) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [flowUrl, setFlowUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const alreadySent = lead.wa_gesendet || lead.status === 'flow-gesendet'
  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || ''

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const { token } = await sendFlowLink(lead.id)
      const url = `${window.location.origin}/flow/${token}`
      setFlowUrl(url)
      const phone = (lead.telefon ?? '').replace(/[^0-9+]/g, '')
      const msg = `Hallo ${name}, hier ist Ihr Link zur Schadensaufnahme: ${url}. Ihr Claimondo-Team`
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler')
    } finally {
      setSending(false)
    }
  }

  if (alreadySent && !flowUrl) {
    return <p className="text-green-400 text-sm">WhatsApp bereits gesendet</p>
  }

  if (flowUrl) {
    return (
      <div className="space-y-2">
        <p className="text-green-400 text-sm font-medium">Link erstellt & WhatsApp geoeffnet</p>
        <div className="flex items-stretch gap-2">
          <input type="text" readOnly value={flowUrl} className="flex-1 px-3 py-2 rounded-xl bg-gray-100 border border-gray-300 text-sm text-gray-800 font-mono truncate" />
          <button
            onClick={async () => { await navigator.clipboard.writeText(flowUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="px-3 py-2 rounded-xl text-sm bg-gray-100 border border-gray-300 text-gray-800 hover:bg-gray-200 shrink-0"
          >
            {copied ? 'Kopiert!' : 'Kopieren'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {!lead.telefon && <p className="text-yellow-400 text-sm mb-3">Keine Telefonnummer hinterlegt.</p>}
      <button
        onClick={handleSend}
        disabled={sending || !lead.telefon}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 bg-green-600 hover:bg-green-500 text-white flex items-center justify-center gap-2"
      >
        <SendIcon className="w-4 h-4" />
        {sending ? 'Wird erstellt...' : 'Flow-Link senden via WhatsApp'}
      </button>
    </div>
  )
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

const selectCls = 'w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500'

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500" />
    </div>
  )
}

function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-gray-500' : 'text-gray-700 cursor-pointer'}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="accent-blue-500 rounded" />
      {label}
    </label>
  )
}
