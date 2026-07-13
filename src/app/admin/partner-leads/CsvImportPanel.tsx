'use client'

// CsvImportPanel — reiner Content (ohne Modal/Drawer-Chrome).
// Kann von ImportCsvModal (standalone /admin/partner-leads) UND vom Vertrieb-Cockpit-Drawer verwendet werden.
// Props: onClose schliesst den umgebenden Container; onImported wird nach erfolgreichem Import aufgerufen.

import { useEffect, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SelectField } from '@/components/shared/forms/SelectField'
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import { importCsvLeads, schlageCsvMappingVor } from './actions'
import {
  parseCsv,
  mapCsvMitMapping,
  heuristischesMapping,
  CSV_ZIEL_FELDER,
  type CsvZielFeld,
  type PartnerCsvLead,
} from '@/lib/partner/csv-import'
import {
  PARTNER_ROLLE_LABELS,
} from './types'
import type { PartnerRolle } from '@/lib/partner/policy'

const ROLLE_KEYS: PartnerRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']

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

export default function CsvImportPanel({
  onClose,
  onImported,
  defaultRolle,
}: {
  onClose: () => void
  onImported?: (created: number) => void
  defaultRolle?: PartnerRolle
}) {
  const [rolle, setRolle] = useState<PartnerRolle>(defaultRolle ?? 'sachverstaendiger')
  useEffect(() => {
    if (defaultRolle) setRolle(defaultRolle)
  }, [defaultRolle])

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
      onImported?.(result.angelegt)
    } catch {
      toast.error('Import fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-claimondo-navy font-semibold text-lg mb-1">CSV importieren</h2>
        <p className="text-sm text-claimondo-ondo">
          Leads aus einer CSV-Datei für die gewählte Rolle anlegen.
        </p>
      </div>

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
  )
}
