'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GiftIcon, UsersIcon, TrophyIcon, PlusIcon, ToggleLeftIcon, ToggleRightIcon } from 'lucide-react'
import { createIncentive, toggleIncentive } from '../actions'

type Incentive = {
  id: string; titel: string; beschreibung: string | null; kategorie: string; typ: string
  bedingung: string; wert: number; aktiv: boolean; gueltig_ab: string | null; gueltig_bis: string | null; created_at: string
}
type Auszahlung = {
  id: string; incentive_id: string; mitarbeiter_id: string; monat: string | null; betrag: number; status: string
  profiles: { vorname: string | null; nachname: string | null; email: string | null } | null
}

const TYP_LABELS: Record<string, string> = { bonus: 'Bonus', provision: 'Provision', sachleistung: 'Sachleistung', freizeit: 'Freizeit' }
const TYP_COLORS: Record<string, string> = { bonus: 'bg-green-950 text-green-300', provision: 'bg-blue-950 text-blue-300', sachleistung: 'bg-violet-950 text-violet-300', freizeit: 'bg-amber-950 text-amber-300' }
const KAT_LABELS: Record<string, string> = { dispatch: 'Dispatch', kundenbetreuer: 'Kundenbetreuer', alle: 'Alle' }

export default function IncentivesClient({ incentives, auszahlungen }: {
  incentives: Incentive[]
  auszahlungen: Auszahlung[]
  profiles: { id: string; vorname: string | null; nachname: string | null }[]
}) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setLoading(true)
    try {
      await createIncentive(new FormData(e.currentTarget))
      setShowDialog(false); router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler') }
    finally { setLoading(false) }
  }

  async function handleToggle(id: string, aktiv: boolean) {
    setToggling(id)
    try { await toggleIncentive(id, !aktiv); router.refresh() }
    catch { /* ignore */ }
    finally { setToggling(null) }
  }

  const aktive = incentives.filter(i => i.aktiv)
  const inaktive = incentives.filter(i => !i.aktiv)

  const fmt = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)

  return (
    <div className="px-4 py-8"><div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2"><GiftIcon className="w-5 h-5 text-violet-400" />Incentives</h1>
          <p className="text-zinc-500 text-sm mt-0.5">{aktive.length} aktiv · {inaktive.length} inaktiv</p>
        </div>
        <button onClick={() => { setShowDialog(true); setError(null) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
          <PlusIcon className="w-4 h-4" /> Neues Incentive
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        <Link href="/admin/team" className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white text-xs font-medium rounded-lg transition-colors"><UsersIcon className="w-3.5 h-3.5" />Uebersicht</Link>
        <Link href="/admin/team/leaderboard" className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-400 hover:text-white text-xs font-medium rounded-lg transition-colors"><TrophyIcon className="w-3.5 h-3.5" />Leaderboard</Link>
        <Link href="/admin/team/incentives" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg"><GiftIcon className="w-3.5 h-3.5 inline mr-1.5" />Incentives</Link>
      </div>

      {/* Aktive Incentives */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {aktive.map(inc => {
          const incAusz = auszahlungen.filter(a => a.incentive_id === inc.id)
          return (
            <div key={inc.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-semibold">{inc.titel}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYP_COLORS[inc.typ] ?? 'bg-zinc-800 text-zinc-300'}`}>{TYP_LABELS[inc.typ] ?? inc.typ}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-800 text-zinc-400">{KAT_LABELS[inc.kategorie] ?? inc.kategorie}</span>
                  </div>
                </div>
                <button onClick={() => handleToggle(inc.id, inc.aktiv)} disabled={toggling === inc.id} className="text-green-400 hover:text-green-300 transition-colors">
                  <ToggleRightIcon className="w-6 h-6" />
                </button>
              </div>
              {inc.beschreibung && <p className="text-zinc-400 text-sm mb-2">{inc.beschreibung}</p>}
              <div className="text-zinc-500 text-xs mb-2">Bedingung: <span className="text-zinc-300">{inc.bedingung}</span></div>
              <div className="text-zinc-500 text-xs mb-3">Wert: <span className="text-green-400 font-semibold">{fmt(inc.wert)}</span>
                {inc.gueltig_ab && <> · ab {inc.gueltig_ab}</>}
                {inc.gueltig_bis && <> bis {inc.gueltig_bis}</>}
              </div>
              {incAusz.length > 0 && (
                <div className="border-t border-zinc-800 pt-3">
                  <p className="text-zinc-400 text-xs mb-1.5">Auszahlungen ({incAusz.length})</p>
                  {incAusz.slice(0, 3).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs py-1">
                      <span className="text-zinc-300">{a.profiles ? [a.profiles.vorname, a.profiles.nachname].filter(Boolean).join(' ') : '—'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">{a.monat}</span>
                        <span className="text-green-400">{fmt(a.betrag)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${a.status === 'ausgezahlt' ? 'bg-green-950 text-green-300' : a.status === 'genehmigt' ? 'bg-blue-950 text-blue-300' : 'bg-zinc-800 text-zinc-400'}`}>{a.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {aktive.length === 0 && <div className="col-span-full text-center text-zinc-500 py-12">Keine aktiven Incentives</div>}
      </div>

      {/* Inaktive Incentives */}
      {inaktive.length > 0 && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800">
            <h3 className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">Inaktiv ({inaktive.length})</h3>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {inaktive.map(inc => (
              <div key={inc.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-zinc-400 text-sm">{inc.titel}</span>
                  <span className="text-zinc-600 text-xs ml-2">{fmt(inc.wert)}</span>
                </div>
                <button onClick={() => handleToggle(inc.id, inc.aktiv)} disabled={toggling === inc.id} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                  <ToggleLeftIcon className="w-6 h-6" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {showDialog && <>
        <div className="fixed inset-0 bg-black/60 z-50" onClick={() => setShowDialog(false)} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-white font-semibold text-lg mb-4">Neues Incentive</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><label className="text-sm text-zinc-400 mb-1 block">Titel</label><input name="titel" required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
              <div><label className="text-sm text-zinc-400 mb-1 block">Beschreibung</label><textarea name="beschreibung" rows={2} className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm text-zinc-400 mb-1 block">Kategorie</label><select name="kategorie" required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"><option value="dispatch">Dispatch</option><option value="kundenbetreuer">Kundenbetreuer</option><option value="alle">Alle</option></select></div>
                <div><label className="text-sm text-zinc-400 mb-1 block">Typ</label><select name="typ" required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"><option value="bonus">Bonus</option><option value="provision">Provision</option><option value="sachleistung">Sachleistung</option><option value="freizeit">Freizeit</option></select></div>
              </div>
              <div><label className="text-sm text-zinc-400 mb-1 block">Bedingung</label><input name="bedingung" required placeholder="z.B. Mehr als 50 Leads im Monat" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-sm text-zinc-400 mb-1 block">Wert (EUR)</label><input name="wert" type="number" step="0.01" required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
                <div><label className="text-sm text-zinc-400 mb-1 block">Gueltig ab</label><input name="gueltig_ab" type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
                <div><label className="text-sm text-zinc-400 mb-1 block">Gueltig bis</label><input name="gueltig_bis" type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" /></div>
              </div>
              {error && <p className="text-sm text-red-400 bg-red-950/50 border border-red-900 px-4 py-3 rounded-xl">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowDialog(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium py-2.5 rounded-xl transition-colors">Abbrechen</button>
                <button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{loading ? 'Erstelle...' : 'Erstellen'}</button>
              </div>
            </form>
          </div>
        </div>
      </>}
    </div></div>
  )
}
