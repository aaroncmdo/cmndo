'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { updateGutachterProfil, reactivateGutachter, deleteGutachter } from './actions'
import SvKalenderModal from './SvKalenderModal'
import {
  XIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  CheckIcon,
  CalendarIcon,
  PowerOffIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  Trash2Icon,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SV {
  id: string
  name: string
  email: string
  telefon?: string
  gebietPlz: string[]
  radiusKm: number
  paket: string
  offeneFaelle: number
  maxFaelleMonat: number
  standortLat: number | null
  standortLng: number | null
  organisationId: string | null
  gutachterTyp: string
  standortAdresse?: string | null
  guthaben?: number
  qualifikationen?: string[]
  // KFZ-154
  spezifikationen?: string[]
  schadenarten?: string[]
  anzahlungStatus?: string
  istAktiv?: boolean
  deaktiviertAm?: string | null
  deaktiviertGrund?: string | null
}

const TYP_COLORS: Record<string, { marker: string; label: string }> = {
  'kfz-gutachter': { marker: 'bg-[#4573A2]', label: 'KFZ-Gutachter' },
  'dat-gutachter': { marker: 'bg-orange-500', label: 'DAT-Gutachter' },
  akademie: { marker: 'bg-green-500', label: 'Akademie' },
  gutachterbuero: { marker: 'bg-purple-500', label: 'Gutachterbuero' },
}

const PAKET_LABELS: Record<string, string> = {
  'starter-10': 'Standard', standard: 'Standard',
  'standard-25': 'Pro', pro: 'Pro',
  'premium-50': 'Premium', premium: 'Premium',
}

const ALL_QUALIFIKATIONEN = [
  'Haftpflichtschaden', 'Kaskoschaden', 'Leasingrueckgabe', 'Flottenmanagement',
  'Oldtimer', 'LKW/Nutzfahrzeuge', 'Motorrad', 'Wohnmobil',
  'Totalschaden-Bewertung', 'Wiederbeschaffungswert', 'Beweissicherung', 'Gerichtsgutachten',
]

function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// ─── Editable Field ─────────────────────────────────────────────────────────

function EditableField({
  label,
  value,
  svId,
  field,
  type = 'text',
  linkPrefix,
}: {
  label: string
  value: string
  svId: string
  field: string
  type?: string
  linkPrefix?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  async function handleSave() {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    try {
      await updateGutachterProfil(svId, field, val || null)
      setEditing(false)
    } catch { /* keep editing */ }
    setSaving(false)
  }

  if (editing) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type={type}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={handleSave}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setVal(value); setEditing(false) } }}
            disabled={saving}
            className="flex-1 bg-gray-100 border border-[#1E3A5F] text-gray-800 text-sm rounded-lg px-2 py-1.5 focus:outline-none"
          />
          <button onClick={handleSave} disabled={saving} className="p-1 text-[#7BA3CC] hover:text-[#7BA3CC]">
            <CheckIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="flex items-center gap-2 group">
        {linkPrefix && val ? (
          <a href={`${linkPrefix}${val}`} className="text-sm text-[#7BA3CC] hover:text-[#7BA3CC] truncate">{val}</a>
        ) : (
          <span className="text-sm text-gray-700 truncate">{val || '\u2014'}</span>
        )}
        <button
          onClick={() => setEditing(true)}
          className="p-1 text-gray-400 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <PencilIcon className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function GutachterProfilPanel({
  sv,
  onClose,
}: {
  sv: SV
  onClose: () => void
}) {
  const [editingQual, setEditingQual] = useState(false)
  const [quals, setQuals] = useState<string[]>(sv.qualifikationen ?? [])
  const [savingQual, setSavingQual] = useState(false)
  const [notiz, setNotiz] = useState('')
  const [savingNotiz, setSavingNotiz] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [showKalender, setShowKalender] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const typColor = TYP_COLORS[sv.gutachterTyp]
  const auslastungPct = sv.maxFaelleMonat > 0 ? Math.round((sv.offeneFaelle / sv.maxFaelleMonat) * 100) : 0

  async function handleQualSave() {
    setSavingQual(true)
    try {
      await updateGutachterProfil(sv.id, 'qualifikationen', quals)
      setEditingQual(false)
    } catch { /* */ }
    setSavingQual(false)
  }

  async function handleNotizSave() {
    setSavingNotiz(true)
    try {
      await updateGutachterProfil(sv.id, 'notizen', notiz || null)
    } catch { /* */ }
    setSavingNotiz(false)
  }

  const isDeactivated = sv.istAktiv === false

  async function handleDeactivate() {
    if (!confirm('Gutachter wirklich deaktivieren? Er erhält keine neuen Aufträge mehr.')) return
    setDeactivating(true)
    try {
      await updateGutachterProfil(sv.id, 'ist_aktiv', false)
      onClose()
    } catch { /* */ }
    setDeactivating(false)
  }

  async function handleReactivate() {
    setDeactivating(true)
    try {
      await reactivateGutachter(sv.id)
      onClose()
    } catch { /* */ }
    setDeactivating(false)
  }

  return (
    <div className="fixed top-0 right-0 h-screen w-[400px] z-50 backdrop-blur-xl bg-white/95 border-l border-gray-300/50 shadow-2xl shadow-black/40 overflow-y-auto">
      {/* Roter Deaktiviert-Banner */}
      {isDeactivated && (
        <div className="bg-red-500 text-white px-4 py-3 flex items-center gap-2">
          <AlertTriangleIcon className="w-4 h-4 shrink-0" />
          <div className="text-xs font-medium">
            <p className="font-bold">DEAKTIVIERT</p>
            <p className="opacity-90">
              {sv.deaktiviertAm ? `seit ${new Date(sv.deaktiviertAm).toLocaleDateString('de-DE')}` : ''}
              {sv.deaktiviertGrund ? ` — Grund: ${sv.deaktiviertGrund}` : ''}
            </p>
          </div>
        </div>
      )}
      <div className={`p-6 ${isDeactivated ? 'opacity-60' : ''}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${isDeactivated ? 'bg-gray-400' : (typColor?.marker ?? 'bg-[#4573A2]')}`}>
              {getInitials(sv.name || '??')}
            </div>
            <div>
              <h2 className={`text-xl font-bold leading-tight ${isDeactivated ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{sv.name || 'Unbekannt'}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${typColor?.marker ?? 'bg-[#4573A2]'}`}>
                  {typColor?.label ?? sv.gutachterTyp ?? '\u2014'}
                </span>
                {isDeactivated ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/20 text-red-500">
                    Deaktiviert
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                    Aktiv
                  </span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Kontaktdaten */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Kontakt</h3>
            <div className="space-y-2.5">
              <EditableField label="Telefon" value={sv.telefon ?? ''} svId={sv.id} field="telefon" type="tel" linkPrefix="tel:" />
              <EditableField label="E-Mail" value={sv.email ?? ''} svId={sv.id} field="email" type="email" linkPrefix="mailto:" />
            </div>
          </section>

          {/* Standort */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Standort</h3>
            <div className="flex items-start gap-2">
              <MapPinIcon className="w-4 h-4 text-gray-500 mt-0.5 shrink-0" />
              <p className="text-sm text-gray-700">{sv.standortAdresse ?? '\u2014'}</p>
            </div>
            {sv.standortLat != null && sv.standortLng != null && (
              <p className="text-[10px] text-gray-400 mt-1 ml-6">{sv.standortLat.toFixed(4)}, {sv.standortLng.toFixed(4)}</p>
            )}
          </section>

          {/* Paket + Auslastung */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Paket & Auslastung</h3>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="bg-gray-100/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{PAKET_LABELS[sv.paket] ?? sv.paket ?? '\u2014'}</p>
                <p className="text-[10px] text-gray-500">Paket</p>
              </div>
              <div className="bg-gray-100/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{sv.radiusKm}</p>
                <p className="text-[10px] text-gray-500">km Radius</p>
              </div>
              <div className="bg-gray-100/50 rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-gray-900">{sv.guthaben != null ? `${sv.guthaben}\u20AC` : '\u2014'}</p>
                <p className="text-[10px] text-gray-500">Guthaben</p>
              </div>
            </div>

            {/* Auslastung Bar */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Faelle</span>
                <span className="text-xs text-gray-700 tabular-nums">{sv.offeneFaelle}/{sv.maxFaelleMonat} ({auslastungPct}%)</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${auslastungPct >= 90 ? 'bg-red-500' : auslastungPct >= 70 ? 'bg-amber-500' : 'bg-[#4573A2]'}`}
                  style={{ width: `${Math.min(100, auslastungPct)}%` }}
                />
              </div>
            </div>

            {/* Anzahlung */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Anzahlung</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                sv.anzahlungStatus === 'bezahlt' ? 'bg-emerald-500/20 text-emerald-400' :
                sv.anzahlungStatus === 'teilweise' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {sv.anzahlungStatus === 'bezahlt' ? 'Bezahlt' : sv.anzahlungStatus === 'teilweise' ? 'Teilweise' : 'Offen'}
              </span>
            </div>
          </section>

          {/* Qualifikationen */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Qualifikationen</h3>
              <button
                onClick={() => editingQual ? handleQualSave() : setEditingQual(true)}
                disabled={savingQual}
                className="text-[10px] text-[#7BA3CC] hover:text-[#7BA3CC] font-medium"
              >
                {savingQual ? 'Speichert...' : editingQual ? 'Speichern' : 'Bearbeiten'}
              </button>
            </div>

            {editingQual ? (
              <div className="grid grid-cols-2 gap-1.5">
                {ALL_QUALIFIKATIONEN.map(q => (
                  <label key={q} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quals.includes(q)}
                      onChange={e => setQuals(prev => e.target.checked ? [...prev, q] : prev.filter(x => x !== q))}
                      className="accent-[#4573A2] w-3.5 h-3.5 rounded"
                    />
                    {q}
                  </label>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {(sv.qualifikationen ?? []).length > 0 ? (
                  (sv.qualifikationen ?? []).map(q => (
                    <span key={q} className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full">{q}</span>
                  ))
                ) : (
                  <span className="text-gray-400 text-xs">Keine Qualifikationen</span>
                )}
              </div>
            )}
          </section>

          {/* KFZ-154: Spezifikationen + Schadenarten Read-Only Display */}
          {(sv.spezifikationen?.length || sv.schadenarten?.length) ? (
            <section>
              {sv.spezifikationen && sv.spezifikationen.length > 0 && (
                <div className="mb-3">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Spezifikationen</h3>
                  <div className="flex flex-wrap gap-1">
                    {sv.spezifikationen.map(s => (
                      <span key={s} className="bg-[#4573A2]/10 text-[#4573A2] text-[10px] px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {sv.schadenarten && sv.schadenarten.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Schadenarten</h3>
                  <div className="flex flex-wrap gap-1">
                    {sv.schadenarten.map(s => (
                      <span key={s} className="bg-amber-50 text-amber-700 text-[10px] px-2 py-0.5 rounded-full">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {/* Notizen */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Admin-Notizen</h3>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              onBlur={handleNotizSave}
              placeholder="Interne Notizen..."
              rows={2}
              className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2] placeholder-gray-400 resize-y"
            />
          </section>

          {/* Aktionen */}
          <section className="border-t border-gray-200 pt-4 space-y-2">
            <button
              onClick={() => setShowKalender(true)}
              className="w-full flex items-center justify-center gap-2 bg-[#4573A2]/10 hover:bg-[#4573A2]/20 text-[#4573A2] text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              <CalendarIcon className="w-4 h-4" /> Kalender
            </button>
            <div className="flex gap-2">
              {sv.telefon && (
                <a href={`tel:${sv.telefon}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  <PhoneIcon className="w-3.5 h-3.5" /> Anrufen
                </a>
              )}
              {sv.email && (
                <a href={`mailto:${sv.email}`} className="flex-1 flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-900 text-sm font-medium py-2.5 rounded-xl transition-colors">
                  <MailIcon className="w-3.5 h-3.5" /> E-Mail
                </a>
              )}
            </div>
            <Link
              href={`/admin/sachverstaendige/${sv.id}`}
              className="block text-center bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              Vollstaendiges Profil
            </Link>
            {isDeactivated ? (
              <>
                <button
                  onClick={handleReactivate}
                  disabled={deactivating}
                  className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  <RefreshCwIcon className="w-3.5 h-3.5" />
                  {deactivating ? 'Wird reaktiviert...' : 'Reaktivieren'}
                </button>
                <button
                  onClick={() => { setShowDeleteModal(true); setDeleteError('') }}
                  className="w-full flex items-center justify-center gap-2 text-red-500 hover:bg-red-50 text-sm py-2 rounded-xl border border-red-200 transition-colors"
                >
                  <Trash2Icon className="w-3.5 h-3.5" />
                  Endgültig löschen
                </button>
              </>
            ) : (
              <button
                onClick={handleDeactivate}
                disabled={deactivating}
                className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 text-sm py-2 transition-colors disabled:opacity-50"
              >
                <PowerOffIcon className="w-3.5 h-3.5" />
                {deactivating ? 'Wird deaktiviert...' : 'Deaktivieren'}
              </button>
            )}
          </section>
        </div>
      </div>

      {/* Kalender-Modal */}
      {showKalender && <SvKalenderModal svId={sv.id} svName={sv.name} onClose={() => setShowKalender(false)} />}

      {/* KFZ-122: Löschen Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold text-red-600 mb-2">Gutachter endgültig löschen?</h3>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-sm text-red-700">
              <p className="font-medium mb-1">UNWIDERRUFLICH!</p>
              <p>Alle Daten, Termine und Abrechnungen werden entfernt. Zugewiesene Fälle werden freigegeben.</p>
            </div>
            <p className="text-sm text-gray-700 mb-1"><strong>{sv.name}</strong></p>
            <p className="text-sm text-gray-500 mb-4">{sv.email}</p>
            {deleteError && <p className="text-sm text-red-500 mb-3">{deleteError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200">Abbrechen</button>
              <button disabled={deleting} onClick={async () => {
                setDeleting(true); setDeleteError('')
                const result = await deleteGutachter(sv.id)
                if (result.success) { onClose() }
                else { setDeleteError(result.error ?? 'Fehler'); setDeleting(false) }
              }} className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:opacity-40">
                {deleting ? 'Löscht...' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

