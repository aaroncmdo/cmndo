'use client'

// P1 (Detail-View-Konsistenz): Die Liste ist jetzt drillbar.
// Vorher oeffnete ein Klick ein 512px-Modal (Detail + Edit) — jetzt navigiert er
// auf /admin/versicherungen/[id]: Soft-Nav zeigt den Drawer, Deep-Link die
// Full-Page. Das Detail-Modal ist damit ersatzlos entfallen.
// Die Writes laufen ueber Server-Actions (vorher: direkt aus dem Browser in die DB).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SearchIcon, MailIcon, PlusIcon, XIcon } from 'lucide-react'
import PhoneButton from '@/components/shared/PhoneButton'
import { Modal } from '@/components/primitives/Modal'
import { Button } from '@/components/primitives/Button'
import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import { StatusBadge } from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, ClickableTr, Th, Td } from '@/components/shared/DataTable'
import { createVersicherung, type VersicherungInput } from './actions'

type Versicherung = {
  id: string
  name: string
  schaden_telefon: string | null
  schaden_email: string | null
  hotline_telefon: string | null
  webseite: string | null
  adresse: string | null
  plz: string | null
  stadt: string | null
  bafin_nummer: string | null
  ist_aktiv: boolean
}

const CREATE_FELDER = [
  'name',
  'schaden_telefon',
  'schaden_email',
  'hotline_telefon',
  'webseite',
  'adresse',
  'plz',
  'stadt',
  'bafin_nummer',
] as const

const LEER: VersicherungInput = {
  name: '',
  schaden_telefon: null,
  schaden_email: null,
  hotline_telefon: null,
  webseite: null,
  adresse: null,
  plz: null,
  stadt: null,
  bafin_nummer: null,
}

export default function VersicherungenClient({ versicherungen }: { versicherungen: Versicherung[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<VersicherungInput>(LEER)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = versicherungen.filter(v => {
    const q = search.toLowerCase()
    return v.name.toLowerCase().includes(q) || (v.stadt ?? '').toLowerCase().includes(q)
  })

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createVersicherung(form)
      if (!res.ok) {
        setError(res.error ?? 'Anlegen fehlgeschlagen.')
        return
      }
      setCreating(false)
      setForm(LEER)
      router.refresh()
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header — Phase-2-Migration (23.08.), Muster identisch zu /admin/vertraege.
          KEIN border-b mehr: die PageHeader-Floating-Card ersetzt das frühere eckige Band
          (eine harte Kante direkt unter der weichen Card sah falsch aus, und der
          Phase-2-Wächter prüft genau darauf — portal-header-phase2.spec.ts). */}
      <div className="px-4 py-3 shrink-0">
        <PageHeader
          title="Versicherer"
          description={`${filtered.length} von ${versicherungen.length}`}
          size="lg"
          actions={
            <div className="flex items-center gap-2">
              <div className="relative">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-claimondo-ondo/70" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
                  className="pl-8 pr-3 py-1.5 bg-white border border-claimondo-border rounded-ios-lg text-body-xs text-claimondo-navy placeholder-claimondo-ondo/60 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo w-48" />
              </div>
              <Button variant="ondo" size="sm" onClick={() => { setCreating(true); setForm(LEER); setError(null) }}>
                <PlusIcon className="w-3.5 h-3.5" /> Neue Versicherung
              </Button>
            </div>
          }
        />
      </div>

      {/* Tabelle — Zeile fuehrt in die Detail-View */}
      <div className="flex-1 overflow-y-auto">
        <Table>
          <Thead className="sticky top-0 z-10 bg-white! text-body-sm! normal-case! tracking-normal! border-b border-claimondo-border">
            <tr>
              <Th className="text-left py-2! text-claimondo-ondo! text-body-xs!">Name</Th>
              <Th className="text-left py-2! text-claimondo-ondo! text-body-xs!">Schadentelefon</Th>
              <Th className="text-left py-2! text-claimondo-ondo! text-body-xs!">Schaden-Email</Th>
              <Th className="text-left py-2! text-claimondo-ondo! text-body-xs!">Stadt</Th>
              <Th className="text-left py-2! text-claimondo-ondo! text-body-xs!">Status</Th>
            </tr>
          </Thead>
          <Tbody className="divide-y-0!">
            {filtered.map(v => (
              <ClickableTr key={v.id} onClick={() => router.push(`/admin/versicherungen/${v.id}`)}
                className={`border-b border-claimondo-border ${!v.ist_aktiv ? 'opacity-50' : ''}`}>
                {/* Echter Link statt nur ClickableTr-onClick: erlaubt Mittelklick/Strg+Klick
                    (Detailansicht im neuen Tab), Tastatur-Fokus und Screenreader-Erkennung.
                    Der Zeilen-Klick bleibt unveraendert — stopPropagation verhindert nur, dass
                    beide Handler feuern. Muster: FaelleKanban.tsx:235. */}
                <Td className="py-2.5! font-medium text-body-xs">
                  <Link href={`/admin/versicherungen/${v.id}`} onClick={e => e.stopPropagation()}>
                    {v.name}
                  </Link>
                </Td>
                <Td className="py-2.5! text-body-xs">
                  {v.schaden_telefon ? (
                    <PhoneButton nummer={v.schaden_telefon} variant="inline" label={v.schaden_telefon} stopPropagation />
                  ) : <span className="text-claimondo-ondo/50">—</span>}
                </Td>
                <Td className="py-2.5! text-body-xs">
                  {v.schaden_email ? (
                    <a href={`mailto:${v.schaden_email}`} className="text-claimondo-ondo hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <MailIcon className="w-3 h-3" /> {v.schaden_email}
                    </a>
                  ) : <span className="text-claimondo-ondo/50">—</span>}
                </Td>
                <Td className="py-2.5! text-claimondo-ondo! text-body-xs">{v.stadt ?? '—'}</Td>
                <Td className="py-2.5!">
                  <StatusBadge tone={v.ist_aktiv ? 'success' : 'danger'}>
                    {v.ist_aktiv ? 'Aktiv' : 'Deaktiviert'}
                  </StatusBadge>
                </Td>
              </ClickableTr>
            ))}
          </Tbody>
        </Table>
      </div>

      {/* Create-Modal (bleibt ein Modal — Anlegen ist ein kurzer Flow, kein Detail) */}
      <Modal open={creating} onClose={() => setCreating(false)} noPadding hideCloseButton maxWidth={512} ariaLabel="Neue Versicherung">
        <div className="max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-body font-semibold text-claimondo-navy">Neue Versicherung</h2>
            <button type="button" onClick={() => setCreating(false)} aria-label="Schließen"
              className="p-1 text-claimondo-ondo/70 hover:text-claimondo-ondo"><XIcon className="w-5 h-5" /></button>
          </div>
          <div className="p-5 space-y-3">
            {CREATE_FELDER.map(key => (
              <div key={key}>
                <label htmlFor={`neu-${key}`} className="text-body-xs text-claimondo-ondo mb-0.5 block">
                  {key === 'name' ? 'Name *' : key.replace(/_/g, ' ')}
                </label>
                {key === 'adresse' ? (
                  /* P3 Ortseingaben: Autocomplete füllt Adresse + PLZ + Stadt (plz/stadt bleiben editierbar). */
                  <GooglePlaceAutocomplete
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-body-sm focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
                    defaultValue={form.adresse ?? ''}
                    placeholder="Straße + Hausnummer, Stadt eingeben…"
                    onSelect={r =>
                      setForm(prev => ({ ...prev, adresse: r.strasse || prev.adresse, plz: r.plz || prev.plz, stadt: r.stadt || prev.stadt }))
                    }
                    onChange={t => setForm(prev => ({ ...prev, adresse: t || null }))}
                  />
                ) : (
                  <input id={`neu-${key}`} value={form[key] ?? ''}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value === '' ? null : e.target.value }))}
                    className="w-full px-3 py-2 border border-claimondo-border rounded-ios-lg text-body-sm focus:outline-none focus:ring-1 focus:ring-claimondo-ondo" />
                )}
              </div>
            ))}
            {error && (
              <p className="text-body-sm text-danger-strong bg-danger-soft rounded-ios-sm px-3 py-2">{error}</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="ondo" loading={pending} disabled={!form.name.trim()} onClick={handleCreate} className="flex-1">
                Erstellen
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Abbrechen</Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
