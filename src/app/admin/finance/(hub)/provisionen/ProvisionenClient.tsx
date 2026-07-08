'use client'

// AAR-92: Maik-Provisionen Client UI mit Inline-CPL + Confirm/Reverse
// Task-11: USt-Status-Toggle fuer Maik (marketing_partner).
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UsersIcon, ClockIcon, CheckCircle2Icon, WalletIcon } from 'lucide-react'
import { setCpl, confirmProvision, reverseProvision, markMonthAsPaid } from './actions'
import { setzePartnerUstStatus, setzePartnerSteuerdaten, getPartnerGutschriftDownloadUrl } from '@/lib/finance/partner-billing-actions'
import PageHeader from '@/components/shared/PageHeader'
import { StatCard } from '@/components/shared/StatCard'
import { Button } from '@/components/primitives/Button'
import { SectionCard } from '@/components/shared/SectionCard'
import { TextField } from '@/components/shared/forms/TextField'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { PROVISION_STATUS_COLORS, PROVISION_STATUS_LABELS } from '@/lib/statusLabels'

// Fix 2: Per-Zeile Loading-State fuer Gutschrift-Download — verhindert dass
// alle Zeilen gleichzeitig laden wenn eine geklickt wird.
function MaikGutschriftButton({ provisionId }: { provisionId: string }) {
  const [pending, startTransition] = useTransition()
  const [fehler, setFehler] = useState<string | null>(null)

  function handleClick() {
    setFehler(null)
    startTransition(async () => {
      const res = await getPartnerGutschriftDownloadUrl('provisionen_maik', provisionId)
      if (res.ok) {
        window.open(res.url, '_blank')
      } else {
        setFehler(res.error)
      }
    })
  }

  return (
    <>
      <Button size="sm" variant="ghost" loading={pending} onClick={handleClick}>
        Gutschrift ↓
      </Button>
      {fehler && (
        <span className="ml-1 rounded-ios-sm bg-danger-soft px-2 py-0.5 text-xs text-danger-strong">
          {fehler}
        </span>
      )}
    </>
  )
}

type Provision = {
  id: string
  lead_id: string
  monat: string
  basis_provision: number
  cpl_actual: number | null
  netto_provision: number
  status: string
  source_channel: string | null
  reversed_grund: string | null
  created_at: string
  paid_at: string | null
  leads: { vorname: string | null; nachname: string | null; source_channel: string | null } | { vorname: string | null; nachname: string | null; source_channel: string | null }[] | null
}

type Props = {
  provisionen: Provision[]
  monat: string
  months: string[]
  kpi: { total: number; pending: number; confirmed: number; sumPending: number; sumConfirmed: number }
  /** Maik-marketing_partner-Zeile fuer USt-Toggle + Steuerdaten. null wenn Tabelle leer. */
  maik: {
    id: string
    istKleinunternehmer: boolean | null
    steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null }
  } | null
}

export default function ProvisionenClient({ provisionen, monat, months, kpi, maik }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<Record<string, string>>({})

  // USt-Toggle fuer Maik
  const [maikUstPending, startMaikUstTransition] = useTransition()
  const [maikUstMeldung, setMaikUstMeldung] = useState<{ ok: boolean; error?: string } | null>(null)
  const [maikUstAktuell, setMaikUstAktuell] = useState<boolean | null>(maik?.istKleinunternehmer ?? null)

  function handleMaikUstToggle(value: boolean) {
    if (!maik) return
    setMaikUstMeldung(null)
    startMaikUstTransition(async () => {
      const result = await setzePartnerUstStatus('marketing', maik.id, value)
      setMaikUstMeldung(result)
      if (result.ok) setMaikUstAktuell(value)
    })
  }

  // Steuerdaten fuer Maik
  const [maikStUstId, setMaikStUstId] = useState(maik?.steuerdaten?.ust_id ?? '')
  const [maikStStrasse, setMaikStStrasse] = useState(maik?.steuerdaten?.adresse_strasse ?? '')
  const [maikStPlz, setMaikStPlz] = useState(maik?.steuerdaten?.adresse_plz ?? '')
  const [maikStOrt, setMaikStOrt] = useState(maik?.steuerdaten?.adresse_ort ?? '')
  const [maikSteuerdatenPending, startMaikSteuerdatenTransition] = useTransition()
  const [maikSteuerdatenMeldung, setMaikSteuerdatenMeldung] = useState<{ ok: boolean; error?: string } | null>(null)

  function handleMaikSteuerdatenSpeichern() {
    if (!maik) return
    setMaikSteuerdatenMeldung(null)
    startMaikSteuerdatenTransition(async () => {
      const result = await setzePartnerSteuerdaten('marketing', maik.id, {
        ust_id: maikStUstId,
        adresse_strasse: maikStStrasse,
        adresse_plz: maikStPlz,
        adresse_ort: maikStOrt,
      })
      setMaikSteuerdatenMeldung(result)
    })
  }

  function handleSetCpl(id: string) {
    const val = parseFloat(editing[id])
    if (isNaN(val)) return
    startTransition(async () => {
      await setCpl(id, val)
      setEditing(p => { const next = { ...p }; delete next[id]; return next })
    })
  }

  function handleConfirm(id: string) {
    startTransition(async () => { await confirmProvision(id) })
  }

  function handleReverse(id: string) {
    const grund = window.prompt('Grund für Reversion?')
    if (!grund) return
    startTransition(async () => { await reverseProvision(id, grund) })
  }

  // AAR-153: Bulk-Auszahlung pro Monat — markiert alle confirmed als paid.
  function handleMarkMonthPaid() {
    if (kpi.confirmed === 0) return
    const ok = window.confirm(
      `Alle ${kpi.confirmed} bestätigten Provisionen im Monat ${monat} als bezahlt markieren (${kpi.sumConfirmed.toFixed(2)} €)?`,
    )
    if (!ok) return
    startTransition(async () => {
      const r = await markMonthAsPaid(monat)
      if (!r.success && r.error) window.alert(`Fehler: ${r.error}`)
      else router.refresh()
    })
  }

  return (
    <div className="py-6 space-y-6">
      <PageHeader
        title="Maik-Provisionen (Google Ads)"
        description="150 € pro Lead minus tatsächlicher CPL. CPL aus Google-Ads-Reports nachtragen."
        size="lg"
        actions={
          /* AAR-153: „Als bezahlt markieren"-Button pro Monat */
          <button
            type="button"
            disabled={pending || kpi.confirmed === 0}
            onClick={handleMarkMonthPaid}
            className="px-4 py-2 rounded-ios-xl bg-claimondo-shield text-white text-sm font-medium hover:bg-claimondo-ondo disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            title={
              kpi.confirmed === 0
                ? 'Keine bestätigten Provisionen in diesem Monat'
                : `Alle ${kpi.confirmed} bestätigten Einträge als bezahlt markieren`
            }
          >
            {pending ? 'Wird gespeichert...' : `Als bezahlt markieren (${kpi.confirmed})`}
          </button>
        }
      />

      {/* Monatsfilter */}
      <div className="flex gap-2 flex-wrap">
        {months.map(m => (
          <Link key={m} href={`/admin/finance/provisionen?monat=${m}`}
            className={`text-xs font-medium px-3 py-1.5 rounded-ios-lg transition-colors ${
              monat === m ? 'bg-claimondo-navy text-white' : 'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
            }`}>
            {m}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard size="sm" icon={UsersIcon} tone="ondo" label="Leads" value={String(kpi.total)} />
        <StatCard size="sm" icon={ClockIcon} tone="warning" label="Pending" value={`${kpi.pending} (${kpi.sumPending.toFixed(2)}€)`} />
        <StatCard size="sm" icon={CheckCircle2Icon} tone="success" label="Bestätigt" value={`${kpi.confirmed} (${kpi.sumConfirmed.toFixed(2)}€)`} />
        <StatCard size="sm" icon={WalletIcon} tone="ondo" label="Auszahlbar" value={`${kpi.sumConfirmed.toFixed(2)}€`} />
      </div>

      {/* USt-Status Maik */}
      {maik && (
        <SectionCard title="USt-Status Maik">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-claimondo-navy">
              {maikUstAktuell === true
                ? 'Aktuell: USt-pflichtig'
                : maikUstAktuell === false
                  ? 'Aktuell: Kleinunternehmer'
                  : 'Aktuell: Unbekannt'}
            </span>
            <Button
              size="sm"
              variant={maikUstAktuell === true ? 'ghost' : 'navy'}
              loading={maikUstPending}
              onClick={() => handleMaikUstToggle(true)}
            >
              USt-pflichtig
            </Button>
            <Button
              size="sm"
              variant={maikUstAktuell === false ? 'ghost' : 'navy'}
              loading={maikUstPending}
              onClick={() => handleMaikUstToggle(false)}
            >
              Kleinunternehmer
            </Button>
            {maikUstMeldung && (
              maikUstMeldung.ok
                ? <span className="rounded-ios-sm bg-success-soft px-2 py-0.5 text-xs text-success-strong">Gespeichert</span>
                : <span className="rounded-ios-sm bg-danger-soft px-2 py-0.5 text-xs text-danger-strong">{maikUstMeldung.error ?? 'Fehler'}</span>
            )}
          </div>
        </SectionCard>
      )}

      {/* Steuerdaten Maik */}
      {maik && (
        <SectionCard title="Steuerdaten des Partners">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField
                label="USt-IdNr."
                value={maikStUstId}
                onChange={(e) => setMaikStUstId(e.target.value)}
                placeholder="DE123456789"
              />
              <TextField
                label="Straße"
                value={maikStStrasse}
                onChange={(e) => setMaikStStrasse(e.target.value)}
                placeholder="Musterstraße 1"
              />
              <TextField
                label="PLZ"
                value={maikStPlz}
                onChange={(e) => setMaikStPlz(e.target.value)}
                placeholder="50667"
              />
              <TextField
                label="Ort"
                value={maikStOrt}
                onChange={(e) => setMaikStOrt(e.target.value)}
                placeholder="Köln"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="navy"
                loading={maikSteuerdatenPending}
                onClick={handleMaikSteuerdatenSpeichern}
              >
                Speichern
              </Button>
              {maikSteuerdatenMeldung && (
                maikSteuerdatenMeldung.ok
                  ? <span className="rounded-ios-sm bg-success-soft px-2 py-0.5 text-xs text-success-strong">Gespeichert</span>
                  : <span className="rounded-ios-sm bg-danger-soft px-2 py-0.5 text-xs text-danger-strong">{maikSteuerdatenMeldung.error ?? 'Fehler'}</span>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* Tabelle */}
      <DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md">
        <Table className="min-w-[800px]">
          <Thead>
            <Tr>
              <Th className="text-left font-bold !py-2">Lead</Th>
              <Th className="text-left font-bold !py-2">Quelle</Th>
              <Th className="text-left font-bold !py-2">Basis</Th>
              <Th className="text-left font-bold !py-2">CPL</Th>
              <Th className="text-left font-bold !py-2">Netto</Th>
              <Th className="text-left font-bold !py-2">Status</Th>
              <Th className="text-left font-bold !py-2">Aktion</Th>
            </Tr>
          </Thead>
          <Tbody>
            {provisionen.map(p => {
              const leadJoin = Array.isArray(p.leads) ? p.leads[0] : p.leads
              const name = [leadJoin?.vorname, leadJoin?.nachname].filter(Boolean).join(' ') || p.lead_id.slice(0, 8)
              return (
                <Tr key={p.id}>
                  <Td>
                    <Link href={`/dispatch/leads/${p.lead_id}`} className="text-claimondo-ondo hover:underline font-medium">
                      {name}
                    </Link>
                  </Td>
                  <Td className="text-xs !text-claimondo-ondo">{p.source_channel ?? '—'}</Td>
                  <Td className="tabular-nums">{Number(p.basis_provision).toFixed(2)}€</Td>
                  <Td className="tabular-nums">
                    {p.status === 'paid' || p.status === 'reversed' ? (
                      p.cpl_actual != null ? `${Number(p.cpl_actual).toFixed(2)}€` : '—'
                    ) : (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={p.cpl_actual ?? ''}
                          onChange={e => setEditing(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => editing[p.id] !== undefined && handleSetCpl(p.id)}
                          className="w-20 px-2 py-1 border rounded text-sm"
                        />
                        <span className="text-xs text-claimondo-ondo/70">€</span>
                      </div>
                    )}
                  </Td>
                  <Td className="tabular-nums font-medium">{Number(p.netto_provision ?? 0).toFixed(2)}€</Td>
                  <Td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PROVISION_STATUS_COLORS[p.status] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                      {PROVISION_STATUS_LABELS[p.status] ?? p.status}
                    </span>
                    {p.reversed_grund && <p className="text-[10px] text-claimondo-ondo/70 mt-0.5">{p.reversed_grund}</p>}
                  </Td>
                  <Td>
                    <div className="flex gap-1 flex-wrap items-center">
                      {p.status === 'pending' && p.cpl_actual != null && (
                        <button disabled={pending} onClick={() => handleConfirm(p.id)}
                          className="text-xs px-2 py-1 rounded bg-success-soft text-success-strong hover:bg-success/15 disabled:opacity-50">
                          Bestaetigen
                        </button>
                      )}
                      {p.status !== 'paid' && p.status !== 'reversed' && (
                        <button disabled={pending} onClick={() => handleReverse(p.id)}
                          className="text-xs px-2 py-1 rounded bg-danger-soft text-danger-strong hover:bg-danger/15 disabled:opacity-50">
                          Stornieren
                        </button>
                      )}
                      {p.status === 'paid' && (
                        <MaikGutschriftButton provisionId={p.id} />
                      )}
                    </div>
                  </Td>
                </Tr>
              )
            })}
            {provisionen.length === 0 && (
              <Tr><Td colSpan={7} className="py-12 text-center !text-claimondo-ondo/70 text-sm">Keine Provisionen in {monat}</Td></Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>
      {/* Reload-Trigger */}
      {pending && <p className="text-xs text-claimondo-ondo/70 text-center">Speichere…</p>}
      {!pending && <button onClick={() => router.refresh()} className="text-xs text-claimondo-ondo hover:underline">Liste aktualisieren</button>}
    </div>
  )
}

