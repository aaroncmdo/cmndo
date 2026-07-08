'use client'

// Partner-Vertriebsdashboard (Client). DataTable-Liste + Rolle/Status-Filter,
// "Neuer Prospect"-Modal (rollen-spezifische Felder in rollen_details) und
// Detail-Drawer (Status/Zuweisung/Notiz editierbar + "Zu Partner konvertieren").
// Nutzt ausschliesslich Shared-Components (DataTable, StatusBadge, forms/*,
// primitives Button/Modal) — kein handgerolltes Button/Card/Table-Markup.

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  X,
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
import { Chip } from '@/components/ui/Chip'
import {
  createPartnerLead,
  updatePartnerLead,
  konvertierePartnerLead,
  protokolliereAktivitaet,
  importCsvLeads,
  schlageCsvMappingVor,
  scrapePartnerLeadsVorschau,
  importScrapedLeads,
} from './actions'
import {
  parseCsv,
  mapCsvMitMapping,
  heuristischesMapping,
  CSV_ZIEL_FELDER,
  type CsvZielFeld,
  type PartnerCsvLead,
} from '@/lib/partner/csv-import'
import type { ScrapeKandidat } from '@/lib/partner/scraping'
import type { PartnerLeadRow, StaffOption, PartnerLeadAktivitaetRow } from './types'
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
}: {
  leads: PartnerLeadRow[]
  staff: StaffOption[]
  aktivitaeten: PartnerLeadAktivitaetRow[]
}) {
  const router = useRouter()
  const [rolleFilter, setRolleFilter] = useState<'alle' | PartnerRolle>('alle')
  const [statusFilter, setStatusFilter] = useState<'alle' | PartnerLeadStatus>('alle')
  const [einstufungFilter, setEinstufungFilter] = useState<EinstufungFilter>('alle')
  const [showCreate, setShowCreate] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showScrape, setShowScrape] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

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
              <DataTableMobileCard key={lead.id} onClick={() => setDetailId(lead.id)}>
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
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false)
          router.refresh()
        }}
      />

      <ImportCsvModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => {
          setShowImport(false)
          router.refresh()
        }}
      />

      <ScrapeModal
        open={showScrape}
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

// ─── CSV-Import-Modal ─────────────────────────────────────────────────────────

// Deutsche Labels fuer die Mapping-Dropdowns.
const CSV_ZIEL_FELD_LABELS: Record<CsvZielFeld, string> = {
  firma: 'Firma',
  email: 'E-Mail',
  telefon: 'Telefon',
  ansprechpartner_vorname: 'Vorname',
  ansprechpartner_nachname: 'Nachname',
  plz: 'PLZ',
  ort: 'Ort',
  datNr: 'DAT-Nr',
  ihk: 'IHK-Nr',
  ignorieren: 'Ignorieren',
}

// Vorschau-Zustand nach dem Datei-Parsen (clientseitig, vor dem Import).
type CsvVorschau = {
  dateiName: string
  valide: PartnerCsvLead[]
  uebersprungen: number
}

// Roh-CSV-Daten fuer das Live-Mapping (Header + Datenzeilen).
type CsvRohdaten = {
  dateiName: string
  header: string[]
  rows: string[][]
}

function ImportCsvModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [rolle, setRolle] = useState<PartnerRolle>('sachverstaendiger')
  const [rohdaten, setRohdaten] = useState<CsvRohdaten | null>(null)
  const [mapping, setMapping] = useState<CsvZielFeld[]>([])
  const [mappingQuelle, setMappingQuelle] = useState<'ki' | 'heuristik' | null>(null)
  const [parseFehler, setParseFehler] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [mappingPending, startMappingTransition] = useTransition()

  function reset() {
    setRohdaten(null)
    setMapping([])
    setMappingQuelle(null)
    setParseFehler(null)
    setImporting(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleDatei(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParseFehler(null)
    setRohdaten(null)
    setMapping([])
    setMappingQuelle(null)
    try {
      const text = await file.text()
      const { header, rows } = parseCsv(text)
      if (header.length === 0) {
        setParseFehler('Die Datei enthält keine erkennbare Kopfzeile.')
        return
      }
      if (rows.length === 0) {
        setParseFehler('Keine Datenzeilen gefunden — die Datei enthält nur eine Kopfzeile.')
        return
      }
      // Heuristik sofort als Initialwert setzen (kein Flicker waehrend KI-Call).
      const initialMapping = heuristischesMapping(header)
      setMapping(initialMapping)
      setRohdaten({ dateiName: file.name, header, rows })

      // KI-Vorschlag asynchron nachladen (non-blocking per startTransition).
      startMappingTransition(async () => {
        const result = await schlageCsvMappingVor(header, rows)
        if (result.ok) {
          setMapping(result.mapping)
          setMappingQuelle(result.quelle)
        } else {
          // Heuristik-Fallback bleibt (bereits gesetzt) — kein Fehler anzeigen.
          setMappingQuelle('heuristik')
        }
      })
    } catch {
      setParseFehler('Datei konnte nicht gelesen werden — bitte eine gültige CSV-Datei wählen.')
    }
  }

  function updateMapping(idx: number, zielFeld: CsvZielFeld) {
    setMapping((prev) => {
      const next = [...prev]
      next[idx] = zielFeld
      return next
    })
  }

  // Live-Vorschau: immer aus dem aktuellen Mapping ableiten.
  const vorschau: CsvVorschau | null = rohdaten
    ? (() => {
        const { valide, uebersprungen } = mapCsvMitMapping(rohdaten.rows, mapping)
        return { dateiName: rohdaten.dateiName, valide, uebersprungen }
      })()
    : null

  const hatFirmaSpalte = mapping.includes('firma')
  const vorschauZeilen = vorschau?.valide.slice(0, 5) ?? []

  async function handleImport() {
    if (!vorschau || vorschau.valide.length === 0) return
    setImporting(true)
    try {
      const result = await importCsvLeads(rolle, vorschau.valide)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`${result.angelegt} Lead${result.angelegt === 1 ? '' : 's'} importiert.`)
      reset()
      onImported()
    } catch {
      toast.error('Import fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} maxWidth={680} ariaLabel="CSV importieren">
      <h2 className="text-claimondo-navy font-semibold text-lg mb-1">CSV importieren</h2>
      <p className="text-sm text-claimondo-ondo mb-4">
        Leads aus einer CSV-Datei für die gewählte Rolle anlegen.
      </p>

      <div className="space-y-3">
        <SelectField
          label="Rolle"
          value={rolle}
          onChange={(e) => {
            setRolle(e.target.value as PartnerRolle)
            // Rolle beeinflusst nur den Insert (nicht das Mapping) — Vorschau bleibt gueltig.
          }}
          options={ROLLE_KEYS.map((r) => ({ value: r, label: PARTNER_ROLLE_LABELS[r] }))}
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="csv-datei"
            className="text-xs font-semibold text-claimondo-shield"
          >
            CSV-Datei
          </label>
          <input
            id="csv-datei"
            type="file"
            accept=".csv,text/csv"
            onChange={handleDatei}
            className="w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy file:mr-3 file:rounded-ios-sm file:border-0 file:bg-claimondo-navy file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:cursor-pointer focus:outline-none focus:border-claimondo-ondo focus:ring-2 focus:ring-claimondo-ondo/30"
          />
          <span className="text-xs text-claimondo-shield">
            Spalten werden automatisch zugeordnet (KI-Vorschlag oder Heuristik). Nur Zeilen
            mit Firma werden importiert.
          </span>
        </div>

        {parseFehler && (
          <div className="rounded-ios-md bg-danger-soft px-3 py-2 text-xs text-danger-strong">
            {parseFehler}
          </div>
        )}

        {/* Mapping-Panel — erscheint sobald eine Datei geladen ist */}
        {rohdaten && rohdaten.header.length > 0 && (
          <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
                Spalten-Zuordnung
              </span>
              {mappingPending && (
                <span className="text-[11px] text-claimondo-shield">KI analysiert…</span>
              )}
              {!mappingPending && mappingQuelle === 'ki' && (
                <span className="inline-flex items-center rounded-full bg-claimondo-navy/[0.08] px-2 py-0.5 text-[11px] font-medium text-claimondo-navy">
                  KI-Vorschlag
                </span>
              )}
            </div>
            <div className="space-y-1.5">
              {rohdaten.header.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-xs font-medium text-claimondo-navy" title={col}>
                    {col}
                  </span>
                  <SelectField
                    label=""
                    value={mapping[i] ?? 'ignorieren'}
                    onChange={(e) => updateMapping(i, e.target.value as CsvZielFeld)}
                    options={CSV_ZIEL_FELDER.map((f) => ({
                      value: f,
                      label: CSV_ZIEL_FELD_LABELS[f],
                    }))}
                  />
                </div>
              ))}
            </div>
            {!hatFirmaSpalte && (
              <div className="mt-2 rounded-ios-sm bg-warning-soft px-3 py-2 text-xs text-warning-strong">
                Bitte mindestens eine Spalte auf „Firma" setzen — Zeilen ohne Firma werden
                übersprungen.
              </div>
            )}
          </div>
        )}

        {/* Vorschau-Tabelle */}
        {vorschau && vorschau.valide.length > 0 && (
          <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-claimondo-navy">{vorschau.dateiName}</span>
              <span className="text-success-strong">
                {vorschau.valide.length} valide{vorschau.valide.length === 1 ? 'r Lead' : ' Leads'}
              </span>
              {vorschau.uebersprungen > 0 && (
                <span className="text-warning-strong">
                  {vorschau.uebersprungen} übersprungen (keine Firma)
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <Thead className="bg-transparent! normal-case! tracking-normal! text-claimondo-ondo!">
                  <Tr className="border-b border-claimondo-border">
                    <Th className="px-0! py-1.5! pr-3! font-semibold">Firma</Th>
                    <Th className="px-0! py-1.5! pr-3! font-semibold">Ansprechpartner</Th>
                    <Th className="px-0! py-1.5! pr-3! font-semibold">E-Mail</Th>
                    <Th className="px-0! py-1.5! font-semibold">Ort</Th>
                  </Tr>
                </Thead>
                <Tbody className="divide-y-0!">
                  {vorschauZeilen.map((l, i) => (
                    <Tr key={i} className="border-b border-claimondo-border/40">
                      <Td className="px-0! py-1.5! pr-3!">{l.firma}</Td>
                      <Td className="px-0! py-1.5! pr-3! text-claimondo-ondo!">
                        {[l.ansprechpartner_vorname, l.ansprechpartner_nachname]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </Td>
                      <Td className="px-0! py-1.5! pr-3! text-claimondo-ondo!">{l.email ?? '—'}</Td>
                      <Td className="px-0! py-1.5! text-claimondo-ondo!">
                        {[l.plz, l.ort].filter(Boolean).join(' ') || '—'}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
            {vorschau.valide.length > vorschauZeilen.length && (
              <p className="mt-2 text-xs text-claimondo-shield">
                … und {vorschau.valide.length - vorschauZeilen.length} weitere.
              </p>
            )}
          </div>
        )}

        {/* Hinweis: Datei geladen aber 0 valide Leads */}
        {rohdaten && vorschau && vorschau.valide.length === 0 && hatFirmaSpalte && (
          <div className="rounded-ios-md bg-warning-soft px-3 py-2 text-xs text-warning-strong">
            {vorschau.uebersprungen > 0
              ? `Keine gültigen Zeilen — allen ${vorschau.uebersprungen} Zeilen fehlt der Wert in der Firma-Spalte.`
              : 'Keine Datenzeilen mit Firma-Inhalt gefunden.'}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={handleClose} type="button">
            Abbrechen
          </Button>
          <Button
            variant="navy"
            fullWidth
            onClick={handleImport}
            loading={importing}
            disabled={
              importing ||
              !vorschau ||
              vorschau.valide.length === 0 ||
              !hatFirmaSpalte ||
              mappingPending
            }
          >
            {vorschau && vorschau.valide.length > 0
              ? `${vorschau.valide.length} importieren`
              : 'Importieren'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Detail-Drawer ───────────────────────────────────────────────────────────

function DetailDrawer({
  lead,
  staff,
  aktivitaeten,
  onClose,
  onChanged,
}: {
  lead: PartnerLeadRow | null
  staff: StaffOption[]
  aktivitaeten: PartnerLeadAktivitaetRow[]
  onClose: () => void
  onChanged: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [converting, setConverting] = useState(false)

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

const SCRAPE_ANZAHL_OPTIONEN = [
  { value: '20', label: '20 (schnell)' },
  { value: '40', label: '40' },
  { value: '60', label: '60 (max)' },
]

function ScrapeModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const [rolle, setRolle] = useState<PartnerRolle>('sachverstaendiger')
  const [region, setRegion] = useState('')
  const [limit, setLimit] = useState(20)
  const [suchend, setSuchend] = useState(false)
  const [kandidaten, setKandidaten] = useState<ScrapeKandidat[] | null>(null)
  const [dublettenCount, setDublettenCount] = useState(0)
  const [gefunden, setGefunden] = useState(0)
  const [importing, setImporting] = useState(false)

  function reset() {
    setKandidaten(null)
    setDublettenCount(0)
    setGefunden(0)
    setSuchend(false)
    setImporting(false)
  }

  function handleClose() {
    reset()
    setRegion('')
    onClose()
  }

  async function handleSuchen() {
    if (region.trim().length < 2) {
      toast.error('Bitte eine Region angeben (Stadt oder PLZ).')
      return
    }
    setSuchend(true)
    setKandidaten(null)
    try {
      const res = await scrapePartnerLeadsVorschau(rolle, region.trim(), limit)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setKandidaten(res.neu)
      setDublettenCount(res.dublettenCount)
      setGefunden(res.gefunden)
      if (res.neu.length === 0) {
        toast.info(
          res.gefunden > 0
            ? `${res.gefunden} gefunden — alle bereits im CRM (Dubletten).`
            : 'Keine Treffer für diese Suche.',
        )
      }
    } catch {
      toast.error('Suche fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setSuchend(false)
    }
  }

  function updateKandidat(index: number, patch: Partial<ScrapeKandidat>) {
    setKandidaten((prev) => (prev ? prev.map((k, i) => (i === index ? { ...k, ...patch } : k)) : prev))
  }

  function entferneKandidat(index: number) {
    setKandidaten((prev) => (prev ? prev.filter((_, i) => i !== index) : prev))
  }

  async function handleUebernehmen() {
    if (!kandidaten || kandidaten.length === 0) return
    setImporting(true)
    try {
      const res = await importScrapedLeads(rolle, kandidaten)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const nachricht =
        res.uebersprungen > 0
          ? `${res.angelegt} Lead${res.angelegt === 1 ? '' : 's'} angelegt (${res.uebersprungen} Dublette${res.uebersprungen === 1 ? '' : 'n'} übersprungen).`
          : `${res.angelegt} Lead${res.angelegt === 1 ? '' : 's'} angelegt.`
      toast.success(nachricht)
      reset()
      setRegion('')
      onImported()
    } catch {
      toast.error('Übernahme fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setImporting(false)
    }
  }

  const inputKlasse =
    'w-full rounded-ios-sm border border-transparent bg-transparent px-1.5 py-1 hover:border-claimondo-border focus:border-claimondo-ondo focus:bg-white focus:outline-none'

  return (
    <Modal open={open} onClose={handleClose} maxWidth={720} ariaLabel="Leads scrapen">
      <h2 className="text-claimondo-navy font-semibold text-lg mb-1">Leads scrapen</h2>
      <p className="text-sm text-claimondo-ondo mb-4">
        Neue Prospects über Google Places finden. Treffer werden gegen den Bestand auf Dubletten
        geprüft — du kannst sie vor dem Anlegen prüfen und bearbeiten.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <SelectField
            label="Rolle"
            value={rolle}
            onChange={(e) => setRolle(e.target.value as PartnerRolle)}
            options={ROLLE_KEYS.map((r) => ({ value: r, label: PARTNER_ROLLE_LABELS[r] }))}
          />
          <TextField
            label="Region (Stadt/PLZ)"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="z.B. Hamburg"
          />
          <SelectField
            label="Anzahl"
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            options={SCRAPE_ANZAHL_OPTIONEN}
          />
        </div>

        <Button
          variant="navy"
          onClick={handleSuchen}
          loading={suchend}
          disabled={suchend || region.trim().length < 2}
          iconLeft={<Search className="w-4 h-4" />}
        >
          Suchen
        </Button>

        {kandidaten && kandidaten.length > 0 && (
          <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg/50 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="font-medium text-claimondo-navy">{gefunden} gefunden</span>
              <span className="text-success-strong">
                {kandidaten.length} neu{kandidaten.length === 1 ? '' : 'e'}
              </span>
              {dublettenCount > 0 && (
                <span className="text-warning-strong">
                  {dublettenCount} Dublette{dublettenCount === 1 ? '' : 'n'} gefiltert
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <Table className="text-xs">
                <Thead className="bg-transparent! normal-case! tracking-normal! text-claimondo-ondo!">
                  <Tr className="border-b border-claimondo-border">
                    <Th className="px-0! py-1.5! pr-3! font-semibold">Firma</Th>
                    <Th className="px-0! py-1.5! pr-3! font-semibold">Telefon</Th>
                    <Th className="px-0! py-1.5! pr-3! font-semibold">PLZ</Th>
                    <Th className="px-0! py-1.5! pr-3! font-semibold">Ort</Th>
                    <Th className="px-0! py-1.5! font-semibold"><span className="sr-only">Entfernen</span></Th>
                  </Tr>
                </Thead>
                <Tbody className="divide-y-0!">
                  {kandidaten.map((k, i) => (
                    <Tr key={k.google_place_id || i} className="border-b border-claimondo-border/40">
                      <Td className="px-0! py-1! pr-3!">
                        <input
                          value={k.firma}
                          onChange={(e) => updateKandidat(i, { firma: e.target.value })}
                          className={`${inputKlasse} min-w-[9rem] text-claimondo-navy`}
                        />
                      </Td>
                      <Td className="px-0! py-1! pr-3!">
                        <input
                          value={k.telefon ?? ''}
                          onChange={(e) => updateKandidat(i, { telefon: e.target.value })}
                          className={`${inputKlasse} min-w-[7rem] text-claimondo-ondo`}
                        />
                      </Td>
                      <Td className="px-0! py-1! pr-3!">
                        <input
                          value={k.plz ?? ''}
                          onChange={(e) => updateKandidat(i, { plz: e.target.value })}
                          className={`${inputKlasse} w-16! text-claimondo-ondo`}
                        />
                      </Td>
                      <Td className="px-0! py-1! pr-3!">
                        <input
                          value={k.ort ?? ''}
                          onChange={(e) => updateKandidat(i, { ort: e.target.value })}
                          className={`${inputKlasse} min-w-[6rem] text-claimondo-ondo`}
                        />
                      </Td>
                      <Td className="px-0! py-1! text-right">
                        <button
                          type="button"
                          onClick={() => entferneKandidat(i)}
                          aria-label="Kandidat entfernen"
                          className="rounded-ios-sm p-1 text-claimondo-shield hover:bg-danger-soft hover:text-danger-strong"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="ghost" fullWidth onClick={handleClose} type="button">
            Abbrechen
          </Button>
          <Button
            variant="navy"
            fullWidth
            onClick={handleUebernehmen}
            loading={importing}
            disabled={importing || !kandidaten || kandidaten.length === 0}
          >
            {kandidaten && kandidaten.length > 0 ? `${kandidaten.length} übernehmen` : 'Übernehmen'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
