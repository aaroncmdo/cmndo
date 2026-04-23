'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserPlusIcon, UsersIcon, ShieldCheckIcon, TrophyIcon, GiftIcon, ActivityIcon, AlertTriangleIcon, PowerIcon } from 'lucide-react'
import { createMitarbeiter, deactivateKbWithReassign } from './actions'
import PageHeader from '@/components/shared/PageHeader'

const ROLLE_LABELS: Record<string, string> = { admin: 'Admin', kundenbetreuer: 'Kundenbetreuer', leadbearbeiter: 'Leadbearbeiter', kanzlei: 'Kanzlei' }
const ROLLE_COLORS: Record<string, string> = { admin: 'bg-red-50 text-red-300', kundenbetreuer: 'bg-green-50 text-green-300', leadbearbeiter: 'bg-amber-50 text-amber-300', kanzlei: 'bg-violet-50 text-violet-300' }
const KAT_LABELS: Record<string, string> = { dispatch: 'Dispatch', kundenbetreuer: 'Kundenbetr.', admin: 'Admin', entwicklung: 'Entwicklung' }
const KAT_COLORS: Record<string, string> = { dispatch: 'bg-amber-50 text-amber-300', kundenbetreuer: 'bg-green-50 text-green-300', admin: 'bg-red-50 text-red-300', entwicklung: 'bg-[#4573A2]/5 text-[#7BA3CC]' }

type Mitarbeiter = {
  id: string; email: string | null; vorname: string | null; nachname: string | null
  rolle: string; telefon: string | null; force_password_change: boolean | null; created_at: string
  position: string | null; gehaltsstufe: string | null; kategorie: string | null
  kapazitaet_max: number | null; aktiv: boolean | null; eingestellt_am: string | null
}

export default function TeamClient({ mitarbeiter, leadsByUser, aktiveFaelleByUser, abgeschlossenByUser, monatLabel, kbFallbackAktiv }: {
  mitarbeiter: Mitarbeiter[]
  leadsByUser: Record<string, { total: number; konvertiert: number }>
  aktiveFaelleByUser: Record<string, number>
  abgeschlossenByUser: Record<string, number>
  monatLabel: string
  kbFallbackAktiv: number
}) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [filterKat, setFilterKat] = useState('alle')

  const filtered = filterKat === 'alle' ? mitarbeiter : mitarbeiter.filter(m => m.kategorie === filterKat)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setSuccess(null); setLoading(true)
    try {
      const fd = new FormData(e.currentTarget)
      const r = await createMitarbeiter(fd)
      setSuccess(`${r.email} eingeladen. Passwort: ${r.password}`)
      setShowDialog(false); router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler') }
    finally { setLoading(false) }
  }

  const name = (m: Mitarbeiter) => [m.vorname, m.nachname].filter(Boolean).join(' ') || '—'

  return (
    <div className="h-full overflow-y-auto py-8"><div>
      <div className="mb-6">
        <PageHeader
          title="Personal"
          description={`${mitarbeiter.length} Mitarbeiter · ${monatLabel}`}
          icon={UsersIcon}
          actions={
            <button onClick={() => { setShowDialog(true); setError(null); setSuccess(null) }} className="flex items-center gap-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
              <UserPlusIcon className="w-4 h-4" /> Neuer Mitarbeiter
            </button>
          }
        />
      </div>

      <div className="flex gap-2 mb-4">
        <Link href="/admin/team" className="px-3 py-1.5 bg-[#1E3A5F] text-white text-xs font-medium rounded-lg">Übersicht</Link>
        <Link href="/admin/team/leaderboard" className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 hover:text-gray-800 text-xs font-medium rounded-lg transition-colors"><TrophyIcon className="w-3.5 h-3.5" />Leaderboard</Link>
        <Link href="/admin/team/incentives" className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 hover:text-gray-800 text-xs font-medium rounded-lg transition-colors"><GiftIcon className="w-3.5 h-3.5" />Incentives</Link>
      </div>

      {success && <div className="bg-green-50 border border-green-800 rounded-xl p-4 mb-4"><p className="text-green-300 text-sm">{success}</p></div>}

      {/* AAR-427: KPI-Banner — wieviele Fälle laufen aktuell im Admin-Fallback-Modus? */}
      {kbFallbackAktiv > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
          <AlertTriangleIcon className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-amber-900 text-sm font-medium">
              {kbFallbackAktiv} aktive{kbFallbackAktiv === 1 ? 'r Fall' : ' Fälle'} im KB-Fallback-Modus
            </p>
            <p className="text-amber-700 text-xs mt-0.5">
              Diese Fälle werden vorübergehend von einem Admin betreut, weil bei der Konversion kein Kundenbetreuer verfügbar war. Sobald ein KB frei ist, manuell re-assignen.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {['alle', 'dispatch', 'kundenbetreuer', 'admin', 'entwicklung'].map(k => (
          <button key={k} onClick={() => setFilterKat(k)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterKat === k ? 'bg-zinc-700 text-gray-900' : 'bg-gray-100/50 text-gray-500 hover:text-gray-700'}`}>
            {k === 'alle' ? 'Alle' : KAT_LABELS[k] ?? k}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200">
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Name</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Rolle</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Kategorie</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Auslastung</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Performance</th>
              <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
            </tr></thead>
            <tbody>
              {filtered.map(m => {
                const leads = leadsByUser[m.id]
                const aktive = aktiveFaelleByUser[m.id] ?? 0
                const abg = abgeschlossenByUser[m.id] ?? 0
                const isD = m.kategorie === 'dispatch' || m.rolle === 'leadbearbeiter'
                const load = isD ? (leads?.total ?? 0) : aktive
                const loadMax = isD ? 50 : (m.kapazitaet_max ?? 100)
                const pct = loadMax > 0 ? Math.min(100, Math.round((load / loadMax) * 100)) : 0
                return (
                  <tr key={m.id} className="border-b border-gray-200/50 hover:bg-gray-100/40 transition-colors cursor-pointer" onClick={() => router.push(`/admin/team/${m.id}`)}>
                    <td className="px-4 py-3"><div className="text-gray-800 font-medium">{name(m)}</div><div className="text-gray-500 text-xs">{m.email}</div></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLLE_COLORS[m.rolle] ?? 'bg-gray-100 text-gray-700'}`}>{ROLLE_LABELS[m.rolle] ?? m.rolle}</span></td>
                    <td className="px-4 py-3">{m.kategorie ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${KAT_COLORS[m.kategorie] ?? 'bg-gray-100 text-gray-700'}`}>{KAT_LABELS[m.kategorie] ?? m.kategorie}</span> : <span className="text-gray-400 text-xs">—</span>}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-[#4573A2]'}`} style={{ width: `${pct}%` }} /></div><span className="text-gray-500 text-xs tabular-nums">{load}/{loadMax}</span></div></td>
                    <td className="px-4 py-3">{isD
                      ? <div className="flex items-center gap-1.5 text-xs"><ActivityIcon className="w-3.5 h-3.5 text-amber-400" /><span className="text-gray-700">{leads?.total ?? 0} Leads</span><span className="text-gray-400">·</span><span className="text-green-400">{leads?.konvertiert ?? 0} konv.</span></div>
                      : <div className="flex items-center gap-1.5 text-xs"><ActivityIcon className="w-3.5 h-3.5 text-green-400" /><span className="text-gray-700">{aktive} aktiv</span><span className="text-gray-400">·</span><span className="text-green-400">{abg} abg.</span></div>
                    }</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m.aktiv === false ? <span className="text-red-400 text-xs">Inaktiv</span> : m.force_password_change ? <span className="text-amber-400 text-xs">Einladung</span> : <span className="text-green-400 text-xs flex items-center gap-1"><ShieldCheckIcon className="w-3 h-3" />Aktiv</span>}
                        {/* AAR-634: „Deaktivieren + Fälle verteilen" nur für aktive KB/LB */}
                        {m.aktiv !== false && (m.rolle === 'kundenbetreuer' || m.rolle === 'leadbearbeiter') && (
                          <DeactivateReassignButton mitarbeiterId={m.id} name={name(m)} />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-gray-500">Keine Mitarbeiter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showDialog && <>

        <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowDialog(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-gray-900 font-semibold text-lg mb-4">Neuer Mitarbeiter</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm text-gray-500 mb-1 block">Vorname</label><input name="vorname" required className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
                <div><label className="text-sm text-gray-500 mb-1 block">Nachname</label><input name="nachname" required className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              </div>
              <div><label className="text-sm text-gray-500 mb-1 block">E-Mail</label><input name="email" type="email" required className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm text-gray-500 mb-1 block">Rolle</label><select name="rolle" required className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"><option value="kundenbetreuer">Kundenbetreuer</option><option value="leadbearbeiter">Leadbearbeiter</option><option value="admin">Admin</option><option value="kanzlei">Kanzlei</option></select></div>
                <div><label className="text-sm text-gray-500 mb-1 block">Kategorie</label><select name="kategorie" className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"><option value="">—</option><option value="dispatch">Dispatch</option><option value="kundenbetreuer">Kundenbetreuer</option><option value="admin">Admin</option><option value="entwicklung">Entwicklung</option></select></div>
              </div>
              <div><label className="text-sm text-gray-500 mb-1 block">Kapazitaet (max. Faelle)</label><input name="kapazitaet_max" type="number" defaultValue={100} className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" /></div>
              {error && <p className="text-sm text-red-400 bg-red-50/50 border border-red-900 px-4 py-3 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDialog(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 rounded-xl transition-colors">Abbrechen</button>
                <button type="submit" disabled={loading} className="flex-1 bg-[#4573A2] hover:bg-[#4573A2] disabled:bg-zinc-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{loading ? 'Erstelle...' : 'Erstellen'}</button>
              </div>
            </form>
          </div>
        </div>
      </>}
    </div></div>
  )
}

// AAR-634: Inline-Button + Bestätigungsdialog für KB-Deaktivierung.
// Ein-Click-Workflow: Klick zeigt Confirm, OK triggert Action + zeigt Toast.
function DeactivateReassignButton({ mitarbeiterId, name }: { mitarbeiterId: string; name: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`${name} wirklich deaktivieren? Alle offenen Fälle + Tasks werden auf andere KBs neu verteilt.`)) return
    setLoading(true)
    try {
      const r = await deactivateKbWithReassign(mitarbeiterId)
      if (r.success) {
        setToast(`${r.reassigned_count} Fälle + ${r.tasks_reassigned} Tasks neu verteilt${r.failed_count ? ` (${r.failed_count} ohne Zuweisung)` : ''}`)
        setTimeout(() => setToast(null), 5000)
        router.refresh()
      } else {
        setToast(`Fehler: ${r.error ?? 'Unbekannt'}`)
        setTimeout(() => setToast(null), 5000)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
        title="Deaktivieren + Fälle neu verteilen"
      >
        <PowerIcon className="w-3 h-3" />
        {loading ? '…' : 'Deakt.'}
      </button>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-white rounded-ios-lg shadow-ios-md px-4 py-3 shadow-lg max-w-sm">
          <p className="text-gray-800 text-sm">{toast}</p>
        </div>
      )}
    </>
  )
}
