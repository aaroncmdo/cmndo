'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GiftIcon, UsersIcon, TrophyIcon, PlusIcon, ToggleLeftIcon, ToggleRightIcon } from 'lucide-react'
import { createIncentive, toggleIncentive } from '../actions'
import PageHeader from '@/components/shared/PageHeader'
import { Modal } from '@/components/primitives'

type Incentive = {
  id: string; titel: string; beschreibung: string | null; kategorie: string; typ: string
  bedingung: string; wert: number; aktiv: boolean; gueltig_ab: string | null; gueltig_bis: string | null; created_at: string
}
type Auszahlung = {
  id: string; incentive_id: string; mitarbeiter_id: string; monat: string | null; betrag: number; status: string
  profiles: { vorname: string | null; nachname: string | null; email: string | null } | null
}

const TYP_LABELS: Record<string, string> = { bonus: 'Bonus', provision: 'Provision', sachleistung: 'Sachleistung', freizeit: 'Freizeit' }
const TYP_COLORS: Record<string, string> = { bonus: 'bg-green-50 text-green-300', provision: 'bg-claimondo-ondo/5 text-claimondo-light-blue', sachleistung: 'bg-violet-50 text-violet-300', freizeit: 'bg-amber-50 text-amber-300' }
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
      const r = await createIncentive(new FormData(e.currentTarget))
      if (!r.success) {
        setError(r.error ?? 'Fehler')
        return
      }
      setShowDialog(false); router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Fehler') }
    finally { setLoading(false) }
  }

  async function handleToggle(id: string, aktiv: boolean) {
    setToggling(id)
    try {
      const r = await toggleIncentive(id, !aktiv)
      if (r.success) router.refresh()
    }
    catch { /* ignore */ }
    finally { setToggling(null) }
  }

  const aktive = incentives.filter(i => i.aktiv)
  const inaktive = incentives.filter(i => !i.aktiv)

  const fmt = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v)

  return (
    <div className="py-8"><div className="space-y-6">
      <PageHeader
        title="Incentives"
        description={`${aktive.length} aktiv · ${inaktive.length} inaktiv`}
        icon={GiftIcon}
        actions={
          <button onClick={() => { setShowDialog(true); setError(null) }} className="flex items-center gap-2 bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">
            <PlusIcon className="w-4 h-4" /> Neues Incentive
          </button>
        }
      />

      <div className="flex gap-2">
        <Link href="/admin/team" className="flex items-center gap-1.5 px-3 py-1.5 bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium rounded-lg transition-colors"><UsersIcon className="w-3.5 h-3.5" />Übersicht</Link>
        <Link href="/admin/team/leaderboard" className="flex items-center gap-1.5 px-3 py-1.5 bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-xs font-medium rounded-lg transition-colors"><TrophyIcon className="w-3.5 h-3.5" />Leaderboard</Link>
        <Link href="/admin/team/incentives" className="px-3 py-1.5 bg-claimondo-shield text-white text-xs font-medium rounded-lg"><GiftIcon className="w-3.5 h-3.5 inline mr-1.5" />Incentives</Link>
      </div>

      {/* Aktive Incentives */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {aktive.map(inc => {
          const incAusz = auszahlungen.filter(a => a.incentive_id === inc.id)
          return (
            <div key={inc.id} className="bg-white border border-claimondo-border rounded-2xl p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-claimondo-navy font-semibold">{inc.titel}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYP_COLORS[inc.typ] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>{TYP_LABELS[inc.typ] ?? inc.typ}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-claimondo-bg text-claimondo-ondo">{KAT_LABELS[inc.kategorie] ?? inc.kategorie}</span>
                  </div>
                </div>
                <button onClick={() => handleToggle(inc.id, inc.aktiv)} disabled={toggling === inc.id} className="text-green-400 hover:text-green-300 transition-colors">
                  <ToggleRightIcon className="w-6 h-6" />
                </button>
              </div>
              {inc.beschreibung && <p className="text-claimondo-ondo text-sm mb-2">{inc.beschreibung}</p>}
              <div className="text-claimondo-ondo text-xs mb-2">Bedingung: <span className="text-claimondo-navy">{inc.bedingung}</span></div>
              <div className="text-claimondo-ondo text-xs mb-3">Wert: <span className="text-green-400 font-semibold">{fmt(inc.wert)}</span>
                {inc.gueltig_ab && <> · ab {inc.gueltig_ab}</>}
                {inc.gueltig_bis && <> bis {inc.gueltig_bis}</>}
              </div>
              {incAusz.length > 0 && (
                <div className="border-t border-claimondo-border pt-3">
                  <p className="text-claimondo-ondo text-xs mb-1.5">Auszahlungen ({incAusz.length})</p>
                  {incAusz.slice(0, 3).map(a => (
                    <div key={a.id} className="flex items-center justify-between text-xs py-1">
                      <span className="text-claimondo-navy">{a.profiles ? [a.profiles.vorname, a.profiles.nachname].filter(Boolean).join(' ') : '—'}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-claimondo-ondo">{a.monat}</span>
                        <span className="text-green-400">{fmt(a.betrag)}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${a.status === 'ausgezahlt' ? 'bg-green-50 text-green-300' : a.status === 'genehmigt' ? 'bg-claimondo-ondo/5 text-claimondo-light-blue' : 'bg-claimondo-bg text-claimondo-ondo'}`}>{a.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        {aktive.length === 0 && <div className="col-span-full text-center text-claimondo-ondo py-12">Keine aktiven Incentives</div>}
      </div>

      {/* Inaktive Incentives */}
      {inaktive.length > 0 && (
        <div className="bg-white rounded-2xl border border-claimondo-border overflow-hidden">
          <div className="px-5 py-3 border-b border-claimondo-border">
            <h3 className="text-claimondo-ondo text-xs font-semibold uppercase tracking-wider">Inaktiv ({inaktive.length})</h3>
          </div>
          <div className="divide-y divide-claimondo-border/50">
            {inaktive.map(inc => (
              <div key={inc.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="text-claimondo-ondo text-sm">{inc.titel}</span>
                  <span className="text-claimondo-ondo/70 text-xs ml-2">{fmt(inc.wert)}</span>
                </div>
                <button onClick={() => handleToggle(inc.id, inc.aktiv)} disabled={toggling === inc.id} className="text-claimondo-ondo/70 hover:text-claimondo-ondo transition-colors">
                  <ToggleLeftIcon className="w-6 h-6" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AAR-774: Custom-Dialog → shared Modal-Primitive */}
      <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={480} ariaLabel="Neues Incentive">
        <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Neues Incentive</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div><label className="text-sm text-claimondo-ondo mb-1 block">Titel</label><input name="titel" required className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          <div><label className="text-sm text-claimondo-ondo mb-1 block">Beschreibung</label><textarea name="beschreibung" rows={2} className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm text-claimondo-ondo mb-1 block">Kategorie</label><select name="kategorie" required className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield"><option value="dispatch">Dispatch</option><option value="kundenbetreuer">Kundenbetreuer</option><option value="alle">Alle</option></select></div>
            <div><label className="text-sm text-claimondo-ondo mb-1 block">Typ</label><select name="typ" required className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield"><option value="bonus">Bonus</option><option value="provision">Provision</option><option value="sachleistung">Sachleistung</option><option value="freizeit">Freizeit</option></select></div>
          </div>
          <div><label className="text-sm text-claimondo-ondo mb-1 block">Bedingung</label><input name="bedingung" required placeholder="z.B. Mehr als 50 Leads im Monat" className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-sm text-claimondo-ondo mb-1 block">Wert (EUR)</label><input name="wert" type="number" step="0.01" required className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
            <div><label className="text-sm text-claimondo-ondo mb-1 block">Gueltig ab</label><input name="gueltig_ab" type="date" className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
            <div><label className="text-sm text-claimondo-ondo mb-1 block">Gueltig bis</label><input name="gueltig_bis" type="date" className="w-full bg-claimondo-bg border border-claimondo-border rounded-xl px-3 py-2 text-claimondo-navy text-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowDialog(false)} className="flex-1 bg-claimondo-bg hover:bg-claimondo-border text-claimondo-navy text-sm font-medium py-2.5 rounded-xl transition-colors">Abbrechen</button>
            <button type="submit" disabled={loading} className="flex-1 bg-claimondo-ondo hover:bg-claimondo-shield text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50">{loading ? 'Erstelle...' : 'Erstellen'}</button>
          </div>
        </form>
      </Modal>
    </div></div>
  )
}
