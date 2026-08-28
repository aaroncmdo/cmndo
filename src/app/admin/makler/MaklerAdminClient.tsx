'use client'

// Makler-Vermittlung: Admin-Anlage-UI. Spiegelt WerkstaettenClient (primitives Button/Modal +
// DataTable + TextField + createdCredentials-Pattern), aber: plain Adress-Felder (kein Geo/Isochrone),
// dual-rate, und handleCreate MIT try/catch (WerkstaettenClient hat hier einen Silent-Swallow-Bug).
// Formular-Inhalt ist nach MaklerAnlegenForm ausgelagert — diese Datei haelt nur noch Liste + Modal-Shell.

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UsersIcon, PlusIcon, Layers3Icon, Trash2Icon, ReceiptIcon, MailIcon } from 'lucide-react'
import { resendMaklerWelcome } from './actions'
import { getMaklerStaffel, setMaklerStaffel } from './staffel-actions'
import { ladePartnerBilling } from '@/lib/finance/partner-billing-actions'
import MaklerAnlegenForm from './MaklerAnlegenForm'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal, CloseButton } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
import { PartnerBillingPanel } from '@/components/shared/finance/PartnerBillingPanel'
import type { PartnerBillingRow, PartnerBillingAggregat } from '@/lib/finance/partner-billing'

type GesellschaftOption = { id: string; name: string }

type Makler = {
  id: string
  firma: string
  email: string | null
  telefon: string | null
  status: string | null
  provision_betrag_komplett_netto: number | null
  provision_betrag_nur_gutachter_netto: number | null
  aktiviert_am: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
}

const STATUS_LABELS: Record<string, string> = { aktiv: 'Aktiv', inaktiv: 'Inaktiv', gesperrt: 'Gesperrt' }
const STATUS_COLORS: Record<string, string> = {
  aktiv: 'bg-success-soft text-success-strong',
  inaktiv: 'bg-claimondo-bg text-claimondo-ondo',
  gesperrt: 'bg-danger-soft text-danger-strong',
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

type DrawerData = {
  rows: PartnerBillingRow[]
  aggregat: PartnerBillingAggregat
  istKleinunternehmer: boolean | null
  steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null } | null
  gutschriftDocsByLedger: Record<string, import('@/lib/finance/partner-billing').LedgerGutschriftDocs>
}

export default function MaklerAdminClient({
  maklers,
  versicherungen,
  maklerpools,
}: {
  maklers: Makler[]
  versicherungen: GesellschaftOption[]
  maklerpools: GesellschaftOption[]
}) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)

  // Staffelung pro Makler (Meilenstein-Boni) — gespiegelt von WerkstaettenClient
  const [staffelFor, setStaffelFor] = useState<Makler | null>(null)
  const [staffelRows, setStaffelRows] = useState<{ schwelle: string; bonus: string }[]>([])
  const [staffelLoadingId, setStaffelLoadingId] = useState<string | null>(null)
  const [staffelSaving, setStaffelSaving] = useState(false)
  const [resendingId, setResendingId] = useState<string | null>(null)

  async function openStaffel(m: Makler) {
    setStaffelLoadingId(m.id)
    try {
      const res = await getMaklerStaffel(m.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setStaffelRows(res.stufen.map((s) => ({ schwelle: String(s.schwelle), bonus: String(s.bonus_betrag_netto) })))
      setStaffelFor(m)
    } finally {
      setStaffelLoadingId(null)
    }
  }
  function addStaffelRow() {
    setStaffelRows((rows) => [...rows, { schwelle: '', bonus: '' }])
  }
  function removeStaffelRow(i: number) {
    setStaffelRows((rows) => rows.filter((_, idx) => idx !== i))
  }
  function updateStaffelRow(i: number, field: 'schwelle' | 'bonus', val: string) {
    setStaffelRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)))
  }
  async function saveStaffel() {
    if (!staffelFor) return
    setStaffelSaving(true)
    try {
      const stufen = staffelRows
        .filter((r) => r.schwelle.trim() !== '')
        .map((r) => ({ schwelle: Number(r.schwelle), bonus_betrag_netto: Number(r.bonus || 0) }))
      const res = await setMaklerStaffel(staffelFor.id, stufen)
      if (!res.ok) {
        toast.error(res.error ?? 'Fehler')
        return
      }
      toast.success('Staffelung gespeichert.')
      setStaffelFor(null)
      router.refresh()
    } finally {
      setStaffelSaving(false)
    }
  }

  // Billing-Drawer
  const [openPartnerId, setOpenPartnerId] = useState<string | null>(null)
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null)
  const [drawerPending, startDrawerTransition] = useTransition()

  function openBillingDrawer(m: Makler) {
    setDrawerData(null)
    setOpenPartnerId(m.id)
    startDrawerTransition(async () => {
      const r = await ladePartnerBilling('makler', m.id)
      if (r.ok) {
        setDrawerData({ rows: r.rows, aggregat: r.aggregat, istKleinunternehmer: r.istKleinunternehmer, steuerdaten: r.steuerdaten, gutschriftDocsByLedger: r.gutschriftDocsByLedger })
      } else {
        toast.error(r.error)
        setOpenPartnerId(null)
      }
    })
  }

  function closeDrawer() {
    setOpenPartnerId(null)
    setDrawerData(null)
  }

  // Login-/Willkommens-Mail erneut an den Makler senden. Deckt den Fall ab, dass die Mail
  // bei der Selbst-Registrierung nicht ankam (z.B. interne/Test-Adresse -> Send-Isolation).
  async function handleResendWelcome(m: Makler) {
    setResendingId(m.id)
    try {
      const r = await resendMaklerWelcome(m.id)
      if (r.ok) toast.success(`Login-Mail an ${m.email ?? m.firma} gesendet.`)
      else toast.error(r.error)
    } finally {
      setResendingId(null)
    }
  }

  function openDialog() {
    setShowDialog(true)
  }

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        <div className="mb-6">
          <PageHeader
            title="Makler"
            description={`${maklers.length} Vermittler-Partner`}
            icon={UsersIcon}
            actions={
              <Button variant="navy" onClick={openDialog} iconLeft={<PlusIcon className="w-4 h-4" />}>
                Neuer Makler
              </Button>
            }
          />
        </div>

        <DataTableContainer variant="plain" className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden">
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Firma</Th>
                <Th className="text-left text-claimondo-ondo!">Ansprechpartner</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Provision (komplett / nur Gutachter)</Th>
                <Th className="text-left text-claimondo-ondo!">Aktiviert am</Th>
                <Th className="text-left text-claimondo-ondo!">Staffelung</Th>
                <Th className="text-left text-claimondo-ondo!">Abrechnung</Th>
                <Th className="text-left text-claimondo-ondo!">Login-Mail</Th>
              </Tr>
            </Thead>
            <Tbody className="divide-y-0!">
              {maklers.map(m => (
                <Tr key={m.id} className="border-b border-claimondo-border/50">
                  <Td>
                    {/* B3: Firma drillt in die Makler-Akte (unterm Vertrieb-Dach; Soft-Nav dort = Drawer-Intercept). */}
                    <Link
                      href={`/admin/vertrieb/makler/${m.id}`}
                      className="text-claimondo-navy font-medium hover:text-claimondo-ondo transition-colors"
                    >
                      {m.firma}
                    </Link>
                    <div className="text-claimondo-ondo text-xs">{m.email ?? '—'}</div>
                  </Td>
                  <Td>
                    <div className="text-claimondo-navy text-sm">
                      {[m.ansprechpartner_vorname, m.ansprechpartner_nachname].filter(Boolean).join(' ') || '—'}
                    </div>
                    {m.telefon && <div className="text-claimondo-ondo text-xs">{m.telefon}</div>}
                  </Td>
                  <Td>
                    {m.status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>
                        {STATUS_LABELS[m.status] ?? m.status}
                      </span>
                    ) : (
                      <span className="text-claimondo-ondo/70 text-xs">—</span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-claimondo-navy text-sm tabular-nums">
                      {m.provision_betrag_komplett_netto !== null ? `${m.provision_betrag_komplett_netto} €` : '—'}
                      {' / '}
                      {m.provision_betrag_nur_gutachter_netto !== null ? `${m.provision_betrag_nur_gutachter_netto} €` : '—'}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{formatDatum(m.aktiviert_am)}</span>
                  </Td>
                  <Td>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={staffelLoadingId === m.id}
                      onClick={() => openStaffel(m)}
                      iconLeft={<Layers3Icon className="w-4 h-4" />}
                    >
                      Staffel
                    </Button>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={drawerPending && openPartnerId === m.id}
                      onClick={() => openBillingDrawer(m)}
                      iconLeft={<ReceiptIcon className="w-4 h-4" />}
                    >
                      Abrechnung
                    </Button>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={resendingId === m.id}
                      disabled={!m.email}
                      onClick={() => handleResendWelcome(m)}
                      iconLeft={<MailIcon className="w-4 h-4" />}
                    >
                      Login-Mail
                    </Button>
                  </Td>
                </Tr>
              ))}
              {maklers.length === 0 && (
                <Tr>
                  <Td colSpan={8} className="py-12! text-center text-claimondo-ondo!">
                    Noch keine Makler angelegt.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

        <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={520} ariaLabel="Neuer Makler">
          <MaklerAnlegenForm
            versicherungen={versicherungen}
            maklerpools={maklerpools}
            onClose={() => setShowDialog(false)}
            onCreated={() => router.refresh()}
          />
        </Modal>

        <Modal open={staffelFor !== null} onClose={() => setStaffelFor(null)} maxWidth={520} ariaLabel="Staffelung bearbeiten">
          {staffelFor && (
            <div className="space-y-4">
              <div>
                <h2 className="text-claimondo-navy font-semibold text-lg">Staffelung — {staffelFor.firma}</h2>
                <p className="mt-0.5 text-claimondo-ondo text-sm">
                  Meilenstein-Boni: ab X freigegebenen Vermittlungen ein Einmal-Bonus.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-1 text-xs font-medium text-claimondo-ondo">
                  <span className="flex-1">ab … Vermittlungen</span>
                  <span className="flex-1">Bonus (netto, €)</span>
                  <span className="w-11 shrink-0" />
                </div>
                {staffelRows.length === 0 && (
                  <p className="px-1 text-sm text-claimondo-ondo/70">Noch keine Stufen — füge eine hinzu.</p>
                )}
                {staffelRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="number" min="1" step="1" inputMode="numeric" value={r.schwelle}
                      onChange={(e) => updateStaffelRow(i, 'schwelle', e.target.value)} placeholder="z.B. 10"
                      className="flex-1 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy"
                    />
                    <input
                      type="number" min="0" step="0.01" inputMode="decimal" value={r.bonus}
                      onChange={(e) => updateStaffelRow(i, 'bonus', e.target.value)} placeholder="z.B. 500"
                      className="flex-1 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy"
                    />
                    <Button
                      variant="ghost" size="icon" ariaLabel="Stufe entfernen"
                      onClick={() => removeStaffelRow(i)} iconLeft={<Trash2Icon width={15} height={15} />}
                    />
                  </div>
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={addStaffelRow} iconLeft={<PlusIcon className="w-4 h-4" />}>
                Stufe hinzufügen
              </Button>
              <div className="flex gap-3 pt-2">
                <Button variant="ghost" fullWidth onClick={() => setStaffelFor(null)}>Abbrechen</Button>
                <Button variant="navy" fullWidth loading={staffelSaving} onClick={saveStaffel}>Speichern</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Billing-Drawer */}
        {openPartnerId && (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-claimondo-navy/40"
            onClick={closeDrawer}
          >
            <div
              className="relative w-full max-w-3xl bg-white h-full overflow-y-auto p-6 rounded-l-ios-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <CloseButton onPress={closeDrawer} />
              <h2 className="text-claimondo-navy font-semibold text-lg mb-6 pr-12">
                {maklers.find((m) => m.id === openPartnerId)?.firma ?? 'Makler'} — Abrechnung
              </h2>
              {drawerPending && !drawerData && (
                <p className="text-claimondo-ondo text-sm">Wird geladen…</p>
              )}
              {drawerData && (
                <PartnerBillingPanel
                  rows={drawerData.rows}
                  aggregat={drawerData.aggregat}
                  gutschriftDocsByLedger={drawerData.gutschriftDocsByLedger}
                  ustToggle={{
                    partnerTyp: 'makler',
                    partnerId: openPartnerId,
                    current: drawerData.istKleinunternehmer,
                  }}
                  steuerdaten={{
                    partnerTyp: 'makler',
                    partnerId: openPartnerId,
                    current: drawerData.steuerdaten ?? { ust_id: null, adresse_strasse: null, adresse_plz: null, adresse_ort: null },
                    readOnly: true,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
