'use client'

// ScrapePanel — reiner Content (ohne Modal/Drawer-Chrome).
// Kann von ScrapeModal (standalone /admin/partner-leads) UND vom Vertrieb-Cockpit-Drawer verwendet werden.
// Props: onClose schliesst den umgebenden Container; onImported wird nach erfolgreichem Import aufgerufen.

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/primitives'
import { SelectField } from '@/components/shared/forms/SelectField'
import { TextField } from '@/components/shared/forms/TextField'
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from '@/components/shared/DataTable'
import { scrapePartnerLeadsVorschau, importScrapedLeads } from './actions'
import type { ScrapeKandidat } from '@/lib/partner/scraping'
import {
  PARTNER_ROLLE_LABELS,
} from './types'
import type { PartnerRolle } from '@/lib/partner/policy'

const ROLLE_KEYS: PartnerRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']

const SCRAPE_ANZAHL_OPTIONEN = [
  { value: '20', label: '20 (schnell)' },
  { value: '40', label: '40' },
  { value: '60', label: '60 (max)' },
]

export default function ScrapePanel({
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
      const teile = [`${res.angelegt} Lead${res.angelegt === 1 ? '' : 's'} angelegt`]
      // Die Leads kommen bereits mit Ansprechpartner (aus dem Impressum) — das ist die
      // Zahl, die zaehlt: nur diese sind sofort anschreibbar.
      if (res.angereichert > 0) teile.push(`${res.angereichert} mit Ansprechpartner`)
      // Gibt es eine aktive Auto-Aufnahme-Sequenz fuer diese Rolle, laufen die Leads
      // ab jetzt von allein an (der stuendliche CRON-Advancer sendet Schritt 1).
      if (res.aufgenommen > 0) teile.push(`${res.aufgenommen} in Sequenz aufgenommen`)
      if (res.uebersprungen > 0) {
        teile.push(`${res.uebersprungen} Dublette${res.uebersprungen === 1 ? '' : 'n'} übersprungen`)
      }
      toast.success(`${teile.join(' · ')}.`)
      reset()
      setRegion('')
      onImported?.(res.angelegt)
    } catch {
      toast.error('Übernahme fehlgeschlagen — bitte erneut versuchen.')
    } finally {
      setImporting(false)
    }
  }

  const inputKlasse =
    'w-full rounded-ios-sm border border-transparent bg-transparent px-1.5 py-1 hover:border-claimondo-border focus:border-claimondo-ondo focus:bg-white focus:outline-none'

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-claimondo-navy font-semibold text-lg mb-1">Leads scrapen</h2>
        <p className="text-sm text-claimondo-ondo">
          Neue Prospects über Google Places finden. Treffer werden gegen den Bestand auf Dubletten
          geprüft — du kannst sie vor dem Anlegen prüfen und bearbeiten.
        </p>
      </div>

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
  )
}
