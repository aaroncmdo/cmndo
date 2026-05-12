'use client'

// Triage-Tabelle für Gutachter-Waitlist-Einträge. Status-Update + Notizen
// inline. Filter nach Status, Sortierung nach Datum.

import { useState, useTransition } from 'react'
import { setzeWaitlistStatus } from '@/lib/actions/gutachter-waitlist'
import { toast } from 'sonner'
import { Chip } from '@/components/ui/Chip'
import { DataTableContainer, Table, Thead, Tr, Th, Td } from '@/components/shared/DataTable'

type Eintrag = {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string | null
  plz: string
  ort: string | null
  dat_expert_nummer: string | null
  bvsk_mitgliedsnummer: string | null
  ihk_zertifikat_nummer: string | null
  oebuv_bestellungsnummer: string | null
  unternehmen: string | null
  jahre_erfahrung: number | null
  aktuelle_auftraege_pro_monat: number | null
  schwerpunkte: string | null
  status: string
  notizen_admin: string | null
  erstellt_am: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  neu: { label: 'Neu', color: 'bg-claimondo-ondo/10 text-claimondo-ondo border-claimondo-ondo/30' },
  kontaktiert: { label: 'Kontaktiert', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  qualifiziert: { label: 'Qualifiziert', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  onboarding: { label: 'Onboarding', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  aktiv: { label: 'Aktiv', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  abgelehnt: { label: 'Abgelehnt', color: 'bg-red-50 text-red-700 border-red-200' },
  kein_interesse: { label: 'Kein Interesse', color: 'bg-claimondo-navy/[0.06] text-claimondo-shield border-claimondo-border' },
}

const STATUS_KEYS = ['neu', 'kontaktiert', 'qualifiziert', 'onboarding', 'aktiv', 'abgelehnt', 'kein_interesse'] as const
type StatusKey = (typeof STATUS_KEYS)[number]

export default function WaitlistTable({ eintraege }: { eintraege: Eintrag[] }) {
  const [filter, setFilter] = useState<'alle' | StatusKey>('alle')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered =
    filter === 'alle' ? eintraege : eintraege.filter((e) => e.status === filter)

  const counts = STATUS_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = eintraege.filter((e) => e.status === k).length
    return acc
  }, {})

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip variant={filter === 'alle' ? 'selected' : 'default'} count={eintraege.length} onClick={() => setFilter('alle')}>Alle</Chip>
        {STATUS_KEYS.map((k) => (
          <Chip key={k} variant={filter === k ? 'selected' : 'default'} count={counts[k] ?? 0} onClick={() => setFilter(k)}>
            {STATUS_LABELS[k].label}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-claimondo-border bg-white p-8 text-center">
          <p className="text-sm text-claimondo-ondo">Keine Einträge im aktuellen Filter.</p>
        </div>
      ) : (
        <DataTableContainer variant="plain" className="overflow-hidden rounded-2xl border border-claimondo-border bg-white">
          <Table>
            <Thead className="border-b border-claimondo-border">
              <tr>
                <Th className="text-left">Name</Th>
                <Th className="text-left">Region</Th>
                <Th className="text-left">Qualifikation</Th>
                <Th className="text-left">Erfahrung</Th>
                <Th className="text-left">Status</Th>
                <Th className="text-left">Eingegangen</Th>
                <Th />
              </tr>
            </Thead>
            <tbody>
              {filtered.map((e) => (
                <Row
                  key={e.id}
                  e={e}
                  expanded={expanded === e.id}
                  onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
                />
              ))}
            </tbody>
          </Table>
        </DataTableContainer>
      )}
    </div>
  )
}

function Row({
  e,
  expanded,
  onToggle,
}: {
  e: Eintrag
  expanded: boolean
  onToggle: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [notiz, setNotiz] = useState(e.notizen_admin ?? '')
  const [currentStatus, setCurrentStatus] = useState(e.status)

  const qualis = [
    e.dat_expert_nummer && 'DAT',
    e.bvsk_mitgliedsnummer && 'BVSK',
    e.ihk_zertifikat_nummer && 'IHK',
    e.oebuv_bestellungsnummer && 'öbuv',
  ].filter(Boolean) as string[]

  const sl = STATUS_LABELS[currentStatus]

  function changeStatus(neuStatus: StatusKey) {
    setCurrentStatus(neuStatus)
    startTransition(async () => {
      const r = await setzeWaitlistStatus(e.id, neuStatus, notiz)
      if (!r.ok) {
        toast.error(r.error ?? 'Fehler beim Status-Update')
        setCurrentStatus(e.status)
      } else {
        toast.success('Status aktualisiert')
      }
    })
  }

  function saveNotiz() {
    startTransition(async () => {
      const r = await setzeWaitlistStatus(e.id, currentStatus as StatusKey, notiz)
      if (!r.ok) {
        toast.error(r.error ?? 'Speichern fehlgeschlagen')
      } else {
        toast.success('Notiz gespeichert')
      }
    })
  }

  return (
    <>
      <Tr className="border-b border-claimondo-border last:border-b-0 hover:bg-claimondo-bg/40">
        <Td>
          <div className="font-medium text-claimondo-navy">
            {e.vorname} {e.nachname}
          </div>
          <div className="text-xs text-claimondo-ondo">
            <a href={`mailto:${e.email}`} className="hover:underline">
              {e.email}
            </a>
            {e.telefon && (
              <>
                {' · '}
                <a href={`tel:${e.telefon}`} className="hover:underline">
                  {e.telefon}
                </a>
              </>
            )}
          </div>
        </Td>
        <Td>
          {e.plz} {e.ort ?? ''}
        </Td>
        <Td>
          {qualis.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {qualis.map((q) => (
                <span
                  key={q}
                  className="rounded-full border border-claimondo-border bg-claimondo-bg px-2 py-0.5 text-[10px] font-semibold text-claimondo-navy"
                >
                  {q}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-claimondo-ondo/70">—</span>
          )}
        </Td>
        <Td className="text-claimondo-ondo!">
          {e.jahre_erfahrung ? `${e.jahre_erfahrung}j` : '—'}
          {e.aktuelle_auftraege_pro_monat ? ` · ${e.aktuelle_auftraege_pro_monat}/mo` : ''}
        </Td>
        <Td>
          <select
            value={currentStatus}
            onChange={(ev) => changeStatus(ev.target.value as StatusKey)}
            disabled={pending}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sl?.color ?? ''}`}
          >
            {STATUS_KEYS.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k].label}
              </option>
            ))}
          </select>
        </Td>
        <Td className="text-xs text-claimondo-ondo!">
          {new Date(e.erstellt_am).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
        </Td>
        <Td>
          <button
            onClick={onToggle}
            className="text-xs font-medium text-claimondo-ondo hover:text-claimondo-navy"
          >
            {expanded ? 'Schließen' : 'Details'}
          </button>
        </Td>
      </Tr>
      {expanded && (
        <Tr className="bg-claimondo-bg/40">
          <Td colSpan={7} className="py-4!">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                  Geschäft
                </p>
                <dl className="mt-2 space-y-1 text-xs text-claimondo-navy">
                  {e.unternehmen && (
                    <div>
                      <dt className="inline text-claimondo-ondo">Unternehmen: </dt>
                      <dd className="inline font-medium">{e.unternehmen}</dd>
                    </div>
                  )}
                  {e.schwerpunkte && (
                    <div>
                      <dt className="inline text-claimondo-ondo">Schwerpunkte: </dt>
                      <dd className="inline">{e.schwerpunkte}</dd>
                    </div>
                  )}
                  {e.dat_expert_nummer && (
                    <div>
                      <dt className="inline text-claimondo-ondo">DAT-Nr.: </dt>
                      <dd className="inline font-mono">{e.dat_expert_nummer}</dd>
                    </div>
                  )}
                  {e.bvsk_mitgliedsnummer && (
                    <div>
                      <dt className="inline text-claimondo-ondo">BVSK-Nr.: </dt>
                      <dd className="inline font-mono">{e.bvsk_mitgliedsnummer}</dd>
                    </div>
                  )}
                  {e.ihk_zertifikat_nummer && (
                    <div>
                      <dt className="inline text-claimondo-ondo">IHK: </dt>
                      <dd className="inline font-mono">{e.ihk_zertifikat_nummer}</dd>
                    </div>
                  )}
                  {e.oebuv_bestellungsnummer && (
                    <div>
                      <dt className="inline text-claimondo-ondo">öbuv: </dt>
                      <dd className="inline font-mono">{e.oebuv_bestellungsnummer}</dd>
                    </div>
                  )}
                </dl>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                  Notizen
                </p>
                <textarea
                  value={notiz}
                  onChange={(ev) => setNotiz(ev.target.value)}
                  rows={4}
                  placeholder="Triage-Notizen, Telefonat-Zusammenfassung…"
                  className="mt-2 w-full rounded-xl border border-claimondo-border bg-white px-3 py-2 text-xs text-claimondo-navy placeholder-claimondo-ondo/40 outline-none focus:border-claimondo-ondo"
                />
                <button
                  onClick={saveNotiz}
                  disabled={pending}
                  className="mt-2 rounded-xl bg-claimondo-navy px-4 py-2 text-xs font-semibold text-white hover:bg-claimondo-ondo disabled:opacity-50"
                >
                  Notiz speichern
                </button>
              </div>
            </div>
          </Td>
        </Tr>
      )}
    </>
  )
}
