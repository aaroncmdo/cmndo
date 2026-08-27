'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPinIcon, MailIcon, PlusIcon, UploadIcon, RefreshCwIcon } from 'lucide-react'
import { createSvLead, importSvLeadsAction, sendeSvLeadEinladung, sendeAlleOffenenEinladungen, datSyncAusfuehren } from './actions'
import type { SvLeadSeite } from './types'
import type { SvLeadFilter } from '@/lib/sv-leads/liste-filter'
import SvLeadsFilterleiste from './SvLeadsFilterleiste'
import SvLeadsBlaetterleiste from './SvLeadsBlaetterleiste'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td, DataTableMobileCard } from '@/components/shared/DataTable'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { TextField } from '@/components/shared/forms/TextField'

const CLAIM_STATUS_LABELS: Record<string, string> = {
  offen: 'Offen',
  beansprucht_pending: 'Beansprucht (ausstehend)',
  beansprucht: 'Beansprucht',
  konvertiert: 'Konvertiert',
  abgelehnt: 'Abgelehnt',
}

const CLAIM_STATUS_COLORS: Record<string, string> = {
  offen: 'bg-info-soft text-info-strong',
  beansprucht_pending: 'bg-warning-soft text-warning-strong',
  beansprucht: 'bg-info-soft text-info-strong',
  konvertiert: 'bg-success-soft text-success-strong',
  abgelehnt: 'bg-danger-soft text-danger-strong',
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SvLeadsClient({
  seite,
  filter,
  zaehlung,
  hideHeader = false,
}: {
  /**
   * EINE Seite der Trefferliste — nicht der ganze Bestand.
   *
   * ⚠ Bis zum 21.08.2026 bekam diese Komponente ein Array aus höchstens 200
   * Zeilen und zeigte dessen Länge als Gesamtzahl an. Nach dem Deutschland-
   * Scrape standen 4.644 Leads in der Tabelle; die Liste zeigte 200 davon und
   * behauptete, das seien alle. Deshalb kommt jetzt `gesamt` mit — die
   * Kopfzeile nennt die echte Zahl, nicht die Länge des geladenen Ausschnitts.
   */
  seite: SvLeadSeite
  filter: SvLeadFilter
  zaehlung: { gepflegt: number; entdeckt: number }
  /** true = kein PageHeader-Titel (der Drawer liefert den Titel), nur die Aktions-Buttons. */
  hideHeader?: boolean
}) {
  const svLeads = seite.zeilen
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)

  // Bulk-Import state
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // DAT-Sync state
  const [datSyncLoading, setDatSyncLoading] = useState(false)

  // Einladungs-State: ladende LeadIds als Set
  const [einladendLeads, setEinladendLeads] = useState<Set<string>>(new Set())
  const [bulkEinladenLoading, setBulkEinladenLoading] = useState(false)

  const [adresse, setAdresse] = useState<{
    strasse: string
    plz: string
    ort: string
    lat: number | null
    lng: number | null
    display: string
  }>({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })

  function handlePlaceSelect(result: PlaceResult) {
    setAdresse({
      strasse: result.strasse,
      plz: result.plz,
      ort: result.stadt,
      lat: result.lat,
      lng: result.lng,
      display: result.adresse,
    })
  }

  function openDialog() {
    setAdresse({ strasse: '', plz: '', ort: '', lat: null, lng: null, display: '' })
    setShowDialog(true)
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const fd = new FormData(e.currentTarget)
    // Adressfelder aus State injizieren (GooglePlaceAutocomplete rendert keine hidden inputs)
    fd.set('adresse', adresse.display || adresse.strasse)
    fd.set('plz', adresse.plz)
    fd.set('ort', adresse.ort)
    fd.set('lat', adresse.lat !== null ? String(adresse.lat) : '')
    fd.set('lng', adresse.lng !== null ? String(adresse.lng) : '')

    try {
      const result = await createSvLead(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('SV-Lead angelegt.')
      setShowDialog(false)
      router.refresh()
    } catch {
      toast.error('Anlegen fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDatSync() {
    setDatSyncLoading(true)
    try {
      const result = await datSyncAusfuehren()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.importiert > 0) {
        toast.success(`${result.importiert} aus DAT importiert.`)
      } else {
        toast.info('DAT-Sync noch nicht verbunden — 0 importiert.')
      }
      router.refresh()
    } catch {
      toast.error('DAT-Sync fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setDatSyncLoading(false)
    }
  }

  async function handleEinladen(leadId: string) {
    setEinladendLeads(prev => new Set(prev).add(leadId))
    try {
      const result = await sendeSvLeadEinladung(leadId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.gesendet) {
        toast.success('Einladung gesendet.')
      } else {
        toast.info('Kein Kontakt vorhanden — Einladung nicht gesendet.')
      }
      router.refresh()
    } catch {
      toast.error('Einladen fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setEinladendLeads(prev => {
        const next = new Set(prev)
        next.delete(leadId)
        return next
      })
    }
  }

  async function handleAlleEinladen() {
    setBulkEinladenLoading(true)
    try {
      const result = await sendeAlleOffenenEinladungen()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { gesendet, uebersprungen } = result
      toast.success(
        `${gesendet} eingeladen, ${uebersprungen} ohne Kontakt übersprungen.`
      )
      router.refresh()
    } catch {
      toast.error('Bulk-Einladen fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setBulkEinladenLoading(false)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    setImportLoading(true)
    try {
      const result = await importSvLeadsAction(text)
      // Reset file input so dasselbe File erneut hochgeladen werden kann
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const { importiert, fehler } = result
      if (importiert > 0) {
        toast.success(`${importiert} SV-Lead${importiert === 1 ? '' : 's'} importiert.${fehler.length > 0 ? ` ${fehler.length} übersprungen.` : ''}`)
      } else {
        toast.warning(`0 importiert — ${fehler.length} übersprungen.`)
      }
      if (fehler.length > 0) {
        console.warn('[Bulk-Import] Übersprungene Zeilen:', fehler)
      }
      setShowImportDialog(false)
      router.refresh()
    } catch {
      toast.error('Import fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setImportLoading(false)
    }
  }

  const aktionen = (
    <div className="flex gap-2 flex-wrap">
      <Button
        variant="ghost"
        onClick={handleDatSync}
        iconLeft={<RefreshCwIcon className="w-4 h-4" />}
        loading={datSyncLoading}
      >
        DAT-Sync ausführen
      </Button>
      <Button
        variant="ghost"
        onClick={() => setShowImportDialog(true)}
        iconLeft={<UploadIcon className="w-4 h-4" />}
        loading={importLoading}
      >
        Bulk-Import (CSV)
      </Button>
      <Button
        variant="ghost"
        onClick={handleAlleEinladen}
        iconLeft={<MailIcon className="w-4 h-4" />}
        loading={bulkEinladenLoading}
      >
        Alle offenen einladen
      </Button>
      <Button
        variant="navy"
        onClick={openDialog}
        iconLeft={<PlusIcon className="w-4 h-4" />}
      >
        Neuer Dead-Pin
      </Button>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        {hideHeader ? (
          <div className="mb-6 flex justify-end">{aktionen}</div>
        ) : (
          <div className="mb-6">
            <PageHeader
              title="SV-Leads"
              // ⚠ Die ECHTE Gesamtzahl, nicht die Länge des geladenen
              // Ausschnitts. „200 Dead-Pins" war die Aussage, die 4.444
              // weitere verschwiegen hat.
              description={`${seite.gesamt.toLocaleString('de-DE')} Einträge`}
              icon={MapPinIcon}
              actions={aktionen}
            />
          </div>
        )}

        <SvLeadsFilterleiste filter={filter} zaehlung={zaehlung} gesamt={seite.gesamt} />

        <DataTableContainer
          variant="plain"
          className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden"
          mobileCards={svLeads.length === 0 ? (
            <div className="p-12 text-center text-sm text-claimondo-ondo">Noch keine SV-Leads vorhanden.</div>
          ) : svLeads.map(lead => (
            <DataTableMobileCard key={lead.id}>
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy truncate">{lead.name}</p>
                  {lead.firma && <p className="text-xs text-claimondo-ondo truncate">{lead.firma}</p>}
                  <p className="text-xs text-claimondo-ondo mt-0.5">{lead.ort ?? '—'}{lead.plz ? ` · ${lead.plz}` : ''}</p>
                </div>
                <div className="shrink-0">
                  {lead.claim_status ? (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CLAIM_STATUS_COLORS[lead.claim_status] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>
                      {CLAIM_STATUS_LABELS[lead.claim_status] ?? lead.claim_status}
                    </span>
                  ) : (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lead.ist_aktiv ? 'bg-success-soft text-success-strong' : 'bg-claimondo-bg text-claimondo-ondo'}`}>
                      {lead.ist_aktiv ? 'Aktiv' : 'Inaktiv'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-claimondo-ondo truncate">
                  {lead.quelle ?? '—'} · {formatDatum(lead.aktualisiert_am)}
                  {lead.konvertiert_zu_sv_id ? ' · SV konvertiert' : ''}
                </span>
                {lead.claim_status === 'offen' && !lead.konvertiert_zu_sv_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEinladen(lead.id)}
                    loading={einladendLeads.has(lead.id)}
                    iconLeft={<MailIcon className="w-3.5 h-3.5" />}
                  >
                    Einladen
                  </Button>
                )}
              </div>
            </DataTableMobileCard>
          ))}
        >
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Name / Firma</Th>
                <Th className="text-left text-claimondo-ondo!">Ort</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Sichtbarkeit</Th>
                <Th className="text-left text-claimondo-ondo!">Quelle</Th>
                <Th className="text-left text-claimondo-ondo!">Aktualisiert</Th>
                <Th className="text-left text-claimondo-ondo!">Aktion</Th>
              </Tr>
            </Thead>
            <Tbody className="divide-y-0!">
              {svLeads.map(lead => (
                <Tr key={lead.id} className="border-b border-claimondo-border/50">
                  <Td>
                    <div className="text-claimondo-navy font-medium">{lead.name}</div>
                    {lead.firma && (
                      <div className="text-claimondo-ondo text-xs">{lead.firma}</div>
                    )}
                    {lead.konvertiert_zu_sv_id && (
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-success-soft text-success-strong">
                        SV konvertiert
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div className="text-claimondo-navy text-sm">{lead.ort ?? '—'}</div>
                    {lead.plz && (
                      <div className="text-claimondo-ondo text-xs">{lead.plz}</div>
                    )}
                  </Td>
                  <Td>
                    {lead.claim_status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CLAIM_STATUS_COLORS[lead.claim_status] ?? 'bg-claimondo-bg text-claimondo-navy'}`}>
                        {CLAIM_STATUS_LABELS[lead.claim_status] ?? lead.claim_status}
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${lead.ist_aktiv ? 'bg-success-soft text-success-strong' : 'bg-claimondo-bg text-claimondo-ondo'}`}>
                        {lead.ist_aktiv ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    )}
                  </Td>
                  <Td>
                    {/*
                      ⚠ Ein Strich, keine Null. `levelup_letzter_score === null`
                      heisst „nie gemessen" — eine 0 wäre die Behauptung, der
                      Betrieb sei nirgends sichtbar.
                    */}
                    {lead.levelup_letzter_score === null ? (
                      <span className="text-claimondo-ondo text-sm">—</span>
                    ) : (
                      <span className="text-claimondo-navy text-sm font-medium">
                        {lead.levelup_letzter_score}
                      </span>
                    )}
                    {lead.website_url && (
                      <div className="text-claimondo-ondo text-xs truncate max-w-[180px]">
                        {lead.website_url.replace(/^https?:\/\/(www\.)?/i, '')}
                      </div>
                    )}
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{lead.quelle ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{formatDatum(lead.aktualisiert_am)}</span>
                  </Td>
                  <Td>
                    {lead.claim_status === 'offen' && !lead.konvertiert_zu_sv_id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEinladen(lead.id)}
                        loading={einladendLeads.has(lead.id)}
                        iconLeft={<MailIcon className="w-3.5 h-3.5" />}
                      >
                        Einladen
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
              {svLeads.length === 0 && (
                <Tr>
                  <Td colSpan={7} className="py-12! text-center text-claimondo-ondo!">
                    {/*
                      ⚠ „Keine Treffer" und „keine Leads" sind verschiedene
                      Aussagen. Wer bei aktivem Filter „noch keine SV-Leads"
                      liest, sucht den Fehler im Bestand statt im Filter.
                    */}
                    {seite.gesamt === 0 && !filter.suche && filter.bestand === 'alle' && !filter.status
                      ? 'Noch keine SV-Leads vorhanden.'
                      : 'Keine Treffer für diesen Filter.'}
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

        <SvLeadsBlaetterleiste
          filter={filter}
          seite={seite.seite}
          seiten={seite.seiten}
          gesamt={seite.gesamt}
          proSeite={seite.proSeite}
        />

        <Modal open={showImportDialog} onClose={() => setShowImportDialog(false)} maxWidth={480} ariaLabel="Bulk-Import CSV">
          <h2 className="text-claimondo-navy font-semibold text-lg mb-2">Bulk-Import (CSV)</h2>
          <p className="text-claimondo-ondo text-sm mb-4">
            CSV-Datei mit den Spalten <span className="font-mono text-xs bg-claimondo-bg px-1 rounded">name, firma, adresse, plz, ort, telefon, email, dat_id, dat_expert_nr, qualifikationen, paket_umkreis_km</span> hochladen.
            Qualifikationen werden durch Semikolon oder Pipe getrennt. Fehlende Koordinaten werden automatisch per Geocoding ergänzt.
          </p>
          <div className="mb-4">
            <label className="text-sm text-claimondo-ondo mb-2 block font-medium">
              Datei wählen (.csv)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleImportFile}
              disabled={importLoading}
              className="block w-full text-sm text-claimondo-navy file:mr-3 file:py-1.5 file:px-3 file:rounded-ios-md file:border-0 file:text-sm file:font-medium file:bg-claimondo-bg file:text-claimondo-navy hover:file:bg-claimondo-border cursor-pointer"
            />
          </div>
          {importLoading && (
            <p className="text-sm text-claimondo-ondo mt-2">Importiert… bitte warten.</p>
          )}
          <div className="flex justify-end pt-2">
            <Button variant="ghost" onClick={() => setShowImportDialog(false)} disabled={importLoading}>
              Schließen
            </Button>
          </div>
        </Modal>

        <Modal open={showDialog} onClose={() => setShowDialog(false)} maxWidth={520} ariaLabel="Neuer Dead-Pin">
          <h2 className="text-claimondo-navy font-semibold text-lg mb-4">Neuer Dead-Pin</h2>
          <form onSubmit={handleCreate} className="space-y-3">
            <TextField
              label="Name"
              name="name"
              required
              placeholder="z.B. Max Mustermann"
            />
            <TextField
              label="Firma (optional)"
              name="firma"
              placeholder="z.B. Muster Gutachten GmbH"
            />
            <div>
              <label className="text-sm text-claimondo-ondo mb-1 block">Standort</label>
              <GooglePlaceAutocomplete
                placeholder="Adresse eingeben…"
                onSelect={handlePlaceSelect}
                defaultValue={adresse.display}
              />
              {adresse.lat !== null && (
                <p className="text-xs text-claimondo-ondo mt-1">
                  {adresse.strasse}, {adresse.plz} {adresse.ort} — Koordinaten gespeichert
                </p>
              )}
            </div>
            <TextField
              label="Telefon (optional)"
              name="telefon"
              type="tel"
              placeholder="+49 221 …"
            />
            <TextField
              label="E-Mail (optional)"
              name="email"
              type="email"
              placeholder="sv@beispiel.de"
            />
            <TextField
              label="DAT Expert-Nr. (optional)"
              name="dat_expert_nr"
              placeholder="z.B. 123456"
            />
            <TextField
              label="Qualifikationen (kommagetrennt, optional)"
              name="qualifikationen"
              placeholder="z.B. Kfz-Gutachter, Unfallanalytiker"
            />
            <TextField
              label="Umkreis (km)"
              name="paket_umkreis_km"
              type="number"
              min="1"
              max="200"
              defaultValue={15}
            />
            <div className="flex gap-3 pt-2">
              <Button variant="ghost" fullWidth onClick={() => setShowDialog(false)}>
                Abbrechen
              </Button>
              <Button
                variant="navy"
                fullWidth
                type="submit"
                loading={loading}
                disabled={loading || adresse.lat === null}
              >
                Anlegen
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  )
}
