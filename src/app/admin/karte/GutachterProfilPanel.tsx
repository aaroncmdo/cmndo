'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { updateGutachterProfil } from './actions'
import { createClient } from '@/lib/supabase/client'
import {
  XIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  CheckIcon,
  CalendarIcon,
  StarIcon,
  PowerOffIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  PlusIcon,
  WrenchIcon,
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
  anzahlungStatus?: string
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

  async function handleDeactivate() {
    if (!confirm('Gutachter wirklich deaktivieren? Er erhaelt keine neuen Auftraege mehr.')) return
    setDeactivating(true)
    try {
      await updateGutachterProfil(sv.id, 'ist_aktiv', false)
      onClose()
    } catch { /* */ }
    setDeactivating(false)
  }

  return (
    <div className="fixed top-0 right-0 h-screen w-[400px] z-50 backdrop-blur-xl bg-white/95 border-l border-gray-300/50 shadow-2xl shadow-black/40 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm ${typColor?.marker ?? 'bg-[#4573A2]'}`}>
              {getInitials(sv.name || '??')}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 leading-tight">{sv.name || 'Unbekannt'}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-white ${typColor?.marker ?? 'bg-[#4573A2]'}`}>
                  {typColor?.label ?? sv.gutachterTyp ?? '\u2014'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400">
                  Aktiv
                </span>
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

          {/* SV-Kalender */}
          <SvKalenderSection svId={sv.id} />

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
            <button
              onClick={handleDeactivate}
              disabled={deactivating}
              className="w-full flex items-center justify-center gap-2 text-red-400 hover:text-red-300 text-sm py-2 transition-colors disabled:opacity-50"
            >
              <PowerOffIcon className="w-3.5 h-3.5" />
              {deactivating ? 'Wird deaktiviert...' : 'Deaktivieren'}
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── SV-Kalender Section ────────────────────────────────────────────────────

const HOUR_START = 8
const HOUR_END = 18
const SLOT_H = 28
const TOTAL_SLOTS = (HOUR_END - HOUR_START) * 2
const TOTAL_H = TOTAL_SLOTS * SLOT_H

type Appointment = { id: string; start: Date; end: Date; label: string; fallId: string | null }

function SvKalenderSection({ svId }: { svId: string }) {
  const [date, setDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingSlot, setBookingSlot] = useState<number | null>(null)
  const [bookingFallId, setBookingFallId] = useState('')
  const [booking, setBooking] = useState(false)
  const [unassignedFaelle, setUnassignedFaelle] = useState<{ id: string; fallNr: string; kunde: string }[]>([])

  const isToday = date.toDateString() === new Date().toDateString()
  const nowMinute = new Date().getHours() * 60 + new Date().getMinutes()

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const ds = new Date(date); ds.setHours(0, 0, 0, 0)
    const de = new Date(date); de.setHours(23, 59, 59, 999)

    const [gtRes, fallRes, unassRes] = await Promise.all([
      supabase.from('gutachter_termine').select('id, start_zeit, end_zeit, status, fall_id')
        .eq('sv_id', svId).gte('start_zeit', ds.toISOString()).lte('start_zeit', de.toISOString())
        .not('status', 'eq', 'storniert'),
      supabase.from('faelle').select('id, fall_nummer, sv_termin, lead_id, leads(vorname, nachname)')
        .eq('sv_id', svId).not('sv_termin', 'is', null)
        .gte('sv_termin', ds.toISOString()).lte('sv_termin', de.toISOString()),
      supabase.from('faelle').select('id, fall_nummer, lead_id, leads(vorname, nachname)')
        .is('sv_id', null).not('status', 'in', '("abgeschlossen","storniert")')
        .order('created_at', { ascending: false }).limit(15),
    ])

    const appts: Appointment[] = []
    const seenFallIds = new Set<string>()

    for (const t of gtRes.data ?? []) {
      appts.push({ id: t.id, start: new Date(t.start_zeit), end: new Date(t.end_zeit), label: `Termin ${t.status}`, fallId: t.fall_id })
      if (t.fall_id) seenFallIds.add(t.fall_id)
    }
    for (const f of fallRes.data ?? []) {
      if (seenFallIds.has(f.id)) continue
      const leadRaw = f.leads as unknown
      const lead = (Array.isArray(leadRaw) ? leadRaw[0] : leadRaw) as { vorname: string | null; nachname: string | null } | null
      const kunde = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : ''
      const start = new Date(f.sv_termin!)
      appts.push({ id: f.id, start, end: new Date(start.getTime() + 120 * 60000), label: kunde || f.fall_nummer || 'Termin', fallId: f.id })
    }

    appts.sort((a, b) => a.start.getTime() - b.start.getTime())
    setAppointments(appts)
    setUnassignedFaelle((unassRes.data ?? []).map(f => {
      const lr = f.leads as unknown
      const l = (Array.isArray(lr) ? lr[0] : lr) as { vorname: string | null; nachname: string | null } | null
      return { id: f.id, fallNr: f.fall_nummer ?? f.id.slice(0, 8), kunde: l ? `${l.vorname ?? ''} ${l.nachname ?? ''}`.trim() : '—' }
    }))
    setLoading(false)
  }, [svId, date])

  useEffect(() => { loadData() }, [loadData])

  function minuteToY(min: number) {
    return Math.max(0, Math.min(TOTAL_H, ((min - HOUR_START * 60) / (TOTAL_SLOTS * 30)) * TOTAL_H))
  }

  function handleSlotClick(halfHourIdx: number) {
    const min = HOUR_START * 60 + halfHourIdx * 30
    const slotStart = new Date(date); slotStart.setHours(Math.floor(min / 60), min % 60, 0, 0)
    const slotEnd = new Date(slotStart.getTime() + 120 * 60000)
    const conflict = appointments.some(a => a.start < slotEnd && a.end > slotStart)
    if (!conflict) setBookingSlot(min)
  }

  async function handleBook() {
    if (bookingSlot === null || !bookingFallId) return
    setBooking(true)
    const supabase = createClient()
    const startDate = new Date(date)
    startDate.setHours(Math.floor(bookingSlot / 60), bookingSlot % 60, 0, 0)
    const endDate = new Date(startDate.getTime() + 120 * 60000)

    await supabase.from('gutachter_termine').insert({
      sv_id: svId, fall_id: bookingFallId,
      start_zeit: startDate.toISOString(), end_zeit: endDate.toISOString(), status: 'bestaetigt',
    })
    await supabase.from('faelle').update({
      sv_id: svId, sv_termin: startDate.toISOString(), sv_zugewiesen_am: new Date().toISOString(),
      status: 'sv-termin', updated_at: new Date().toISOString(),
    }).eq('id', bookingFallId)

    setBookingSlot(null); setBookingFallId(''); setBooking(false)
    loadData()
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
          <CalendarIcon className="w-3.5 h-3.5" /> Kalender
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(d => new Date(d.getTime() - 86400000))} className="text-gray-400 hover:text-gray-600 p-0.5"><ChevronLeftIcon className="w-3.5 h-3.5" /></button>
          <button onClick={() => { const d = new Date(); d.setHours(0,0,0,0); setDate(d) }}
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${isToday ? 'text-[#4573A2] bg-[#4573A2]/10' : 'text-gray-500 hover:bg-gray-100'}`}>
            {isToday ? 'Heute' : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
          </button>
          <button onClick={() => setDate(d => new Date(d.getTime() + 86400000))} className="text-gray-400 hover:text-gray-600 p-0.5"><ChevronRightIcon className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><div className="w-4 h-4 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" /></div>
      ) : (
        <div className="relative border border-gray-200 rounded-xl overflow-y-auto" style={{ maxHeight: 300 }}>
          <div className="relative" style={{ height: TOTAL_H }}>
            {/* Hour lines */}
            {Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => (
              <div key={i} className="absolute left-0 right-0 flex items-start" style={{ top: i * SLOT_H * 2 }}>
                <span className="text-[8px] text-gray-400 w-8 text-right pr-1 -mt-1 select-none">{String(HOUR_START + i).padStart(2, '0')}:00</span>
                <div className="flex-1 border-t border-gray-100" />
              </div>
            ))}

            {/* Clickable free slots */}
            {Array.from({ length: TOTAL_SLOTS }, (_, i) => {
              const min = HOUR_START * 60 + i * 30
              const slotStart = new Date(date); slotStart.setHours(Math.floor(min / 60), min % 60, 0, 0)
              const slotEnd = new Date(slotStart.getTime() + 120 * 60000)
              const conflict = appointments.some(a => a.start < slotEnd && a.end > slotStart)
              if (conflict) return null
              return (
                <div key={`slot-${i}`} className="absolute left-8 right-0 cursor-pointer hover:bg-green-50 transition-colors group"
                  style={{ top: i * SLOT_H, height: SLOT_H }} onClick={() => handleSlotClick(i)}>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center justify-center h-full">
                    <span className="text-[8px] text-green-600 flex items-center gap-0.5"><PlusIcon className="w-2.5 h-2.5" />Buchen</span>
                  </div>
                </div>
              )
            })}

            {/* Appointment blocks */}
            {appointments.map(appt => {
              const startMin = appt.start.getHours() * 60 + appt.start.getMinutes()
              const endMin = appt.end.getHours() * 60 + appt.end.getMinutes()
              const top = minuteToY(startMin)
              const height = Math.max(SLOT_H, minuteToY(endMin) - top)
              return (
                <Link key={appt.id} href={appt.fallId ? `/admin/faelle/${appt.fallId}` : '#'}
                  className="absolute left-8 right-1 bg-[#4573A2]/10 border-l-2 border-[#4573A2] rounded-r-lg z-10 overflow-hidden hover:bg-[#4573A2]/20 transition-colors"
                  style={{ top, height }}>
                  <div className="px-1.5 py-0.5">
                    <div className="flex items-center gap-1">
                      <WrenchIcon className="w-2.5 h-2.5 text-[#4573A2] shrink-0" />
                      <span className="text-[9px] font-medium text-[#4573A2] tabular-nums">
                        {String(appt.start.getHours()).padStart(2, '0')}:{String(appt.start.getMinutes()).padStart(2, '0')}
                      </span>
                    </div>
                    {height > 24 && <p className="text-[8px] text-gray-600 truncate pl-3.5">{appt.label}</p>}
                  </div>
                </Link>
              )
            })}

            {/* Red time arrow */}
            {isToday && nowMinute >= HOUR_START * 60 && nowMinute <= HOUR_END * 60 && (
              <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: minuteToY(nowMinute) }}>
                <div className="w-8" />
                <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-red-500 -ml-0.5" />
                <div className="flex-1 h-px bg-red-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Booking dialog */}
      {bookingSlot !== null && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-xl">
          <p className="text-[10px] text-green-700 font-medium mb-1.5">
            Termin: {String(Math.floor(bookingSlot / 60)).padStart(2, '0')}:{String(bookingSlot % 60).padStart(2, '0')} Uhr (2h)
          </p>
          <select value={bookingFallId} onChange={e => setBookingFallId(e.target.value)}
            className="w-full text-xs bg-white border border-green-300 rounded-lg px-2 py-1.5 mb-1.5 focus:outline-none focus:ring-1 focus:ring-green-500">
            <option value="">Fall auswählen...</option>
            {unassignedFaelle.map(f => <option key={f.id} value={f.id}>{f.fallNr} — {f.kunde}</option>)}
          </select>
          <div className="flex gap-1.5">
            <button onClick={handleBook} disabled={booking || !bookingFallId}
              className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-[10px] font-medium py-1.5 rounded-lg transition-colors">
              {booking ? 'Bucht...' : 'Bestätigen'}
            </button>
            <button onClick={() => { setBookingSlot(null); setBookingFallId('') }}
              className="text-gray-500 text-[10px] px-2 py-1.5">Abbrechen</button>
          </div>
        </div>
      )}

      <p className="text-[9px] text-gray-400 mt-1">{appointments.length} Termine · {date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })}</p>
    </section>
  )
}
