'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadQualifizierung } from './actions'
import { PencilIcon, CheckIcon, XIcon, Loader2Icon } from 'lucide-react'

/* ── Inline Text Field ────────────────────────────────────────────────── */

function InlineText({
  leadId, field, value, label, mono,
}: {
  leadId: string; field: string; value: string | null; label: string; mono?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = useCallback(async () => {
    const newVal = draft.trim() || null
    if (newVal === (value ?? null)) { setEditing(false); return }
    setSaving(true)
    try {
      await saveLeadQualifizierung(leadId, { [field]: newVal })
      router.refresh()
      setEditing(false)
    } catch { /* keep editing */ }
    setSaving(false)
  }, [draft, value, leadId, field, router])

  if (editing) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <div className="flex items-center gap-1">
          <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
            className={`flex-1 text-sm text-gray-800 border border-[#4573A2]/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#4573A2] ${mono ? 'font-mono' : ''}`}
            disabled={saving} />
          <button onClick={save} disabled={saving} className="text-emerald-600 hover:text-emerald-500 p-1 rounded disabled:opacity-50">
            {saving ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <CheckIcon className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setDraft(value ?? ''); setEditing(false) }} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group cursor-pointer" onClick={() => { setDraft(value ?? ''); setEditing(true) }}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        <p className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
        <PencilIcon className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

/* ── Inline Select Field ──────────────────────────────────────────────── */

function InlineSelect({
  leadId, field, value, label, options,
}: {
  leadId: string; field: string; value: string | null; label: string
  options: { value: string; label: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const save = useCallback(async (newVal: string) => {
    const v = newVal || null
    if (v === (value ?? null)) { setEditing(false); return }
    setSaving(true)
    try {
      await saveLeadQualifizierung(leadId, { [field]: v })
      router.refresh()
      setEditing(false)
    } catch { /* keep editing */ }
    setSaving(false)
  }, [value, leadId, field, router])

  const displayLabel = options.find(o => o.value === value)?.label ?? value ?? '—'

  if (editing) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <div className="flex items-center gap-1">
          <select value={value ?? ''} onChange={e => save(e.target.value)} disabled={saving}
            className="flex-1 text-sm text-gray-800 border border-[#4573A2]/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#4573A2]">
            <option value="">—</option>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {saving && <Loader2Icon className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 p-1 rounded">
            <XIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="group cursor-pointer" onClick={() => setEditing(true)}>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="flex items-center gap-1">
        <p className="text-sm text-gray-800">{displayLabel}</p>
        <PencilIcon className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}

/* ── Inline Toggle Field ──────────────────────────────────────────────── */

function InlineToggle({
  leadId, field, value, label,
}: {
  leadId: string; field: string; value: boolean | null; label: string
}) {
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const toggle = useCallback(async () => {
    setSaving(true)
    try {
      await saveLeadQualifizierung(leadId, { [field]: !value })
      router.refresh()
    } catch { /* ignore */ }
    setSaving(false)
  }, [value, leadId, field, router])

  return (
    <div className="flex items-center justify-between cursor-pointer group" onClick={toggle}>
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-center gap-1.5">
        {saving ? (
          <Loader2Icon className="w-3.5 h-3.5 animate-spin text-gray-400" />
        ) : (
          <div className={`w-8 h-4.5 rounded-full flex items-center transition-colors ${value ? 'bg-emerald-500 justify-end' : 'bg-gray-200 justify-start'}`}>
            <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm mx-0.5" />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Source Channel Options ────────────────────────────────────────────── */
const SOURCE_OPTIONS = [
  { value: 'telefon', label: 'Telefon' },
  { value: 'website', label: 'Website' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-Mail' },
  { value: 'empfehlung', label: 'Empfehlung' },
  { value: 'google-ads', label: 'Google Ads' },
]

const SF_OPTIONS = [
  { value: 'sf-01', label: 'SF-01 Unfall mit Gegner' },
  { value: 'sf-02', label: 'SF-02 Teilschuld' },
  { value: 'sf-03', label: 'SF-03 Parkschaden' },
  { value: 'sf-04', label: 'SF-04 Eigenverschulden' },
  { value: 'sf-05', label: 'SF-05 Personenschaden' },
]

const KK_OPTIONS = [
  { value: 'kk-01', label: 'KK-01 Standard' },
  { value: 'kk-02', label: 'KK-02 Leasing' },
  { value: 'kk-03', label: 'KK-03 Finanzierung' },
  { value: 'kk-04', label: 'KK-04 Gewerbe' },
  { value: 'kk-05', label: 'KK-05 Halter ≠ Fahrer' },
]

/* ── Main Component ───────────────────────────────────────────────────── */

export default function LeadInlineFields({ lead }: {
  lead: {
    id: string
    vorname: string | null; nachname: string | null
    telefon: string | null; email: string | null
    source_channel: string | null; source_domain: string | null
    schadenfall_typ: string | null; kunden_konstellation: string | null
    gegner_name: string | null; gegner_versicherung: string | null; gegner_kennzeichen: string | null
    gegner_bekannt: boolean | null
    eigene_versicherung: string | null; eigene_policennr: string | null
    polizei_aktenzeichen: string | null
    personenschaden_flag: boolean | null; mietwagen_flag: boolean | null; leasing_flag: boolean | null
    finanzierung_flag: boolean | null; gewerbe_flag: boolean | null
    halter_ungleich_fahrer_flag: boolean | null
    kennzeichen: string | null; fahrzeug_hersteller: string | null; fahrzeug_modell: string | null
    kontaktversuche: number | null; verpasste_anrufe: number | null
    firma_name: string | null; halter_name: string | null
    leasing_geber: string | null; finanzierung_bank: string | null
  }
}) {
  const id = lead.id

  return (
    <div className="space-y-5">
      {/* Stammdaten */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Stammdaten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineText leadId={id} field="vorname" value={lead.vorname} label="Vorname" />
          <InlineText leadId={id} field="nachname" value={lead.nachname} label="Nachname" />
          <InlineText leadId={id} field="telefon" value={lead.telefon} label="Telefon" mono />
          <InlineText leadId={id} field="email" value={lead.email} label="E-Mail" />
          <InlineSelect leadId={id} field="source_channel" value={lead.source_channel} label="Quelle" options={SOURCE_OPTIONS} />
          <InlineText leadId={id} field="source_domain" value={lead.source_domain} label="Domain" />
        </div>
      </div>

      {/* Schadenfall */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Schadenfall</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineSelect leadId={id} field="schadenfall_typ" value={lead.schadenfall_typ} label="Schadenfall-Typ" options={SF_OPTIONS} />
          <InlineSelect leadId={id} field="kunden_konstellation" value={lead.kunden_konstellation} label="Kunden-Konstellation" options={KK_OPTIONS} />
          <InlineText leadId={id} field="kennzeichen" value={lead.kennzeichen} label="Kennzeichen" mono />
          <InlineText leadId={id} field="fahrzeug_hersteller" value={lead.fahrzeug_hersteller} label="Hersteller" />
          <InlineText leadId={id} field="fahrzeug_modell" value={lead.fahrzeug_modell} label="Modell" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
          <InlineToggle leadId={id} field="personenschaden_flag" value={lead.personenschaden_flag} label="Personenschaden" />
          <InlineToggle leadId={id} field="mietwagen_flag" value={lead.mietwagen_flag} label="Mietwagen" />
          <InlineToggle leadId={id} field="leasing_flag" value={lead.leasing_flag} label="Leasing" />
          <InlineToggle leadId={id} field="finanzierung_flag" value={lead.finanzierung_flag} label="Finanzierung" />
          <InlineToggle leadId={id} field="gewerbe_flag" value={lead.gewerbe_flag} label="Gewerbe" />
          <InlineToggle leadId={id} field="halter_ungleich_fahrer_flag" value={lead.halter_ungleich_fahrer_flag} label="Halter ≠ Fahrer" />
        </div>
      </div>

      {/* Gegner */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <h2 className="text-sm font-medium text-gray-500 mb-4">Gegner-Daten</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineText leadId={id} field="gegner_name" value={lead.gegner_name} label="Gegner Name" />
          <InlineText leadId={id} field="gegner_versicherung" value={lead.gegner_versicherung} label="Gegner Versicherung" />
          <InlineText leadId={id} field="gegner_kennzeichen" value={lead.gegner_kennzeichen} label="Gegner Kennzeichen" mono />
          <InlineText leadId={id} field="eigene_versicherung" value={lead.eigene_versicherung} label="Eigene Versicherung" />
          <InlineText leadId={id} field="eigene_policennr" value={lead.eigene_policennr} label="Policennr." mono />
          <InlineText leadId={id} field="polizei_aktenzeichen" value={lead.polizei_aktenzeichen} label="Polizei-AZ" mono />
        </div>
      </div>

      {/* Sonderfälle */}
      {(lead.leasing_flag || lead.finanzierung_flag || lead.gewerbe_flag || lead.halter_ungleich_fahrer_flag) && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Sonderfälle</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {lead.leasing_flag && <InlineText leadId={id} field="leasing_geber" value={lead.leasing_geber} label="Leasinggeber" />}
            {lead.finanzierung_flag && <InlineText leadId={id} field="finanzierung_bank" value={lead.finanzierung_bank} label="Finanzierungs-Bank" />}
            {lead.gewerbe_flag && <InlineText leadId={id} field="firma_name" value={lead.firma_name} label="Firma" />}
            {lead.halter_ungleich_fahrer_flag && <InlineText leadId={id} field="halter_name" value={lead.halter_name} label="Haltername" />}
          </div>
        </div>
      )}
    </div>
  )
}
