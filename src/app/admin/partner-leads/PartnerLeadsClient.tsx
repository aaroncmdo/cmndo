'use client'

// Partner-Vertriebsdashboard (Client). DataTable-Liste + Rolle/Status-Filter,
// "Neuer Prospect"-Modal (rollen-spezifische Felder in rollen_details) und
// Detail-Drawer (Status/Zuweisung/Notiz editierbar + "Zu Partner konvertieren").
// Nutzt ausschliesslich Shared-Components (DataTable, StatusBadge, forms/*,
// primitives Button/Modal) — kein handgerolltes Button/Card/Table-Markup.

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useUrlDrawerParam } from '@/lib/navigation/use-url-drawer-param'
import { toast } from 'sonner'
import {
  PlusIcon,
  HandshakeIcon,
  Phone,
  StickyNote,
  Mail,
  ArrowRightLeft,
  Flame,
  MoreHorizontal,
  Upload,
  Search,
  type LucideIcon,
} from 'lucide-react'
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
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { Chip } from '@/components/ui/Chip'
import {
  createPartnerLead,
  updatePartnerLead,
  konvertierePartnerLead,
  protokolliereAktivitaet,
  legePartnerOnboardingTermin,
} from './actions'
import CsvImportPanel from './CsvImportPanel'
import ScrapePanel from './ScrapePanel'
import { formatTerminZeitpunkt, type OnboardingTerminKanal } from '@/lib/partner/onboarding-termin'
import type { PartnerLeadRow, StaffOption, PartnerLeadAktivitaetRow, PartnerOnboardingTerminRow } from './types'
import {
  PARTNER_LEAD_STATUS,
  PARTNER_LEAD_STATUS_LABELS,
  PARTNER_LEAD_STATUS_COLORS,
  PARTNER_LEAD_EINSTUFUNG,
  PARTNER_LEAD_EINSTUFUNG_LABELS,
  PARTNER_LEAD_EINSTUFUNG_COLORS,
  PARTNER_AKTIVITAET_MANUELL,
  PARTNER_AKTIVITAET_TYP_LABELS,
  PARTNER_ROLLE_LABELS,
  PARTNER_SOURCE_CHANNEL_LABELS,
  type PartnerLeadStatus,
  type PartnerLeadEinstufung,
  type PartnerAktivitaetTyp,
} from './types'
import type { PartnerRolle } from '@/lib/partner/policy'

const ROLLE_KEYS: PartnerRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']

// Einstufungs-Filter: die drei Werte + explizit "uneingestuft" (einstufung null).
type EinstufungFilter = 'alle' | PartnerLeadEinstufung | 'uneingestuft'

// Icon je Aktivitaets-Typ (Timeline).
const AKTIVITAET_ICON: Record<PartnerAktivitaetTyp, LucideIcon> = {
  anruf: Phone,
  notiz: StickyNote,
  email: Mail,
  status_aenderung: ArrowRightLeft,
  einstufung: Flame,
  sonstiges: MoreHorizontal,
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Relatives Datum fuer die Timeline ("vor 3 Std.", "gestern", sonst Datum).
function formatRelativ(iso: string): string {
  const then = new Date(iso).getTime()
  const diffMin = Math.round((Date.now() - then) / 60000)
  if (diffMin < 1) return 'gerade eben'
  if (diffMin < 60) return `vor ${diffMin} Min.`
  const diffStd = Math.round(diffMin / 60)
  if (diffStd < 24) return `vor ${diffStd} Std.`
  const diffTage = Math.round(diffStd / 24)
  if (diffTage === 1) return 'gestern'
  if (diffTage < 7) return `vor ${diffTage} Tagen`
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

function LeadStatusPill({ status }: { status: PartnerLeadStatus }) {
  return (
    <StatusBadge colorCls={PARTNER_LEAD_STATUS_COLORS[status]}>
      {PARTNER_LEAD_STATUS_LABELS[status] ?? status}
    </StatusBadge>
  )
}

function EinstufungPill({ einstufung }: { einstufung: PartnerLeadEinstufung | null }) {
  if (!einstufung) {
    return <span className="text-xs text-claimondo-shield">Uneingestuft</span>
  }
  return (
    <StatusBadge colorCls={PARTNER_LEAD_EINSTUFUNG_COLORS[einstufung]}>
      {PARTNER_LEAD_EINSTUFUNG_LABELS[einstufung]}
    </StatusBadge>
  )
}

export default function PartnerLeadsClient({
  leads,
  staff,
  aktivitaeten,
  termine,
}: {
  leads: PartnerLeadRow[]
  staff: StaffOption[]
  aktivitaeten: PartnerLeadAktivitaetRow[]
  termine: PartnerOnboardingTerminRow[]
}) {
  const router = useRouter()
  const [rolleFilter, setRolleFilter] = useState<'alle' | PartnerRolle>('alle')
  const [statusFilter, setStatusFilter] = useState<'alle' | PartnerLeadStatus>('alle')
  const [einstufungFilter, setEinstufungFilter] = useState<EinstufungFilter>('alle')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showScrape, setShowScrape] = useState(false)
  // B1: Lead-Drawer haengt am ?lead=<id>-Param (Deep-Link oeffnet direkt, Browser-Back
  // schliesst, Filter/Scroll bleiben). Abgeleitet statt useState — die URL ist die Quelle.
  const leadDrawer = useUrlDrawerParam('lead')
  const detailId = leadDrawer.value

  // P3b (Vertrieb-Umbrella): role-aware Prefill aus der Vertrieb-Leads-Ansicht.
  // ?rolle=<sachverstaendiger|makler|werkstatt> setzt den Rolle-Filter; ?aktion=
  // <scrapen|csv|create> öffnet das passende Modal (Rolle dort vorbelegt). Ohne Query
  // = Verhalten unverändert.
  const searchParams = useSearchParams()
  useEffect(() => {
    const r = searchParams.get('rolle')
    if (r === 'sachverstaendiger' || r === 'makler' || r === 'werkstatt') setRolleFilter(r)
    const a = searchParams.get('aktion')
    if (a === 'scrapen') setShowScrape(true)
    else if (a === 'csv') setShowImport(true)
    else if (a === 'create') setShowCreate(true)
  }, [searchParams])

  const filtered = useMemo(
    () =>
      leads.filter(
        (l) =>
          (rolleFilter === 'alle' || l.rolle === rolleFilter) &&
          (statusFilter === 'alle' || l.status === statusFilter) &&
          (einstufungFilter === 'alle' ||
            (einstufungFilter === 'uneingestuft'
              ? !l.einstufung
              : l.einstufung === einstufungFilter)),
      ),
    [leads, rolleFilter, statusFilter, einstufungFilter],
  )

  const detailLead = detailId ? leads.find((l) => l.id === detailId) ?? null : null

  // Aktivitaeten des offenen Leads (bereits neueste-zuerst aus page.tsx sortiert).
  const detailAktivitaeten = useMemo(
    () => (detailId ? aktivitaeten.filter((a) => a.partner_lead_id === detailId) : []),
    [aktivitaeten, detailId],
  )

  // Onboarding-Termine des offenen Leads.
  const detailTermine = useMemo(
    () => (detailId ? termine.filter((t) => t.partner_lead_id === detailId) : []),
    [termine, detailId],
  )

  return (
    <div className="h-full overflow-y-auto py-8">
      <div className="mb-6">
        <PageHeader
          title="Partner-Leads"
          description={`Vertriebs-Pipeline für Sachverständige, Werkstätten & Makler — ${leads.length} Prospect${leads.length === 1 ? '' : 's'}`}
          icon={HandshakeIcon}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowImport(true)}
                iconLeft={<Upload className="w-4 h-4" />}
              >
                CSV importieren
              </Button>
              <Button
                variant="ghost"
                onClick={() => setShowScrape(true)}
                iconLeft={<Search className="w-4 h-4" />}
              >
                Leads scrapen
              </Button>
              <Button
                variant="navy"
                onClick={() => setShowCreate(true)}
                iconLeft={<PlusIcon className="w-4 h-4" />}
              >
                Neuer Prospect
              </Button>
            </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Einstufung</span>
          <Chip
            variant={einstufungFilter === 'alle' ? 'selected' : 'default'}
            onClick={() => setEinstufungFilter('alle')}
          >
            Alle
          </Chip>
          {PARTNER_LEAD_EINSTUFUNG.map((e) => (
            <Chip
              key={e}
              variant={einstufungFilter === e ? 'selected' : 'default'}
              count={leads.filter((l) => l.einstufung === e).length}
              onClick={() => setEinstufungFilter(e)}
            >
              {PARTNER_LEAD_EINSTUFUNG_LABELS[e]}
            </Chip>
          ))}
          <Chip
            variant={einstufungFilter === 'uneingestuft' ? 'selected' : 'default'}
            count={leads.filter((l) => !l.einstufung).length}
            onClick={() => setEinstufungFilter('uneingestuft')}
          >
            Uneingestuft
          </Chip>
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
              <DataTableMobileCard key={lead.id} onClick={() => leadDrawer.open(lead.id)}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-claimondo-navy truncate">{lead.firma ?? '—'}</p>
                    <p className="text-xs text-claimondo-ondo truncate">
                      {PARTNER_ROLLE_LABELS[lead.rolle]} · {lead.ort ?? '—'}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <LeadStatusPill status={lead.status} />
                    {lead.einstufung && <EinstufungPill einstufung={lead.einstufung} />}
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
              <Th className="text-left text-claimondo-ondo!">Einstufung</Th>
              <Th className="text-left text-claimondo-ondo!">Quelle</Th>
              <Th className="text-left text-claimondo-ondo!">Zugewiesen an</Th>
              <Th className="text-left text-claimondo-ondo!">Erstellt</Th>
            </Tr>
          </Thead>
          <Tbody className="divide-y-0!">
            {filtered.map((lead) => (
              <ClickableTr
                key={lead.id}
                onClick={() => leadDrawer.open(lead.id)}
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
                  <LeadStatusPill status={lead.status} />
                </Td>
                <Td>
                  <EinstufungPill einstufung={lead.einstufung} />
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
                <Td colSpan={7} className="py-12! text-center text-claimondo-ondo!">
                  Keine Prospects im aktuellen Filter.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </DataTableContainer>

      <CreateProspectModal
        open={showCreate}
        defaultRolle={rolleFilter === 'alle' ? undefined : rolleFilter}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          router.refresh()
        }}
      />

      <ImportCsvModal
        open={showImport}
        defaultRolle={rolleFilter === 'alle' ? undefined : rolleFilter}
        onClose={() => setShowImport(false)}
        onImported={() => {
          setShowImport(false)
          router.refresh()
        }}
      />

      <ScrapeModal
        open={showScrape}
        defaultRolle={rolleFilter === 'alle' ? undefined : rolleFilter}
        onClose={() => setShowScrape(false)}
        onImported={() => {
          setShowScrape(false)
          router.refresh()
        }}
      />

      <DetailDrawer
        key={detailId ?? 'none'}
        lead={detailLead}
        staff={staff}
        aktivitaeten={detailAktivitaeten}
        termine={detailTermine}
        onClose={leadDrawer.close}
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
  defaultRolle,
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
  defaultRolle?: PartnerRolle
}) {
  const [rolle, setRolle] = useState<PartnerRolle>(defaultRolle ?? 'sachverstaendiger')
  useEffect(() => {
    if (open && defaultRolle) setRolle(defaultRolle)
  }, [open, defaultRolle])
  const [loading, setLoading] = useState(false)
  // P3 Ortseingaben: PLZ/Ort controlled (Autocomplete-Befüllung sichtbar); fd.get liest sie via name.
  const [adr, setAdr] = useState({ plz: '', ort: '' })

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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="adr-partnerleadsclient" className="text-xs font-semibold text-claimondo-shield">Adresse suchen (füllt PLZ + Ort)</label>
          {/* P3 Ortseingaben: Autocomplete füllt PLZ + Ort. Felder bleiben editierbar (name → FormData). */}
          <GooglePlaceAutocomplete
            id="adr-partnerleadsclient"
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
            placeholder="Straße, PLZ, Ort eingeben…"
            onSelect={(r) => setAdr((a) => ({ plz: r.plz || a.plz, ort: r.stadt || a.ort }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="PLZ (optional)" name="plz" value={adr.plz} onChange={(e) => setAdr((a) => ({ ...a, plz: e.target.value }))} placeholder="50667" />
          <TextField label="Ort (optional)" name="ort" value={adr.ort} onChange={(e) => setAdr((a) => ({ ...a, ort: e.target.value }))} placeholder="Köln" />
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

// ─── CSV-Import-Modal ─────────────────────────────────────────────────────────

function ImportCsvModal({
  open,
  onClose,
  onImported,
  defaultRolle,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
  defaultRolle?: PartnerRolle
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={680} ariaLabel="CSV importieren">
      <CsvImportPanel
        onClose={onClose}
        onImported={onImported}
        defaultRolle={defaultRolle}
      />
    </Modal>
  )
}

// ─── Detail-Drawer ───────────────────────────────────────────────────────────

function DetailDrawer({
  lead,
  staff,
  aktivitaeten,
  termine,
  onClose,
  onChanged,
}: {
  lead: PartnerLeadRow | null
  staff: StaffOption[]
  aktivitaeten: PartnerLeadAktivitaetRow[]
  termine: PartnerOnboardingTerminRow[]
  onClose: () => void
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [showTermin, setShowTermin] = useState(false)

  // Lokaler Editier-State — key-remount via lead.id sorgt fuer frische Werte.
  const [status, setStatus] = useState<PartnerLeadStatus>(lead?.status ?? 'neu')
  const [einstufung, setEinstufung] = useState<'' | PartnerLeadEinstufung>(lead?.einstufung ?? '')
  const [zugewiesen, setZugewiesen] = useState<string>(lead?.zugewiesen_an ?? '')
  const [notiz, setNotiz] = useState<string>(lead?.notiz ?? '')
  // Kontakt-Anreicherung (die DAT-Import-Leads haben keine Kontaktdaten).
  const [email, setEmail] = useState<string>(lead?.email ?? '')
  const [telefon, setTelefon] = useState<string>(lead?.telefon ?? '')
  const [apVorname, setApVorname] = useState<string>(lead?.ansprechpartner_vorname ?? '')
  const [apNachname, setApNachname] = useState<string>(lead?.ansprechpartner_nachname ?? '')

  if (!lead) return null

  const bereitsKonvertiert = Boolean(lead.konvertiert_zu_user_id)
  // Convert-Guard-Spiegel im UI: ohne E-Mail keine Konvertierung (anlegePartnerKern
  // braucht sie fuer createUser). Bezieht sich auf den gespeicherten Wert.
  const hatEmail = Boolean(lead.email?.trim())

  async function handleSave() {
    if (!lead) return
    setSaving(true)
    try {
      const result = await updatePartnerLead(lead.id, {
        status,
        einstufung: einstufung || null,
        zugewiesen_an: zugewiesen || null,
        notiz,
        email: email.trim() || null,
        telefon: telefon.trim() || null,
        ansprechpartner_vorname: apVorname.trim() || null,
        ansprechpartner_nachname: apNachname.trim() || null,
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
    <Modal open onClose={onClose} maxWidth={620} ariaLabel="Prospect-Details">
      <div key={lead.id}>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-claimondo-navy font-semibold text-lg">{lead.firma ?? '—'}</h2>
            <p className="text-sm text-claimondo-ondo">
              {PARTNER_ROLLE_LABELS[lead.rolle]} ·{' '}
              {PARTNER_SOURCE_CHANNEL_LABELS[lead.source_channel] ?? lead.source_channel}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <LeadStatusPill status={lead.status} />
            <EinstufungPill einstufung={lead.einstufung} />
          </div>
        </div>

        {/* Read-only Stammdaten (Kontakt weiter unten editierbar) */}
        <dl className="mb-4 grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          <Feld label="Ort">{[lead.plz, lead.ort].filter(Boolean).join(' ') || '—'}</Feld>
          <Feld label="Erstellt">{formatDatum(lead.erstellt_am)}</Feld>
          <Feld label="Aktualisiert">{formatDatum(lead.aktualisiert_am)}</Feld>
          {detailEntries.map(([k, v]) => (
            <Feld key={k} label={k}>
              <span className="font-mono text-xs">{v}</span>
            </Feld>
          ))}
        </dl>

        {/* Kontakt-Anreicherung */}
        <div className="space-y-3 border-t border-claimondo-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Kontakt</h3>
          {!hatEmail && (
            <div className="rounded-ios-md bg-warning-soft px-3 py-2 text-xs text-warning-strong">
              Für diesen Prospect fehlen noch Kontaktdaten. Bitte E-Mail ergänzen, um konvertieren zu können.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <TextField
              label="Ansprechpartner Vorname"
              value={apVorname}
              onChange={(e) => setApVorname(e.target.value)}
              placeholder="Max"
              hint={!apVorname ? 'fehlt' : undefined}
            />
            <TextField
              label="Ansprechpartner Nachname"
              value={apNachname}
              onChange={(e) => setApNachname(e.target.value)}
              placeholder="Mustermann"
              hint={!apNachname ? 'fehlt' : undefined}
            />
          </div>
          <TextField
            label="E-Mail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kontakt@beispiel.de"
            hint={!email ? 'fehlt — für Konvertierung erforderlich' : undefined}
          />
          <TextField
            label="Telefon"
            type="tel"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            placeholder="+49 221 …"
            hint={!telefon ? 'fehlt' : undefined}
          />
        </div>

        {/* Triage (Status / Einstufung / Zuweisung / Notiz) */}
        <div className="mt-4 space-y-3 border-t border-claimondo-border pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Triage</h3>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as PartnerLeadStatus)}
              options={PARTNER_LEAD_STATUS.map((s) => ({ value: s, label: PARTNER_LEAD_STATUS_LABELS[s] }))}
            />
            <SelectField
              label="Einstufung"
              value={einstufung}
              onChange={(e) => setEinstufung(e.target.value as '' | PartnerLeadEinstufung)}
            >
              <option value="">— Uneingestuft —</option>
              {PARTNER_LEAD_EINSTUFUNG.map((e) => (
                <option key={e} value={e}>
                  {PARTNER_LEAD_EINSTUFUNG_LABELS[e]}
                </option>
              ))}
            </SelectField>
          </div>
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
              rows={3}
              placeholder="Triage-Notizen, Telefonat-Zusammenfassung…"
              className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose} type="button">
            Schließen
          </Button>
          <Button variant="navy" fullWidth onClick={handleSave} loading={saving} disabled={saving || converting}>
            Speichern
          </Button>
        </div>

        {/* Onboarding-Termine */}
        <div className="mt-6 border-t border-claimondo-border pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
              Onboarding-Termine
            </h3>
            <Button variant="ghost" onClick={() => setShowTermin(true)} disabled={saving || converting}>
              Termin legen
            </Button>
          </div>
          {termine.length === 0 ? (
            <p className="text-sm text-claimondo-shield">Noch keine Onboarding-Termine.</p>
          ) : (
            <ul className="space-y-2">
              {termine.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-medium text-claimondo-navy">{formatTerminZeitpunkt(t.start_zeit)}</span>
                    <span className="ml-2 text-xs text-claimondo-ondo">
                      {t.kanal === 'online' ? 'Video' : 'vor Ort'}
                    </span>
                  </div>
                  {t.kanal === 'online' && t.video_link ? (
                    <a
                      href={t.video_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-medium text-claimondo-ondo hover:underline"
                    >
                      Meet öffnen
                    </a>
                  ) : t.treffpunkt_adresse ? (
                    <span className="shrink-0 truncate text-xs text-claimondo-shield">{t.treffpunkt_adresse}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        <TerminModal
          open={showTermin}
          onClose={() => setShowTermin(false)}
          lead={lead}
          onCreated={onChanged}
        />

        {/* Aktivitaets-Log */}
        <div className="mt-6 border-t border-claimondo-border pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">Aktivitäten</h3>
          <AktivitaetForm leadId={lead.id} onLogged={onChanged} disabled={saving || converting} />
          <AktivitaetTimeline aktivitaeten={aktivitaeten} />
        </div>

        {/* Konvertierung */}
        <div className="mt-4 border-t border-claimondo-border pt-4">
          {bereitsKonvertiert ? (
            <div className="rounded-ios-md bg-success-soft px-3 py-2.5 text-sm text-success-strong">
              ✓ Konvertiert{lead.konvertiert_am ? ` am ${formatDatum(lead.konvertiert_am)}` : ''}
            </div>
          ) : (
            <>
              <Button
                variant="success"
                fullWidth
                onClick={handleConvert}
                loading={converting}
                disabled={converting || saving || !hatEmail}
              >
                Zu Partner konvertieren
              </Button>
              {!hatEmail && (
                <p className="mt-2 text-center text-xs text-claimondo-shield">
                  E-Mail fehlt — bitte erst Kontakt ergänzen und speichern, dann konvertieren.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

// ─── Aktivitaets-Formular (Anruf protokollieren / Notiz hinzufuegen) ──────────

function AktivitaetForm({
  leadId,
  onLogged,
  disabled,
}: {
  leadId: string
  onLogged: () => void
  disabled: boolean
}) {
  const [typ, setTyp] = useState<PartnerAktivitaetTyp>('anruf')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleLog() {
    const trimmed = text.trim()
    if (!trimmed) {
      toast.error('Bitte einen Text eingeben.')
      return
    }
    setSaving(true)
    try {
      const result = await protokolliereAktivitaet(leadId, typ, trimmed)
      if (!result.ok) {
        toast.error(result.error ?? 'Protokollieren fehlgeschlagen')
        return
      }
      toast.success('Aktivität protokolliert.')
      setText('')
      onLogged()
    } catch {
      toast.error('Protokollieren fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-4 space-y-2 rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 p-3">
      <SelectField
        label="Aktivität protokollieren"
        value={typ}
        onChange={(e) => setTyp(e.target.value as PartnerAktivitaetTyp)}
        options={PARTNER_AKTIVITAET_MANUELL.map((t) => ({
          value: t,
          label: PARTNER_AKTIVITAET_TYP_LABELS[t],
        }))}
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={
          typ === 'anruf'
            ? 'z.B. Erreicht — Interesse an Onboarding, Rückruf nächste Woche…'
            : 'Was ist passiert?'
        }
        className="w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-shield/60 focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
      />
      <Button
        variant="navy"
        onClick={handleLog}
        loading={saving}
        disabled={saving || disabled || !text.trim()}
      >
        Hinzufügen
      </Button>
    </div>
  )
}

// ─── Aktivitaets-Timeline ─────────────────────────────────────────────────────

function AktivitaetTimeline({ aktivitaeten }: { aktivitaeten: PartnerLeadAktivitaetRow[] }) {
  if (aktivitaeten.length === 0) {
    return (
      <p className="text-sm text-claimondo-shield">Noch keine Aktivitäten protokolliert.</p>
    )
  }
  return (
    <ol className="space-y-3">
      {aktivitaeten.map((a) => {
        const Icon = AKTIVITAET_ICON[a.typ] ?? MoreHorizontal
        return (
          <li key={a.id} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-claimondo-navy/[0.06] text-claimondo-ondo">
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-claimondo-navy">
                  {PARTNER_AKTIVITAET_TYP_LABELS[a.typ] ?? a.typ}
                </span>
                <span className="shrink-0 text-[11px] text-claimondo-shield">
                  {formatRelativ(a.erstellt_am)}
                </span>
              </div>
              {a.text && (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-claimondo-navy">{a.text}</p>
              )}
              <p className="mt-0.5 text-[11px] text-claimondo-shield">
                {a.erstellt_von_name ?? 'System'}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
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

// ─── Scraping-Modal (Google Places) ─────────────────────────────────────────

function ScrapeModal({
  open,
  onClose,
  onImported,
  defaultRolle,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
  defaultRolle?: PartnerRolle
}) {
  return (
    <Modal open={open} onClose={onClose} maxWidth={720} ariaLabel="Leads scrapen">
      <ScrapePanel
        onClose={onClose}
        onImported={onImported}
        defaultRolle={defaultRolle}
      />
    </Modal>
  )
}

// ─── Termin-Modal (Onboarding-Termin legen) ──────────────────────────────────

function TerminModal({
  open,
  onClose,
  lead,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  lead: PartnerLeadRow
  onCreated: () => void
}) {
  const [datum, setDatum] = useState('')
  const [kanal, setKanal] = useState<OnboardingTerminKanal>('online')
  const [treffpunkt, setTreffpunkt] = useState(
    [lead.strasse, [lead.plz, lead.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '),
  )
  const [saving, setSaving] = useState(false)

  function handleClose() {
    setDatum('')
    setKanal('online')
    setSaving(false)
    onClose()
  }

  async function handleSubmit() {
    if (!datum) {
      toast.error('Bitte Datum und Uhrzeit wählen.')
      return
    }
    const start = new Date(datum)
    if (Number.isNaN(start.getTime())) {
      toast.error('Ungültiges Datum.')
      return
    }
    if (kanal === 'vor_ort' && treffpunkt.trim().length < 4) {
      toast.error('Bitte eine Adresse für den Vor-Ort-Termin angeben.')
      return
    }
    setSaving(true)
    try {
      const res = await legePartnerOnboardingTermin(lead.id, {
        startIso: start.toISOString(),
        kanal,
        treffpunktAdresse: kanal === 'vor_ort' ? treffpunkt.trim() : undefined,
      })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      if (res.warnung) toast.warning(res.warnung)
      else toast.success('Onboarding-Termin angelegt.')
      onCreated()
      handleClose()
    } catch {
      toast.error('Termin anlegen fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} maxWidth={520} ariaLabel="Onboarding-Termin legen">
      <h2 className="text-claimondo-navy font-semibold text-lg mb-1">Onboarding-Termin legen</h2>
      <p className="text-sm text-claimondo-ondo mb-4">
        30-Minuten-Termin mit {lead.firma ?? 'dem Prospect'}. Online erzeugt automatisch einen
        Google-Meet-Link; vor Ort wird die Adresse geokodiert.
      </p>
      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-claimondo-shield">Datum &amp; Uhrzeit</label>
          <input
            type="datetime-local"
            value={datum}
            onChange={(e) => setDatum(e.target.value)}
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
          />
        </div>
        <SelectField
          label="Kanal"
          value={kanal}
          onChange={(e) => setKanal(e.target.value as OnboardingTerminKanal)}
          options={[
            { value: 'online', label: 'Online (Google Meet)' },
            { value: 'vor_ort', label: 'Vor Ort' },
          ]}
        />
        {kanal === 'vor_ort' ? (
          <TextField
            label="Treffpunkt-Adresse"
            value={treffpunkt}
            onChange={(e) => setTreffpunkt(e.target.value)}
            placeholder="Straße Nr., PLZ Ort"
          />
        ) : (
          <p className="rounded-ios-md bg-info-soft px-3 py-2 text-xs text-info-strong">
            Der Google-Meet-Link wird automatisch erzeugt (Google-Konto des Bearbeiters unter
            /admin/einstellungen/google erforderlich). Ohne Verbindung wird der Termin trotzdem
            angelegt — ohne Link.
          </p>
        )}
        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={handleClose} type="button">
            Abbrechen
          </Button>
          <Button variant="navy" fullWidth onClick={handleSubmit} loading={saving} disabled={saving || !datum}>
            Termin anlegen
          </Button>
        </div>
      </div>
    </Modal>
  )
}
