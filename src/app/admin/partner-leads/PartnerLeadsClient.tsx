'use client'

// Partner-Vertriebsdashboard (Client). DataTable-Liste + Rolle/Status-Filter,
// "Neuer Prospect"-Modal (rollen-spezifische Felder in rollen_details) und
// Detail-Drawer (Status/Zuweisung/Notiz editierbar + "Zu Partner konvertieren").
// Nutzt ausschliesslich Shared-Components (DataTable, StatusBadge, forms/*,
// primitives Button/Modal) — kein handgerolltes Button/Card/Table-Markup.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlusIcon, HandshakeIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  DataTableContainer,
  Table,
  Thead,
  Tbody,
  Tr,
  ClickableTr,
  Th,
  Td,
  DataTableMobileCard,
} from '@/components/shared/DataTable'
import { TextField } from '@/components/shared/forms/TextField'
import { SelectField } from '@/components/shared/forms/SelectField'
import { Chip } from '@/components/ui/Chip'
import {
  createPartnerLead,
  updatePartnerLead,
  konvertierePartnerLead,
} from './actions'
import type { PartnerLeadRow, StaffOption } from './types'
import {
  PARTNER_LEAD_STATUS,
  PARTNER_LEAD_STATUS_LABELS,
  PARTNER_LEAD_STATUS_COLORS,
  PARTNER_ROLLE_LABELS,
  PARTNER_SOURCE_CHANNEL_LABELS,
  type PartnerLeadStatus,
} from './types'
import type { PartnerRolle } from '@/lib/partner/policy'

const ROLLE_KEYS: PartnerRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function staffName(staff: StaffOption[], id: string | null): string {
  if (!id) return '—'
  return staff.find((s) => s.id === id)?.name ?? '—'
}

function StatusPill({ status }: { status: PartnerLeadStatus }) {
  return (
    <StatusBadge colorCls={PARTNER_LEAD_STATUS_COLORS[status]}>
      {PARTNER_LEAD_STATUS_LABELS[status] ?? status}
    </StatusBadge>
  )
}

export default function PartnerLeadsClient({
  leads,
  staff,
}: {
  leads: PartnerLeadRow[]
  staff: StaffOption[]
}) {
  const router = useRouter()
  const [rolleFilter, setRolleFilter] = useState<'alle' | PartnerRolle>('alle')
  const [statusFilter, setStatusFilter] = useState<'alle' | PartnerLeadStatus>('alle')
  const [showCreate, setShowCreate] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const filtered = useMemo(
    () =>
      leads.filter(
        (l) =>
          (rolleFilter === 'alle' || l.rolle === rolleFilter) &&
          (statusFilter === 'alle' || l.status === statusFilter),
      ),
    [leads, rolleFilter, statusFilter],
  )

  const detailLead = detailId ? leads.find((l) => l.id === detailId) ?? null : null

  return (
    <div className="h-full overflow-y-auto py-8">
      <div className="mb-6">
        <PageHeader
          title="Partner-Leads"
          description={`Vertriebs-Pipeline für Sachverständige, Werkstätten & Makler — ${leads.length} Prospect${leads.length === 1 ? '' : 's'}`}
          icon={HandshakeIcon}
          actions={
            <Button
              variant="navy"
              onClick={() => setShowCreate(true)}
              iconLeft={<PlusIcon className="w-4 h-4" />}
            >
              Neuer Prospect
            </Button>
          }
        />
      </div>

      {/* Filter: Rolle + Status */}
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Rolle</span>
          <Chip variant={rolleFilter === 'alle' ? 'selected' : 'default'} onClick={() => setRolleFilter('alle')}>
            Alle
          </Chip>
          {ROLLE_KEYS.map((r) => (
            <Chip
              key={r}
              variant={rolleFilter === r ? 'selected' : 'default'}
              count={leads.filter((l) => l.rolle === r).length}
              onClick={() => setRolleFilter(r)}
            >
              {PARTNER_ROLLE_LABELS[r]}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Status</span>
          <Chip variant={statusFilter === 'alle' ? 'selected' : 'default'} onClick={() => setStatusFilter('alle')}>
            Alle
          </Chip>
          {PARTNER_LEAD_STATUS.map((s) => (
            <Chip
              key={s}
              variant={statusFilter === s ? 'selected' : 'default'}
              count={leads.filter((l) => l.status === s).length}
              onClick={() => setStatusFilter(s)}
            >
              {PARTNER_LEAD_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
      </div>

      <DataTableContainer
        variant="plain"
        className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden"
        mobileCards={
          filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-claimondo-ondo">
              Keine Prospects im aktuellen Filter.
            </div>
          ) : (
            filtered.map((lead) => (
              <DataTableMobileCard key={lead.id} onClick={() => setDetailId(lead.id)}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-claimondo-navy truncate">{lead.firma ?? '—'}</p>
                    <p className="text-xs text-claimondo-ondo truncate">
                      {PARTNER_ROLLE_LABELS[lead.rolle]} · {lead.ort ?? '—'}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <StatusPill status={lead.status} />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-claimondo-ondo truncate">
                    {PARTNER_SOURCE_CHANNEL_LABELS[lead.source_channel] ?? lead.source_channel} ·{' '}
                    {formatDatum(lead.erstellt_am)}
                  </span>
                  {lead.konvertiert_zu_user_id && (
                    <span className="text-[11px] font-medium text-success-strong">✓ Konvertiert</span>
                  )}
                </div>
              </DataTableMobileCard>
            ))
          )
        }
      >
        <Table>
          <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
            <Tr className="border-b border-claimondo-border">
              <Th className="text-left text-claimondo-ondo!">Firma</Th>
              <Th className="text-left text-claimondo-ondo!">Rolle</Th>
              <Th className="text-left text-claimondo-ondo!">Status</Th>
              <Th className="text-left text-claimondo-ondo!">Quelle</Th>
              <Th className="text-left text-claimondo-ondo!">Zugewiesen an</Th>
              <Th className="text-left text-claimondo-ondo!">Erstellt</Th>
            </Tr>
          </Thead>
          <Tbody className="divide-y-0!">
            {filtered.map((lead) => (
              <ClickableTr
                key={lead.id}
                onClick={() => setDetailId(lead.id)}
                className="border-b border-claimondo-border/50"
              >
                <Td>
                  <div className="text-claimondo-navy font-medium">{lead.firma ?? '—'}</div>
                  {(lead.ansprechpartner_vorname || lead.ansprechpartner_nachname) && (
                    <div className="text-claimondo-ondo text-xs">
                      {[lead.ansprechpartner_vorname, lead.ansprechpartner_nachname].filter(Boolean).join(' ')}
                    </div>
                  )}
                  {lead.konvertiert_zu_user_id && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success-soft text-success-strong">
                      Konvertiert
                    </span>
                  )}
                </Td>
                <Td>
                  <span className="text-claimondo-navy text-sm">{PARTNER_ROLLE_LABELS[lead.rolle]}</span>
                </Td>
                <Td>
                  <StatusPill status={lead.status} />
                </Td>
                <Td>
                  <span className="text-claimondo-ondo text-sm">
                    {PARTNER_SOURCE_CHANNEL_LABELS[lead.source_channel] ?? lead.source_channel}
                  </span>
                </Td>
                <Td>
                  <span className="text-claimondo-ondo text-sm">{staffName(staff, lead.zugewiesen_an)}</span>
                </Td>
                <Td>
                  <span className="text-claimondo-ondo text-sm">{formatDatum(lead.erstellt_am)}</span>
                </Td>
              </ClickableTr>
            ))}
            {filtered.length === 0 && (
              <Tr>
                <Td colSpan={6} className="py-12! text-center text-claimondo-ondo!">
                  Keine Prospects im aktuellen Filter.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>

      <CreateProspectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          router.refresh()
        }}
      />

      <DetailDrawer
        key={detailId ?? 'none'}
        lead={detailLead}
        staff={staff}
        onClose={() => setDetailId(null)}
        onChanged={() => router.refresh()}
      />
    </div>
  )
}

// ─── Create-Modal ────────────────────────────────────────────────────────────

function CreateProspectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}) {
  const [rolle, setRolle] = useState<PartnerRolle>('sachverstaendiger')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)

    // Rollen-spezifische Felder in rollen_details buendeln.
    const rollen_details: Record<string, unknown> = {}
    const datNr = String(fd.get('datNr') ?? '').trim()
    const ihk = String(fd.get('ihk') ?? '').trim()
    if (rolle === 'sachverstaendiger' && datNr) rollen_details.datNr = datNr
    if (rolle === 'makler' && ihk) rollen_details.ihk = ihk

    try {
      const result = await createPartnerLead({
        rolle,
        firma: String(fd.get('firma') ?? ''),
        ansprechpartner_vorname: String(fd.get('ansprechpartner_vorname') ?? ''),
        ansprechpartner_nachname: String(fd.get('ansprechpartner_nachname') ?? ''),
        email: String(fd.get('email') ?? ''),
        telefon: String(fd.get('telefon') ?? ''),
        plz: String(fd.get('plz') ?? ''),
        ort: String(fd.get('ort') ?? ''),
        rollen_details,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Prospect angelegt.')
      onCreated()
    } catch {
      toast.error('Anlegen fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidth={560} ariaLabel="Neuer Prospect">
      <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Neuer Prospect</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <SelectField
          label="Rolle"
          name="rolle"
          value={rolle}
          onChange={(e) => setRolle(e.target.value as PartnerRolle)}
          options={ROLLE_KEYS.map((r) => ({ value: r, label: PARTNER_ROLLE_LABELS[r] }))}
        />
        <TextField label="Firma" name="firma" required placeholder="z.B. Muster Gutachten GmbH" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Ansprechpartner Vorname" name="ansprechpartner_vorname" placeholder="Max" />
          <TextField label="Ansprechpartner Nachname" name="ansprechpartner_nachname" placeholder="Mustermann" />
        </div>
        <TextField label="E-Mail" name="email" type="email" required placeholder="kontakt@beispiel.de" />
        <TextField label="Telefon (optional)" name="telefon" type="tel" placeholder="+49 221 …" />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="PLZ (optional)" name="plz" placeholder="50667" />
          <TextField label="Ort (optional)" name="ort" placeholder="Köln" />
        </div>

        {/* Rollen-spezifische Felder */}
        {rolle === 'sachverstaendiger' && (
          <TextField label="DAT-Expert-Nr. (optional)" name="datNr" placeholder="z.B. 123456" />
        )}
        {rolle === 'makler' && (
          <TextField label="IHK-Registrierungsnr. (optional)" name="ihk" placeholder="z.B. D-XXXX-XXXXX-XX" />
        )}
        {rolle === 'werkstatt' && (
          <p className="text-xs text-claimondo-shield">
            Für Werkstätten sind keine zusätzlichen Nachweise erforderlich.
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={onClose} type="button">
            Abbrechen
          </Button>
          <Button variant="navy" fullWidth type="submit" loading={loading} disabled={loading}>
            Anlegen
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Detail-Drawer ───────────────────────────────────────────────────────────

function DetailDrawer({
  lead,
  staff,
  onClose,
  onChanged,
}: {
  lead: PartnerLeadRow | null
  staff: StaffOption[]
  onClose: () => void
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)

  // Lokaler Editier-State — key-remount via lead.id sorgt fuer frische Werte.
  const [status, setStatus] = useState<PartnerLeadStatus>(lead?.status ?? 'neu')
  const [zugewiesen, setZugewiesen] = useState<string>(lead?.zugewiesen_an ?? '')
  const [notiz, setNotiz] = useState<string>(lead?.notiz ?? '')

  if (!lead) return null

  const bereitsKonvertiert = Boolean(lead.konvertiert_zu_user_id)

  async function handleSave() {
    if (!lead) return
    setSaving(true)
    try {
      const result = await updatePartnerLead(lead.id, {
        status,
        zugewiesen_an: zugewiesen || null,
        notiz,
      })
      if (!result.ok) {
        toast.error(result.error ?? 'Speichern fehlgeschlagen')
        return
      }
      toast.success('Gespeichert.')
      onChanged()
    } catch {
      toast.error('Speichern fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  async function handleConvert() {
    if (!lead) return
    setConverting(true)
    try {
      const result = await konvertierePartnerLead(lead.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Prospect zu Partner konvertiert.')
      onChanged()
      onClose()
    } catch {
      toast.error('Konvertierung fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setConverting(false)
    }
  }

  const details = (lead.rollen_details ?? {}) as Record<string, unknown>
  const detailEntries = Object.entries(details).filter(
    ([, v]) => typeof v === 'string' && v.trim().length > 0,
  ) as [string, string][]

  return (
    <Modal open onClose={onClose} maxWidth={560} ariaLabel="Prospect-Details">
      <div key={lead.id}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-claimondo-navy font-semibold text-lg">{lead.firma ?? '—'}</h2>
            <p className="text-sm text-claimondo-ondo">
              {PARTNER_ROLLE_LABELS[lead.rolle]} ·{' '}
              {PARTNER_SOURCE_CHANNEL_LABELS[lead.source_channel] ?? lead.source_channel}
            </p>
          </div>
          <StatusPill status={lead.status} />
        </div>

        {/* Read-only Stammdaten */}
        <dl className="mb-4 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Feld label="Ansprechpartner">
            {[lead.ansprechpartner_vorname, lead.ansprechpartner_nachname].filter(Boolean).join(' ') || '—'}
          </Feld>
          <Feld label="E-Mail">
            <a href={`mailto:${lead.email}`} className="text-claimondo-ondo hover:underline">
              {lead.email}
            </a>
          </Feld>
          <Feld label="Telefon">
            {lead.telefon ? (
              <a href={`tel:${lead.telefon}`} className="text-claimondo-ondo hover:underline">
                {lead.telefon}
              </a>
            ) : (
              '—'
            )}
          </Feld>
          <Feld label="Ort">{[lead.plz, lead.ort].filter(Boolean).join(' ') || '—'}</Feld>
          <Feld label="Erstellt">{formatDatum(lead.erstellt_am)}</Feld>
          <Feld label="Aktualisiert">{formatDatum(lead.aktualisiert_am)}</Feld>
          {detailEntries.map(([k, v]) => (
            <Feld key={k} label={k}>
              <span className="font-mono text-xs">{v}</span>
            </Feld>
          ))}
        </dl>

        {/* Editierbar */}
        <div className="space-y-3 border-t border-claimondo-border pt-4">
          <SelectField
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as PartnerLeadStatus)}
            options={PARTNER_LEAD_STATUS.map((s) => ({ value: s, label: PARTNER_LEAD_STATUS_LABELS[s] }))}
          />
          <SelectField
            label="Zugewiesen an"
            value={zugewiesen}
            onChange={(e) => setZugewiesen(e.target.value)}
          >
            <option value="">— Niemand —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-claimondo-shield">Notiz</label>
            <textarea
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={4}
              placeholder="Triage-Notizen, Telefonat-Zusammenfassung…"
              className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
            />
          </div>
        </div>

        {/* Konvertierung */}
        <div className="mt-4 border-t border-claimondo-border pt-4">
          {bereitsKonvertiert ? (
            <div className="rounded-ios-md bg-success-soft px-3 py-2.5 text-sm text-success-strong">
              ✓ Konvertiert{lead.konvertiert_am ? ` am ${formatDatum(lead.konvertiert_am)}` : ''}
            </div>
          ) : (
            <Button
              variant="success"
              fullWidth
              onClick={handleConvert}
              loading={converting}
              disabled={converting || saving}
            >
              Zu Partner konvertieren
            </Button>
          )}
        </div>

        <div className="mt-4 flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose} type="button">
            Schließen
          </Button>
          <Button variant="navy" fullWidth onClick={handleSave} loading={saving} disabled={saving || converting}>
            Speichern
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Feld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-claimondo-ondo">{label}</dt>
      <dd className="text-claimondo-navy">{children}</dd>
    </div>
  )
}
