'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { saveLeadQualifizierung } from './actions'
import { useRouter } from 'next/navigation'
import { UserIcon, HomeIcon, BuildingIcon, CarIcon, AlertTriangleIcon, ShieldIcon, InfoIcon, FileTextIcon, SendIcon } from 'lucide-react'

type MandantData = {
  ist_fahrzeughalter: boolean
  finanzierung_leasing: string
  vorsteuerabzugsberechtigt: boolean
  hat_vorschaeden: boolean
  vorname: string; nachname: string; telefon: string; email: string
  kunde_strasse: string; kunde_plz: string; kunde_stadt: string
  halter_vorname: string; halter_nachname: string
  halter_strasse: string; halter_plz: string; halter_stadt: string
  halter_telefon: string; halter_email: string
  finanzierungsgeber_name: string; finanzierungsgeber_adresse: string; finanzierungsgeber_vertragsnr: string
  kennzeichen: string; fahrzeug_hersteller: string; fahrzeug_modell: string
  fin: string; erstzulassung: string
  unfalldatum: string; unfallort: string; schadenhergang: string
  schadenhoehe_netto: string
  gegner_versicherung: string; versicherung_schaden_nr: string
  service_typ: string
}

type Props = {
  leadId: string
  initialData: Partial<MandantData>
  activeStep: 1 | 2 | 3 | 4
  onStepComplete: (step: number) => void
  onFlowLink?: () => void
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="text-[10px] text-red-500 mt-0.5">{error}</p>}
    </div>
  )
}

function Toggle({ value, onChange, labelYes, labelNo }: { value: boolean; onChange: (v: boolean) => void; labelYes?: string; labelNo?: string }) {
  return (
    <div className="flex gap-2">
      <button type="button" onClick={() => onChange(true)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${value ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{labelYes ?? 'Ja'}</button>
      <button type="button" onClick={() => onChange(false)} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${!value ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{labelNo ?? 'Nein'}</button>
    </div>
  )
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-2 mb-3 pt-1">
      <Icon className="w-4 h-4 text-[#4573A2] mt-0.5 shrink-0" />
      <div>
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {subtitle && <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

const inputCls = (err?: string) => `w-full px-3 py-2 border rounded-lg text-sm transition-colors ${err ? 'border-red-300 bg-red-50/30' : 'border-gray-200'}`

export default function MandantenfragebogenStep({ leadId, initialData, activeStep, onStepComplete, onFlowLink }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const formRef = useRef<HTMLDivElement>(null)

  const d = initialData
  const [istFahrzeughalter, setIstFahrzeughalter] = useState(d.ist_fahrzeughalter ?? true)
  const [finLeasing, setFinLeasing] = useState(d.finanzierung_leasing ?? 'keine')
  const [vst, setVst] = useState(d.vorsteuerabzugsberechtigt ?? false)
  const [hatVorschaeden, setHatVorschaeden] = useState(d.hat_vorschaeden ?? false)

  const [vorname, setVorname] = useState(d.vorname ?? '')
  const [nachname, setNachname] = useState(d.nachname ?? '')
  const [telefon, setTelefon] = useState(d.telefon ?? '')
  const [email, setEmail] = useState(d.email ?? '')
  const [kundeStrasse, setKundeStrasse] = useState(d.kunde_strasse ?? '')
  const [kundePlz, setKundePlz] = useState(d.kunde_plz ?? '')
  const [kundeStadt, setKundeStadt] = useState(d.kunde_stadt ?? '')

  const [hVorname, setHVorname] = useState(d.halter_vorname ?? '')
  const [hNachname, setHNachname] = useState(d.halter_nachname ?? '')
  const [hStrasse, setHStrasse] = useState(d.halter_strasse ?? '')
  const [hPlz, setHPlz] = useState(d.halter_plz ?? '')
  const [hStadt, setHStadt] = useState(d.halter_stadt ?? '')
  const [hTelefon, setHTelefon] = useState(d.halter_telefon ?? '')
  const [hEmail, setHEmail] = useState(d.halter_email ?? '')

  const [fgName, setFgName] = useState(d.finanzierungsgeber_name ?? '')
  const [fgAdresse, setFgAdresse] = useState(d.finanzierungsgeber_adresse ?? '')
  const [fgVertragsnr, setFgVertragsnr] = useState(d.finanzierungsgeber_vertragsnr ?? '')

  const [kennzeichen, setKennzeichen] = useState(d.kennzeichen ?? '')
  const [hersteller, setHersteller] = useState(d.fahrzeug_hersteller ?? '')
  const [modell, setModell] = useState(d.fahrzeug_modell ?? '')
  const [finNr, setFinNr] = useState(d.fin ?? '')
  const [ez, setEz] = useState(d.erstzulassung ?? '')

  const [unfalldatum, setUnfalldatum] = useState(d.unfalldatum ?? '')
  const [unfallort, setUnfallort] = useState(d.unfallort ?? '')
  const [schadenhergang, setSchadenhergang] = useState(d.schadenhergang ?? '')
  const [schadenhoehe, setSchadenhoehe] = useState(d.schadenhoehe_netto ?? '')
  const [gegnerVs, setGegnerVs] = useState(d.gegner_versicherung ?? '')
  const [vsSchadenNr, setVsSchadenNr] = useState(d.versicherung_schaden_nr ?? '')

  const [serviceTyp, setServiceTyp] = useState(d.service_typ ?? 'komplett')

  const showHalter = !istFahrzeughalter
  const showFinanzierung = finLeasing !== 'keine'

  // Autosave debounced
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const buildData = useCallback(() => ({
    ist_fahrzeughalter: istFahrzeughalter, finanzierung_leasing: finLeasing,
    vorsteuerabzugsberechtigt: vst, hat_vorschaeden: hatVorschaeden,
    vorname: vorname || null, nachname: nachname || null,
    telefon: telefon || null, email: email || null,
    kunde_strasse: kundeStrasse || null, kunde_plz: kundePlz || null, kunde_stadt: kundeStadt || null,
    halter_vorname: !istFahrzeughalter ? hVorname || null : null,
    halter_nachname: !istFahrzeughalter ? hNachname || null : null,
    halter_strasse: !istFahrzeughalter ? hStrasse || null : null,
    halter_plz: !istFahrzeughalter ? hPlz || null : null,
    halter_stadt: !istFahrzeughalter ? hStadt || null : null,
    halter_telefon: !istFahrzeughalter ? hTelefon || null : null,
    halter_email: !istFahrzeughalter ? hEmail || null : null,
    finanzierungsgeber_name: finLeasing !== 'keine' ? fgName || null : null,
    finanzierungsgeber_adresse: finLeasing !== 'keine' ? fgAdresse || null : null,
    finanzierungsgeber_vertragsnr: finLeasing !== 'keine' ? fgVertragsnr || null : null,
    kennzeichen: kennzeichen || null, fahrzeug_hersteller: hersteller || null, fahrzeug_modell: modell || null,
    fin: finNr || null, erstzulassung: ez || null,
    unfalldatum: unfalldatum || null, unfallort: unfallort || null, schadenhergang: schadenhergang || null,
    schadenhoehe_netto: schadenhoehe ? Number(schadenhoehe) : null,
    gegner_versicherung: gegnerVs || null, versicherung_schaden_nr: vsSchadenNr || null,
    service_typ: serviceTyp,
  }), [istFahrzeughalter, finLeasing, vst, hatVorschaeden, vorname, nachname, telefon, email, kundeStrasse, kundePlz, kundeStadt, hVorname, hNachname, hStrasse, hPlz, hStadt, hTelefon, hEmail, fgName, fgAdresse, fgVertragsnr, kennzeichen, hersteller, modell, finNr, ez, unfalldatum, unfallort, schadenhergang, schadenhoehe, gegnerVs, vsSchadenNr, serviceTyp])

  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveLeadQualifizierung(leadId, buildData()).catch(() => {})
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [leadId, buildData])

  function validateStep(step: number): boolean {
    const e: Record<string, string> = {}
    if (step === 1) {
      if (!vorname) e.vorname = 'Pflichtfeld'
      if (!nachname) e.nachname = 'Pflichtfeld'
      if (!telefon) e.telefon = 'Pflichtfeld'
      if (!email) e.email = 'Pflichtfeld'
      if (!kundeStrasse) e.kunde_strasse = 'Pflichtfeld'
      if (!kundePlz || kundePlz.length !== 5) e.kunde_plz = '5 Zeichen'
      if (!kundeStadt) e.kunde_stadt = 'Pflichtfeld'
      if (showHalter) {
        if (!hVorname) e.halter_vorname = 'Pflichtfeld'
        if (!hNachname) e.halter_nachname = 'Pflichtfeld'
        if (!hStrasse) e.halter_strasse = 'Pflichtfeld'
        if (!hPlz) e.halter_plz = 'Pflichtfeld'
        if (!hStadt) e.halter_stadt = 'Pflichtfeld'
      }
    }
    if (step === 2) {
      if (!unfalldatum) e.unfalldatum = 'Pflichtfeld'
      if (!unfallort) e.unfallort = 'Pflichtfeld'
      if (!schadenhergang || schadenhergang.length < 50) e.schadenhergang = 'Min. 50 Zeichen'
      if (!schadenhoehe) e.schadenhoehe = 'Pflichtfeld'
      if (!gegnerVs) e.gegner_vs = 'Pflichtfeld'
      if (!vsSchadenNr) e.vs_schaden_nr = 'Pflichtfeld'
    }
    if (step === 3) {
      if (!hersteller) e.hersteller = 'Pflichtfeld'
      if (!modell) e.modell = 'Pflichtfeld'
      if (!kennzeichen) e.kennzeichen = 'Pflichtfeld'
      if (!ez) e.ez = 'Pflichtfeld'
      if (showFinanzierung && !fgName) e.fg_name = 'Pflichtfeld'
    }
    setErrors(e)
    if (Object.keys(e).length > 0) {
      const el = formRef.current?.querySelector(`[data-field="${Object.keys(e)[0]}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return false
    }
    return true
  }

  async function handleWeiter() {
    if (!validateStep(activeStep)) return
    setSaving(true)
    try {
      const phase = activeStep === 1 ? 'in-qualifizierung' : activeStep === 2 ? 'schadentyp-erfasst' : activeStep === 3 ? 'konstellation-erfasst' : 'flow-gesendet'
      await saveLeadQualifizierung(leadId, { ...buildData(), qualifizierungs_phase: phase })
      router.refresh()
      onStepComplete(activeStep)
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <div ref={formRef} className="space-y-6 max-h-[65vh] overflow-y-auto pr-1">

      {/* ═══ STEP 1: Schadenkonstellation + Kontaktdaten ═══ */}
      {activeStep === 1 && (<>
        <div className="space-y-3">
          <SectionHeader icon={AlertTriangleIcon} title="Schadenkonstellation" subtitle="Diese Angaben bestimmen welche Daten wir erfassen müssen" />
          <Field label="Ist der Kunde der Fahrzeughalter?" required>
            <Toggle value={istFahrzeughalter} onChange={setIstFahrzeughalter} />
          </Field>
          <Field label="Vorsteuerabzugsberechtigt?" required>
            <Toggle value={vst} onChange={setVst} />
            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1"><InfoIcon className="w-3 h-3" /> Gewerbliche Fahrzeugnutzung = vorsteuerabzugsberechtigt</p>
          </Field>
          <Field label="Gab es Vorschäden am Fahrzeug?" required>
            <Toggle value={hatVorschaeden} onChange={setHatVorschaeden} />
          </Field>
        </div>

        <div className="space-y-3">
          <SectionHeader icon={UserIcon} title="Kontaktdaten des Kunden" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vorname" required error={errors.vorname}><input data-field="vorname" value={vorname} onChange={e => setVorname(e.target.value)} className={inputCls(errors.vorname)} /></Field>
            <Field label="Nachname" required error={errors.nachname}><input data-field="nachname" value={nachname} onChange={e => setNachname(e.target.value)} className={inputCls(errors.nachname)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon" required error={errors.telefon}><input data-field="telefon" value={telefon} onChange={e => setTelefon(e.target.value)} className={inputCls(errors.telefon)} /></Field>
            <Field label="E-Mail" required error={errors.email}><input data-field="email" type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls(errors.email)} /></Field>
          </div>
          <Field label="Straße + Hausnr" required error={errors.kunde_strasse}><input data-field="kunde_strasse" value={kundeStrasse} onChange={e => setKundeStrasse(e.target.value)} className={inputCls(errors.kunde_strasse)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="PLZ" required error={errors.kunde_plz}><input data-field="kunde_plz" value={kundePlz} onChange={e => setKundePlz(e.target.value)} maxLength={5} className={inputCls(errors.kunde_plz)} /></Field>
            <div className="col-span-2"><Field label="Stadt" required error={errors.kunde_stadt}><input data-field="kunde_stadt" value={kundeStadt} onChange={e => setKundeStadt(e.target.value)} className={inputCls(errors.kunde_stadt)} /></Field></div>
          </div>
        </div>

        {showHalter && (
          <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
            <SectionHeader icon={UserIcon} title="Kontaktdaten des Fahrzeughalters" subtitle="Der Kunde ist nicht der Halter — bitte Halterdaten angeben" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Halter Vorname" required error={errors.halter_vorname}><input data-field="halter_vorname" value={hVorname} onChange={e => setHVorname(e.target.value)} className={inputCls(errors.halter_vorname)} /></Field>
              <Field label="Halter Nachname" required error={errors.halter_nachname}><input data-field="halter_nachname" value={hNachname} onChange={e => setHNachname(e.target.value)} className={inputCls(errors.halter_nachname)} /></Field>
            </div>
            <Field label="Straße + Hausnr" required error={errors.halter_strasse}><input data-field="halter_strasse" value={hStrasse} onChange={e => setHStrasse(e.target.value)} className={inputCls(errors.halter_strasse)} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="PLZ" required error={errors.halter_plz}><input data-field="halter_plz" value={hPlz} onChange={e => setHPlz(e.target.value)} maxLength={5} className={inputCls(errors.halter_plz)} /></Field>
              <div className="col-span-2"><Field label="Stadt" required error={errors.halter_stadt}><input data-field="halter_stadt" value={hStadt} onChange={e => setHStadt(e.target.value)} className={inputCls(errors.halter_stadt)} /></Field></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Telefon"><input value={hTelefon} onChange={e => setHTelefon(e.target.value)} className={inputCls()} /></Field>
              <Field label="E-Mail"><input type="email" value={hEmail} onChange={e => setHEmail(e.target.value)} className={inputCls()} /></Field>
            </div>
          </div>
        )}
      </>)}

      {/* ═══ STEP 2: Unfalldetails ═══ */}
      {activeStep === 2 && (<>
        <div className="space-y-3">
          <SectionHeader icon={AlertTriangleIcon} title="Unfalldetails" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Schadendatum" required error={errors.unfalldatum}><input data-field="unfalldatum" type="date" value={unfalldatum} onChange={e => setUnfalldatum(e.target.value)} className={inputCls(errors.unfalldatum)} /></Field>
            <Field label="Schadenort" required error={errors.unfallort}><input data-field="unfallort" value={unfallort} onChange={e => setUnfallort(e.target.value)} className={inputCls(errors.unfallort)} /></Field>
          </div>
          <Field label="Schadenhergang" required error={errors.schadenhergang}>
            <textarea data-field="schadenhergang" value={schadenhergang} onChange={e => setSchadenhergang(e.target.value)} className={`${inputCls(errors.schadenhergang)} h-28 resize-none`} placeholder="Bitte beschreiben Sie WIE der Unfall passiert ist." />
            <p className="text-[10px] text-gray-400 mt-0.5">{schadenhergang.length}/50 Zeichen (min. 50)</p>
          </Field>
          <Field label="Geschätzte Schadenhöhe (EUR)" required error={errors.schadenhoehe}><input data-field="schadenhoehe" type="number" step="0.01" value={schadenhoehe} onChange={e => setSchadenhoehe(e.target.value)} placeholder="z.B. 3500" className={inputCls(errors.schadenhoehe)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="VS-Gegner" required error={errors.gegner_vs}><input data-field="gegner_vs" value={gegnerVs} onChange={e => setGegnerVs(e.target.value)} placeholder="z.B. Allianz" className={inputCls(errors.gegner_vs)} /></Field>
            <Field label="VS-Schadennummer" required error={errors.vs_schaden_nr}><input data-field="vs_schaden_nr" value={vsSchadenNr} onChange={e => setVsSchadenNr(e.target.value)} className={inputCls(errors.vs_schaden_nr)} /></Field>
          </div>
        </div>
      </>)}

      {/* ═══ STEP 3: Fahrzeugdaten ═══ */}
      {activeStep === 3 && (<>
        <div className="space-y-3">
          <SectionHeader icon={CarIcon} title="Fahrzeugdaten" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Hersteller / Marke" required error={errors.hersteller}><input data-field="hersteller" value={hersteller} onChange={e => setHersteller(e.target.value)} className={inputCls(errors.hersteller)} /></Field>
            <Field label="Modell" required error={errors.modell}><input data-field="modell" value={modell} onChange={e => setModell(e.target.value)} className={inputCls(errors.modell)} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kennzeichen" required error={errors.kennzeichen}><input data-field="kennzeichen" value={kennzeichen} onChange={e => setKennzeichen(e.target.value)} className={inputCls(errors.kennzeichen)} /></Field>
            <Field label="FIN (17 Zeichen)"><input value={finNr} onChange={e => setFinNr(e.target.value)} maxLength={17} className={inputCls()} /></Field>
            <Field label="Erstzulassung" required error={errors.ez}><input data-field="ez" type="date" value={ez} onChange={e => setEz(e.target.value)} className={inputCls(errors.ez)} /></Field>
          </div>
        </div>

        <div className="space-y-3">
          <SectionHeader icon={BuildingIcon} title="Finanzierung / Leasing" />
          <Field label="Finanzierung oder Leasing?" required>
            <select value={finLeasing} onChange={e => setFinLeasing(e.target.value)} className={inputCls()}>
              <option value="keine">Keine</option>
              <option value="finanzierung">Finanzierung</option>
              <option value="leasing">Leasing</option>
            </select>
          </Field>
        </div>

        {showFinanzierung && (
          <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
            <SectionHeader icon={BuildingIcon} title={finLeasing === 'leasing' ? 'Leasinggeber' : 'Finanzierungsgeber'} />
            <Field label="Name des Gebers" required error={errors.fg_name}><input data-field="fg_name" value={fgName} onChange={e => setFgName(e.target.value)} className={inputCls(errors.fg_name)} /></Field>
            <Field label="Adresse"><input value={fgAdresse} onChange={e => setFgAdresse(e.target.value)} className={inputCls()} /></Field>
            <Field label="Vertragsnummer"><input value={fgVertragsnr} onChange={e => setFgVertragsnr(e.target.value)} className={inputCls()} /></Field>
          </div>
        )}
      </>)}

      {/* ═══ STEP 4: Service-Typ + Zusammenfassung ═══ */}
      {activeStep === 4 && (<>
        <div className="space-y-3">
          <SectionHeader icon={ShieldIcon} title="Service-Typ" />
          <div className="flex gap-2">
            {(['komplett', 'nur_gutachter'] as const).map(typ => (
              <button key={typ} type="button" onClick={() => setServiceTyp(typ)} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${serviceTyp === typ ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {typ === 'komplett' ? 'Komplett (SA + Vollmacht)' : 'Nur Gutachter'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 bg-gray-50 rounded-xl p-4">
          <SectionHeader icon={FileTextIcon} title="Zusammenfassung" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <SummaryRow label="Mandant" value={`${vorname} ${nachname}`} />
            <SummaryRow label="Telefon" value={telefon} />
            <SummaryRow label="Adresse" value={`${kundeStrasse}, ${kundePlz} ${kundeStadt}`} />
            <SummaryRow label="Fahrzeughalter" value={istFahrzeughalter ? 'Ja' : `Nein (${hVorname} ${hNachname})`} />
            <SummaryRow label="Fahrzeug" value={`${hersteller} ${modell} (${kennzeichen})`} />
            <SummaryRow label="Schadendatum" value={unfalldatum} />
            <SummaryRow label="VS-Gegner" value={gegnerVs} />
            <SummaryRow label="Schadenhöhe" value={schadenhoehe ? `${schadenhoehe} EUR` : '—'} />
            {finLeasing !== 'keine' && <SummaryRow label="Finanzierung" value={`${finLeasing}: ${fgName}`} />}
          </div>
        </div>
      </>)}

      {/* ═══ Weiter-Button ═══ */}
      <div className="sticky bottom-0 bg-white pt-3 pb-1 border-t border-gray-100">
        <button
          disabled={saving}
          onClick={activeStep === 4 && onFlowLink ? onFlowLink : handleWeiter}
          className="w-full px-4 py-3 rounded-xl bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#3a6290] disabled:opacity-40 transition-colors"
        >
          {saving ? 'Speichern...' : activeStep === 4 ? 'FlowLink generieren & senden' : 'Weiter →'}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium">{value || '—'}</span>
    </>
  )
}
