'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadQualifizierung } from './actions'

// ─── Schadentypen ───────────────────────────────────────────────────────────

const SF_OPTIONS = [
  { value: 'sf-01', label: 'SF-01 Unverschuldeter Kfz-Unfall (Haftpflicht Gegner)', pct: '~60%' },
  { value: 'sf-02', label: 'SF-02 Teilschuld-Unfall', pct: '~10%' },
  { value: 'sf-03', label: 'SF-03 Parkschaden / Fahrerflucht', pct: '~8%' },
  { value: 'sf-04', label: 'SF-04 Kaskoschaden ohne Gegner', pct: '~7%' },
  { value: 'sf-05', label: 'SF-05 Personenschaden (Zusatz)', pct: '~10%' },
  { value: 'sf-06', label: 'SF-06 Nutzungsausfall / Mietwagen (Flag)', pct: '' },
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

const PHASE_LABELS: Record<string, string> = {
  neu: 'Neu',
  erstkontakt: 'Erstkontakt',
  'schadentyp-erfasst': 'Schadentyp erfasst',
  'konstellation-erfasst': 'Konstellation erfasst',
  'gegner-daten': 'Gegner-Daten',
  gutachtertermin: 'Gutachtertermin',
  'sa-unterschrieben': 'SA unterschrieben',
  'flow-gesendet': 'Flow gesendet',
  abgeschlossen: 'Abgeschlossen',
}

const PHASES = Object.keys(PHASE_LABELS)

type LeadData = {
  id: string
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
}

export default function LeadQualifizierung({ lead }: { lead: LeadData }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [sf, setSf] = useState(lead.schadenfall_typ ?? '')
  const [kk, setKk] = useState(lead.kunden_konstellation ?? 'kk-01')
  const [phase, setPhase] = useState(lead.qualifizierungs_phase ?? 'neu')

  // SF-specific fields
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

  // KK-specific fields
  const [leasingGeber, setLeasingGeber] = useState(lead.leasing_geber ?? '')
  const [finanzierungBank, setFinanzierungBank] = useState(lead.finanzierung_bank ?? '')
  const [firmaName, setFirmaName] = useState(lead.firma_name ?? '')
  const [firmaUstid, setFirmaUstid] = useState(lead.firma_ustid ?? '')
  const [halterName, setHalterName] = useState(lead.halter_name ?? '')

  // Derive which gegner fields are needed
  const needsGegner = sf === 'sf-01' || sf === 'sf-02' || (sf === 'sf-03' && sfVariante === 'a')
  const needsEigeneVers = sf === 'sf-02' || (sf === 'sf-03' && sfVariante === 'b') || sf === 'sf-04'
  const needsPolizei = sf === 'sf-02' || sf === 'sf-03'
  const needsUrsache = sf === 'sf-04'

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      await saveLeadQualifizierung(lead.id, {
        schadenfall_typ: sf || null,
        kunden_konstellation: kk || null,
        qualifizierungs_phase: phase,
        sf_variante: sf === 'sf-03' ? sfVariante || null : null,
        gegner_name: needsGegner ? gegnerName || null : null,
        gegner_versicherung: needsGegner ? gegnerVersicherung || null : null,
        gegner_kennzeichen: needsGegner ? gegnerKennzeichen || null : null,
        gegner_bekannt: sf === 'sf-03' ? sfVariante === 'a' : sf === 'sf-01' || sf === 'sf-02',
        eigene_versicherung: needsEigeneVers ? eigeneVersicherung || null : null,
        eigene_policennr: needsEigeneVers ? eigenePolicennr || null : null,
        polizei_aktenzeichen: needsPolizei ? polizeiAktenzeichen || null : null,
        polizeibericht_pflicht: polizeibericht,
        personenschaden_flag: personenschaden || sf === 'sf-05',
        mietwagen_flag: mietwagen || sf === 'sf-06',
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
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch {
      // error handled by UI
    }
    setSaving(false)
  }

  const currentIdx = PHASES.indexOf(phase)

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5 space-y-5">
      <h2 className="text-sm font-medium text-gray-500">Lead-Qualifizierung</h2>

      {/* ─── Phase Progress ───────────────────────────────────────── */}
      <div>
        <label className="text-xs text-gray-500 mb-2 block">Qualifizierungs-Phase</label>
        <div className="flex flex-wrap gap-1.5">
          {PHASES.map((p, i) => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                p === phase
                  ? 'bg-[#1E3A5F] border-[#4573A2] text-gray-900 font-medium'
                  : i < currentIdx
                    ? 'bg-emerald-50 border-emerald-800 text-emerald-400'
                    : 'bg-gray-100 border-gray-300 text-gray-500 hover:border-gray-300'
              }`}
            >
              {PHASE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Schadentyp ───────────────────────────────────────────── */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Schadentyp *</label>
        <select
          value={sf}
          onChange={e => setSf(e.target.value)}
          className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
        >
          <option value="">— Bitte wählen —</option>
          {SF_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label} {o.pct}
            </option>
          ))}
        </select>
      </div>

      {/* SF-03: Variante A/B */}
      {sf === 'sf-03' && (
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">SF-03 Variante</label>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio" name="sf03var" value="a" checked={sfVariante === 'a'}
                onChange={() => setSfVariante('a')}
                className="accent-[#4573A2]"
              />
              A — Gegner bekannt
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio" name="sf03var" value="b" checked={sfVariante === 'b'}
                onChange={() => setSfVariante('b')}
                className="accent-[#4573A2]"
              />
              B — Fahrerflucht
            </label>
          </div>
        </div>
      )}

      {/* ─── Gegner-Daten (SF-01, SF-02, SF-03A) ─────────────────── */}
      {needsGegner && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-amber-400 font-medium px-2">Gegnerische Daten (Pflicht)</legend>
          <Input label="Name Gegner" value={gegnerName} onChange={setGegnerName} />
          <Input label="Versicherung Gegner" value={gegnerVersicherung} onChange={setGegnerVersicherung} />
          <Input label="Kennzeichen Gegner" value={gegnerKennzeichen} onChange={setGegnerKennzeichen} />
        </fieldset>
      )}

      {/* ─── Eigene Versicherung (SF-02, SF-03B, SF-04) ──────────── */}
      {needsEigeneVers && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-amber-400 font-medium px-2">Eigene Versicherung (Pflicht)</legend>
          <Input label="Versicherung" value={eigeneVersicherung} onChange={setEigeneVersicherung} />
          <Input label="Policennummer" value={eigenePolicennr} onChange={setEigenePolicennr} />
        </fieldset>
      )}

      {/* ─── Polizei (SF-02, SF-03) ──────────────────────────────── */}
      {needsPolizei && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-orange-400 font-medium px-2">Polizei {sf === 'sf-02' ? '(Pflicht)' : ''}</legend>
          <Input label="Aktenzeichen" value={polizeiAktenzeichen} onChange={setPolizeiAktenzeichen} />
          <Checkbox label="Polizeibericht vorhanden" checked={polizeibericht} onChange={setPolizeibericht} />
        </fieldset>
      )}

      {/* ─── SF-04: Schadensursache ──────────────────────────────── */}
      {needsUrsache && (
        <div>
          <label className="text-xs text-gray-500 mb-1.5 block">Schadensursache (SF-04)</label>
          <select
            value={schadensursache}
            onChange={e => setSchadensursache(e.target.value)}
            className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
          >
            <option value="">— Bitte wählen —</option>
            {SF04_URSACHEN.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* ─── Flags: SF-05 / SF-06 ────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <Checkbox
          label="Personenschaden (SF-05)"
          checked={personenschaden || sf === 'sf-05'}
          onChange={setPersonenschaden}
          disabled={sf === 'sf-05'}
        />
        <Checkbox
          label="Mietwagen-Bedarf (SF-06)"
          checked={mietwagen || sf === 'sf-06'}
          onChange={setMietwagen}
          disabled={sf === 'sf-06'}
        />
      </div>

      {/* ─── Kunden-Konstellation ─────────────────────────────────── */}
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Kunden-Konstellation *</label>
        <select
          value={kk}
          onChange={e => setKk(e.target.value)}
          className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
        >
          {KK_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* ─── KK-02: Leasing ──────────────────────────────────────── */}
      {kk === 'kk-02' && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-cyan-400 font-medium px-2">Leasing-Daten</legend>
          <Input label="Leasinggeber" value={leasingGeber} onChange={setLeasingGeber} />
        </fieldset>
      )}

      {/* ─── KK-03: Finanzierung ─────────────────────────────────── */}
      {kk === 'kk-03' && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-cyan-400 font-medium px-2">Finanzierungs-Daten</legend>
          <Input label="Bank" value={finanzierungBank} onChange={setFinanzierungBank} />
        </fieldset>
      )}

      {/* ─── KK-04: Firma ────────────────────────────────────────── */}
      {kk === 'kk-04' && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-cyan-400 font-medium px-2">Firmen-Daten</legend>
          <Input label="Firmenname" value={firmaName} onChange={setFirmaName} />
          <Input label="USt-IdNr" value={firmaUstid} onChange={setFirmaUstid} />
        </fieldset>
      )}

      {/* ─── KK-05: Halter ───────────────────────────────────────── */}
      {kk === 'kk-05' && (
        <fieldset className="border border-gray-200 rounded-xl p-4 space-y-3">
          <legend className="text-xs text-cyan-400 font-medium px-2">Halter-Daten (SA vom Halter!)</legend>
          <Input label="Name Halter" value={halterName} onChange={setHalterName} />
        </fieldset>
      )}

      {/* ─── Save ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-5 py-2.5 transition-colors"
        >
          {saving ? 'Speichert ...' : 'Qualifizierung speichern'}
        </button>
        {saved && <span className="text-emerald-400 text-xs">Gespeichert</span>}
      </div>
    </div>
  )
}

// ─── Small form helpers ─────────────────────────────────────────────────────

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
      />
    </div>
  )
}

function Checkbox({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 text-sm ${disabled ? 'text-gray-500' : 'text-gray-700 cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="accent-[#4573A2] rounded"
      />
      {label}
    </label>
  )
}
