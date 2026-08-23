'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { UserPlusIcon, ShieldCheckIcon, TrophyIcon, GiftIcon, ActivityIcon, AlertTriangleIcon, PowerIcon } from 'lucide-react'
import { createMitarbeiter, deactivateKbWithReassign } from './actions'
import { Button, Modal } from '@/components/primitives'
import PageHeader from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, ClickableTr, Th, Td } from '@/components/shared/DataTable'

const ROLLE_LABELS: Record<string, string> = { admin: 'Admin', kundenbetreuer: 'Kundenbetreuer', dispatch: 'Dispatcher', kanzlei: 'Kanzlei' }
// AAR-Visual-Audit 14.05.2026: Admin → claimondo-navy statt red-50. Admin ist
// die privilegierte Rolle, nicht "danger" — semantisches Mismatch. Brand-Tone
// passt besser. Kundenbetreuer/Dispatch/Kanzlei bleiben semantisch (Funktions-
// Kategorie statt Severität).
const ROLLE_COLORS: Record<string, string> = { admin: 'bg-claimondo-navy/[0.10] text-claimondo-navy', kundenbetreuer: 'bg-success-soft text-success-strong', dispatch: 'bg-warning-soft text-warning-strong', kanzlei: 'bg-claimondo-ondo/[0.06] text-claimondo-ondo' }
const KAT_LABELS: Record<string, string> = { dispatch: 'Dispatch', kundenbetreuer: 'Kundenbetr.', admin: 'Admin', entwicklung: 'Entwicklung' }
const KAT_COLORS: Record<string, string> = { dispatch: 'bg-warning-soft text-warning-strong', kundenbetreuer: 'bg-success-soft text-success-strong', admin: 'bg-claimondo-navy/[0.10] text-claimondo-navy', entwicklung: 'bg-claimondo-ondo/[0.06] text-claimondo-light-blue' }

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
      // Deutsche App-Validierung statt der englischen Browser-Bubble ("Please fill out this
      // field.") — die native required-Meldung ist im deutschen Produkt ein Sprachbruch (UI-Audit 17.07.).
      const vorname = String(fd.get('vorname') ?? '').trim()
      const nachname = String(fd.get('nachname') ?? '').trim()
      const email = String(fd.get('email') ?? '').trim()
      if (!vorname || !nachname || !email) {
        setError('Bitte Vorname, Nachname und E-Mail ausfüllen.')
        return
      }
      const r = await createMitarbeiter(fd)
      if (!r.success) {
        setError(r.error)
        return
      }
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
          description={<>{mitarbeiter.length} Mitarbeiter · {monatLabel}</>}
          size="lg"
          actions={
            <Button
              variant="navy"
              onClick={() => { setShowDialog(true); setError(null); setSuccess(null) }}
              iconLeft={<UserPlusIcon className="w-4 h-4" />}
            >
              Neuer Mitarbeiter
            </Button>
          }
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        <Link href="/admin/team" className="px-3 py-1.5 bg-claimondo-shield text-white text-body-xs font-medium rounded-ios-lg whitespace-nowrap shrink-0">Übersicht</Link>
        <Link href="/admin/team/leaderboard" className="flex items-center gap-1.5 px-3 py-1.5 bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-body-xs font-medium rounded-ios-lg transition-colors whitespace-nowrap shrink-0"><TrophyIcon className="w-3.5 h-3.5" />Leaderboard</Link>
        <Link href="/admin/team/incentives" className="flex items-center gap-1.5 px-3 py-1.5 bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy text-body-xs font-medium rounded-ios-lg transition-colors whitespace-nowrap shrink-0"><GiftIcon className="w-3.5 h-3.5" />Incentives</Link>
      </div>

      {success && <div className="bg-success-soft border border-success/30 rounded-ios-xl p-4 mb-4"><p className="text-success-strong text-body-sm">{success}</p></div>}

      {/* AAR-427: KPI-Banner — wieviele Fälle laufen aktuell im Admin-Fallback-Modus? */}
      {kbFallbackAktiv > 0 && (
        <div className="bg-warning-soft border border-warning/30 rounded-ios-xl px-4 py-3 mb-4 flex items-center gap-3">
          <AlertTriangleIcon className="w-4 h-4 text-warning flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-warning-strong text-body-sm font-medium">
              {kbFallbackAktiv} aktive{kbFallbackAktiv === 1 ? 'r Fall' : ' Fälle'} im KB-Fallback-Modus
            </p>
            <p className="text-warning-strong text-body-xs mt-0.5">
              Diese Fälle werden vorübergehend von einem Admin betreut, weil bei der Konversion kein Kundenbetreuer verfügbar war. Sobald ein KB frei ist, manuell re-assignen.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {['alle', 'dispatch', 'kundenbetreuer', 'admin', 'entwicklung'].map(k => (
          <button key={k} onClick={() => setFilterKat(k)} className={`px-3 py-1.5 text-body-xs font-medium rounded-ios-lg transition-colors whitespace-nowrap shrink-0 ${filterKat === k ? 'bg-claimondo-navy text-white' : 'bg-claimondo-bg/50 text-claimondo-ondo hover:text-claimondo-navy'}`}>
            {k === 'alle' ? 'Alle' : KAT_LABELS[k] ?? k}
          </button>
        ))}
      </div>

      <DataTableContainer variant="plain" className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden">
        <Table>
          <Thead className="bg-transparent! text-body-sm! normal-case! tracking-normal!">
            <Tr className="border-b border-claimondo-border">
              <Th className="text-left text-claimondo-ondo!">Name</Th>
              <Th className="text-left text-claimondo-ondo!">Rolle</Th>
              <Th className="text-left text-claimondo-ondo!">Kategorie</Th>
              <Th className="text-left text-claimondo-ondo!">Auslastung</Th>
              <Th className="text-left text-claimondo-ondo!">Performance</Th>
              <Th className="text-left text-claimondo-ondo!">Status</Th>
            </Tr>
          </Thead>
          <Tbody className="divide-y-0!">
              {filtered.map(m => {
                const leads = leadsByUser[m.id]
                const aktive = aktiveFaelleByUser[m.id] ?? 0
                const abg = abgeschlossenByUser[m.id] ?? 0
                const isD = m.kategorie === 'dispatch' || m.rolle === 'dispatch'
                const load = isD ? (leads?.total ?? 0) : aktive
                const loadMax = isD ? 50 : (m.kapazitaet_max ?? 100)
                const pct = loadMax > 0 ? Math.min(100, Math.round((load / loadMax) * 100)) : 0
                return (
                  <ClickableTr key={m.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40!" onClick={() => router.push(`/admin/team/${m.id}`)}>
                    {/* Echter Link statt nur ClickableTr-onClick: erlaubt Mittelklick/Strg+Klick
                        (Detailansicht im neuen Tab), Tastatur-Fokus und Screenreader-Erkennung.
                        Der Zeilen-Klick bleibt unveraendert — stopPropagation verhindert nur,
                        dass beide Handler feuern. Muster: FaelleKanban.tsx:235. */}
                    <Td><Link href={`/admin/team/${m.id}`} onClick={e => e.stopPropagation()} className="block text-claimondo-navy font-medium">{name(m)}</Link><div className="text-claimondo-ondo text-body-xs">{m.email}</div></Td>
                    <Td><span className={`px-2 py-0.5 rounded-full text-body-xs font-medium ${ROLLE_COLORS[m.rolle] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>{ROLLE_LABELS[m.rolle] ?? m.rolle}</span></Td>
                    <Td>{m.kategorie ? <span className={`px-2 py-0.5 rounded-full text-body-xs font-medium ${KAT_COLORS[m.kategorie] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>{KAT_LABELS[m.kategorie] ?? m.kategorie}</span> : <span className="text-claimondo-ondo/70 text-body-xs">—</span>}</Td>
                    <Td><div className="flex items-center gap-2"><div className="w-20 h-2 bg-claimondo-bg rounded-full overflow-hidden"><div className={`h-full rounded-full ${pct > 80 ? 'bg-danger' : pct > 50 ? 'bg-warning' : 'bg-claimondo-ondo'}`} style={{ width: `${pct}%` }} /></div><span className="text-claimondo-ondo text-body-xs tabular-nums">{load}/{loadMax}</span></div></Td>
                    <Td>{isD
                      ? <div className="flex items-center gap-1.5 text-body-xs"><ActivityIcon className="w-3.5 h-3.5 text-warning-strong" /><span className="text-claimondo-navy">{leads?.total ?? 0} Leads</span><span className="text-claimondo-ondo/70">·</span><span className="text-success-strong">{leads?.konvertiert ?? 0} konv.</span></div>
                      : <div className="flex items-center gap-1.5 text-body-xs"><ActivityIcon className="w-3.5 h-3.5 text-success-strong" /><span className="text-claimondo-navy">{aktive} aktiv</span><span className="text-claimondo-ondo/70">·</span><span className="text-success-strong">{abg} abg.</span></div>
                    }</Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {m.aktiv === false ? <span className="text-danger text-body-xs">Inaktiv</span> : m.force_password_change ? <span className="text-warning text-body-xs">Einladung</span> : <span className="text-success text-body-xs flex items-center gap-1"><ShieldCheckIcon className="w-3 h-3" />Aktiv</span>}
                        {/* AAR-634: „Deaktivieren + Fälle verteilen" nur für aktive KB/LB */}
                        {m.aktiv !== false && (m.rolle === 'kundenbetreuer' || m.rolle === 'dispatch') && (
                          <DeactivateReassignButton mitarbeiterId={m.id} name={name(m)} />
                        )}
                      </div>
                    </Td>
                  </ClickableTr>
                )
              })}
              {filtered.length === 0 && <Tr><Td colSpan={6} className="py-12! text-center text-claimondo-ondo!">Keine Mitarbeiter.</Td></Tr>}
            </Tbody>
          </Table>
        </DataTableContainer>

      {/* AAR-774: Custom-Dialog → shared Modal-Primitive */}
      <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={480} ariaLabel="Neuer Mitarbeiter">
        <h2 className="text-claimondo-navy font-semibold text-heading-sm mb-4">Neuer Mitarbeiter</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-body-sm text-claimondo-ondo mb-1 block">Vorname</label><input name="vorname" className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-body-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
            <div><label className="text-body-sm text-claimondo-ondo mb-1 block">Nachname</label><input name="nachname" className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-body-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          </div>
          <div><label className="text-body-sm text-claimondo-ondo mb-1 block">E-Mail</label><input name="email" type="email" className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-body-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-body-sm text-claimondo-ondo mb-1 block">Rolle</label><select name="rolle" required className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-body-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield"><option value="kundenbetreuer">Kundenbetreuer</option><option value="dispatch">Dispatcher</option><option value="admin">Admin</option><option value="kanzlei">Kanzlei</option></select></div>
            <div><label className="text-body-sm text-claimondo-ondo mb-1 block">Kategorie</label><select name="kategorie" className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-body-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield"><option value="">—</option><option value="dispatch">Dispatch</option><option value="kundenbetreuer">Kundenbetreuer</option><option value="admin">Admin</option><option value="entwicklung">Entwicklung</option></select></div>
          </div>
          <div><label className="text-body-sm text-claimondo-ondo mb-1 block">Kapazität (max. Fälle)</label><input name="kapazitaet_max" type="number" defaultValue={100} className="w-full bg-claimondo-bg border border-claimondo-border rounded-ios-xl px-3 py-2 text-claimondo-navy text-body-sm focus:outline-none focus:ring-2 focus:ring-claimondo-shield" /></div>
          {error && <p className="text-body-sm text-danger bg-danger-soft border border-danger/30 px-4 py-3 rounded-ios-xl">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" fullWidth onClick={() => setShowDialog(false)}>Abbrechen</Button>
            <Button variant="navy" fullWidth type="submit" disabled={loading}>
              {loading ? 'Erstelle...' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </Modal>

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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-caption font-medium bg-danger-soft text-danger hover:bg-danger/15 disabled:opacity-50 transition-colors"
        title="Deaktivieren + Fälle neu verteilen"
      >
        <PowerIcon className="w-3 h-3" />
        {loading ? '…' : 'Deakt.'}
      </button>
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-white rounded-ios-lg shadow-ios-md px-4 py-3 shadow-lg max-w-sm">
          <p className="text-claimondo-navy text-body-sm">{toast}</p>
        </div>
      )}
    </>
  )
}
