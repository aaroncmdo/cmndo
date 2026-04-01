'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, SaveIcon, UserIcon, BarChart3Icon, BriefcaseIcon, ClockIcon } from 'lucide-react'
import { updateMitarbeiter } from '../actions'

type Perf = { monat: string; jahr: number; leads_qualifiziert: number; leads_konvertiert: number; faelle_abgeschlossen: number; aktive_faelle: number; umsatz_generiert: number }

export default function MitarbeiterDetail({ mitarbeiter, stats, performanceHistory }: {
  mitarbeiter: Record<string, unknown>
  stats: { leadsTotal: number; leadsKonvertiert: number; aktiveFaelle: number; abgeschlossen: number; avgDays: number; isDispatch: boolean }
  performanceHistory: Perf[]
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const m = mitarbeiter

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setMsg(null)
    try {
      await updateMitarbeiter(new FormData(e.currentTarget))
      setMsg('Gespeichert'); router.refresh()
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Fehler') }
    finally { setSaving(false) }
  }

  const name = [m.vorname, m.nachname].filter(Boolean).join(' ') || '—'

  return (
    <div className="px-4 py-8"><div className="max-w-4xl mx-auto">
      <Link href="/admin/team" className="text-gray-500 hover:text-gray-700 text-sm transition-colors flex items-center gap-1 mb-4"><ArrowLeftIcon className="w-4 h-4" />Zurueck</Link>

      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center"><UserIcon className="w-7 h-7 text-gray-500" /></div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{name}</h1>
          <p className="text-gray-500 text-sm">{m.email as string} · {m.rolle as string}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {stats.isDispatch ? (<>
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-amber-400" />} label="Leads" value={stats.leadsTotal} />
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-green-400" />} label="Konvertiert" value={stats.leadsKonvertiert} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-[#7BA3CC]" />} label="Conv. Rate" value={stats.leadsTotal > 0 ? `${Math.round((stats.leadsKonvertiert / stats.leadsTotal) * 100)}%` : '—'} />
        </>) : (<>
          <KPI icon={<BriefcaseIcon className="w-4 h-4 text-[#7BA3CC]" />} label="Aktive Faelle" value={stats.aktiveFaelle} />
          <KPI icon={<BarChart3Icon className="w-4 h-4 text-green-400" />} label="Abgeschlossen" value={stats.abgeschlossen} />
          <KPI icon={<ClockIcon className="w-4 h-4 text-amber-400" />} label="Avg. Tage" value={stats.avgDays || '—'} />
        </>)}
        <KPI icon={<BriefcaseIcon className="w-4 h-4 text-violet-400" />} label="Kapazitaet" value={`${stats.aktiveFaelle}/${(m.kapazitaet_max as number) ?? 100}`} />
      </div>

      {/* Performance History */}
      {performanceHistory.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">Performance-Verlauf</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 text-gray-500 font-medium">Monat</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">Leads</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">Konvertiert</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">Abgeschl.</th>
                <th className="text-right px-3 py-2 text-gray-500 font-medium">Umsatz</th>
              </tr></thead>
              <tbody>
                {performanceHistory.map(p => (
                  <tr key={`${p.monat}-${p.jahr}`} className="border-b border-gray-200/50">
                    <td className="px-3 py-2 text-gray-700">{p.monat} {p.jahr}</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{p.leads_qualifiziert}</td>
                    <td className="px-3 py-2 text-right text-green-400 tabular-nums">{p.leads_konvertiert}</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{p.faelle_abgeschlossen}</td>
                    <td className="px-3 py-2 text-right text-gray-700 tabular-nums">{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(p.umsatz_generiert ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-4">Profil bearbeiten</h3>
        <form onSubmit={handleSave} className="space-y-3">
          <input type="hidden" name="id" value={m.id as string} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vorname" name="vorname" defaultValue={(m.vorname as string) ?? ''} />
            <Field label="Nachname" name="nachname" defaultValue={(m.nachname as string) ?? ''} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Telefon" name="telefon" defaultValue={(m.telefon as string) ?? ''} />
            <Field label="Position" name="position" defaultValue={(m.position as string) ?? ''} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Kategorie</label>
              <select name="kategorie" defaultValue={(m.kategorie as string) ?? ''} className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                <option value="">—</option><option value="dispatch">Dispatch</option><option value="kundenbetreuer">Kundenbetreuer</option><option value="admin">Admin</option><option value="entwicklung">Entwicklung</option>
              </select>
            </div>
            <Field label="Gehaltsstufe" name="gehaltsstufe" defaultValue={(m.gehaltsstufe as string) ?? ''} />
            <Field label="Gehalt brutto" name="gehalt_brutto" type="number" defaultValue={String((m.gehalt_brutto as number) ?? '')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kapazitaet max" name="kapazitaet_max" type="number" defaultValue={String((m.kapazitaet_max as number) ?? 100)} />
            <Field label="Eingestellt am" name="eingestellt_am" type="date" defaultValue={(m.eingestellt_am as string) ?? ''} />
            <div>
              <label className="text-sm text-gray-500 mb-1 block">Aktiv</label>
              <select name="aktiv" defaultValue={String(m.aktiv ?? true)} className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]">
                <option value="true">Ja</option><option value="false">Nein</option>
              </select>
            </div>
          </div>
          {msg && <p className={`text-sm px-4 py-2 rounded-xl ${msg === 'Gespeichert' ? 'bg-green-50 text-green-300' : 'bg-red-50 text-red-300'}`}>{msg}</p>}
          <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] disabled:bg-zinc-700 text-gray-900 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <SaveIcon className="w-4 h-4" />{saving ? 'Speichere...' : 'Speichern'}
          </button>
        </form>
      </div>
    </div></div>
  )
}

function KPI({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-gray-500 text-xs">{label}</span></div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function Field({ label, name, defaultValue, type = 'text' }: { label: string; name: string; defaultValue: string; type?: string }) {
  return (
    <div>
      <label className="text-sm text-gray-500 mb-1 block">{label}</label>
      <input name={name} type={type} defaultValue={defaultValue} step={type === 'number' ? 'any' : undefined} className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
    </div>
  )
}
