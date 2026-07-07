'use client'

// Werkstatt-Portal „Offene Anfragen": eigene noch nicht konvertierte Inbound-Leads
// (Quelle v_werkstatt_lead, RLS-gegatet). Pro Lead ein Bearbeiten-Drawer, damit die
// Werkstatt Kunde-/Fahrzeug-/Schaden-Daten korrigieren & vervollstaendigen kann.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import type { WerkstattLead } from '@/lib/werkstatt/leads-queries'
import {
  bearbeiteWerkstattLead,
  resendeAnfrageFlowLink,
  oeffneAnfrageFlow,
} from '@/app/werkstatt/(shell)/anfragen/actions'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { Button, Modal } from '@/components/primitives'
import { SCHADENTYP_OPTIONS, schadentypLabel } from '@/lib/werkstatt/schadentyp-options'

const DATE = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
function fmtDate(iso: string | null): string {
  return iso ? DATE.format(new Date(iso)) : '–'
}

type FeldKey =
  | 'vorname' | 'nachname' | 'telefon' | 'email'
  | 'fahrzeug_hersteller' | 'fahrzeug_modell' | 'kennzeichen' | 'fin' | 'erstzulassung'
  | 'schadentyp' | 'schadens_hergang' | 'unfalldatum' | 'unfallort'

type FeldDef = {
  key: FeldKey
  label: string
  gruppe: 'Kunde' | 'Fahrzeug' | 'Schaden'
  type?: string
  textarea?: boolean
  options?: readonly { value: string; label: string }[]
}

const FELDER: FeldDef[] = [
  { key: 'vorname', label: 'Vorname', gruppe: 'Kunde' },
  { key: 'nachname', label: 'Nachname', gruppe: 'Kunde' },
  { key: 'telefon', label: 'Telefon', gruppe: 'Kunde' },
  { key: 'email', label: 'E-Mail', gruppe: 'Kunde' },
  { key: 'fahrzeug_hersteller', label: 'Hersteller', gruppe: 'Fahrzeug' },
  { key: 'fahrzeug_modell', label: 'Modell', gruppe: 'Fahrzeug' },
  { key: 'kennzeichen', label: 'Kennzeichen', gruppe: 'Fahrzeug' },
  { key: 'fin', label: 'FIN', gruppe: 'Fahrzeug' },
  { key: 'erstzulassung', label: 'Erstzulassung', gruppe: 'Fahrzeug' },
  { key: 'schadentyp', label: 'Schadenart', gruppe: 'Schaden', options: SCHADENTYP_OPTIONS },
  { key: 'unfalldatum', label: 'Unfalldatum', gruppe: 'Schaden', type: 'date' },
  { key: 'unfallort', label: 'Unfallort', gruppe: 'Schaden' },
  { key: 'schadens_hergang', label: 'Hergang', gruppe: 'Schaden', textarea: true },
]

const GRUPPEN = ['Kunde', 'Fahrzeug', 'Schaden'] as const

type Props = {
  leads: WerkstattLead[]
  werkstattName: string
}

export function WerkstattAnfragen({ leads, werkstattName }: Props) {
  const router = useRouter()
  const [editLead, setEditLead] = useState<WerkstattLead | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  function oeffnen(lead: WerkstattLead) {
    const init: Record<string, string> = {}
    for (const f of FELDER) init[f.key] = (lead[f.key] as string | null) ?? ''
    setForm(init)
    setEditLead(lead)
  }

  async function speichern() {
    if (!editLead) return
    setSaving(true)
    const r = await bearbeiteWerkstattLead(editLead.id, form)
    setSaving(false)
    if (!r.ok) {
      toast.error(r.error ?? 'Speichern fehlgeschlagen')
      return
    }
    toast.success('Anfrage aktualisiert.')
    setEditLead(null)
    router.refresh()
  }

  // Flow-Push: den Kunden durch seinen offenen Vorgang holen (gehoert zu Anfragen, nicht Auftraegen).
  async function handleResend(lead: WerkstattLead) {
    setBusy(`${lead.id}:resend`)
    const r = await resendeAnfrageFlowLink(lead.id)
    setBusy(null)
    if (!r.ok) {
      toast.error(r.error ?? 'Versand fehlgeschlagen')
      return
    }
    toast.success(`Link gesendet (${r.kanal === 'whatsapp' ? 'WhatsApp' : 'E-Mail'}).`)
  }

  async function handleFlow(lead: WerkstattLead) {
    setBusy(`${lead.id}:flow`)
    const r = await oeffneAnfrageFlow(lead.id)
    setBusy(null)
    if (!r.ok) {
      toast.error(r.error ?? 'Flow konnte nicht geöffnet werden')
      return
    }
    // Neuer Tab — die Werkstatt behaelt ihr Portal offen, waehrend sie den Kunden-Flow durchgeht.
    window.open(r.url, '_blank', 'noopener,noreferrer')
  }

  const kundeName = (l: WerkstattLead) => [l.vorname, l.nachname].filter(Boolean).join(' ') || '–'
  const fahrzeug = (l: WerkstattLead) => [l.fahrzeug_hersteller, l.fahrzeug_modell].filter(Boolean).join(' ') || '–'

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-heading-md text-claimondo-navy font-bold">Offene Anfragen</h1>
        <p className="text-body text-claimondo-ondo mt-0.5">
          Ihre noch offenen Kunden-Anfragen für {werkstattName} — Daten prüfen, korrigieren & vervollständigen.
        </p>
      </header>

      <DataTableContainer>
        <Table>
          <Thead>
            <Tr>
              <Th>Kunde</Th>
              <Th>Fahrzeug</Th>
              <Th>Kontakt</Th>
              <Th>Schaden</Th>
              <Th>Eingegangen</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {leads.length === 0 ? (
              <Tr>
                <Td colSpan={6} className="text-center text-claimondo-ondo py-8">
                  Keine offenen Anfragen. Neue Kunden erscheinen hier, sobald sie über Ihren QR-Code
                  oder einen Kostenvoranschlag reinkommen.
                </Td>
              </Tr>
            ) : (
              leads.map((l) => (
                <Tr key={l.id}>
                  <Td className="text-claimondo-navy font-medium">{kundeName(l)}</Td>
                  <Td className="text-body-sm">
                    <div className="text-claimondo-navy">{fahrzeug(l)}</div>
                    {l.kennzeichen && (
                      <div className="text-claimondo-ondo text-xs font-mono">{l.kennzeichen}</div>
                    )}
                  </Td>
                  <Td className="text-body-sm text-claimondo-ondo">
                    <div>{l.telefon ?? '–'}</div>
                    {l.email && <div className="text-xs">{l.email}</div>}
                  </Td>
                  <Td className="text-body-sm text-claimondo-navy">{schadentypLabel(l.schadentyp)}</Td>
                  <Td className="text-body-sm text-claimondo-ondo">{fmtDate(l.created_at)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Button variant="ghost" size="sm" onClick={() => oeffnen(l)}>
                        Bearbeiten
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `${l.id}:resend`}
                        onClick={() => handleResend(l)}
                      >
                        Link senden
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={busy === `${l.id}:flow`}
                        onClick={() => handleFlow(l)}
                      >
                        Flow öffnen
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </DataTableContainer>

      <Modal
        open={editLead != null}
        onClose={() => {
          if (!saving) setEditLead(null)
        }}
        ariaLabel="Anfrage bearbeiten"
        maxWidth={640}
      >
        <div className="space-y-4">
          <h2 className="text-heading-sm text-claimondo-navy font-semibold">Anfrage bearbeiten</h2>

          {GRUPPEN.map((gruppe) => (
            <div key={gruppe} className="space-y-2">
              <p className="text-body-xs font-semibold uppercase tracking-wide text-claimondo-ondo/70">{gruppe}</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {FELDER.filter((f) => f.gruppe === gruppe).map((f) => (
                  <div key={f.key} className={f.textarea ? 'sm:col-span-2' : ''}>
                    <label htmlFor={`f-${f.key}`} className="text-body-xs font-medium text-claimondo-navy">
                      {f.label}
                    </label>
                    {f.options ? (
                      <select
                        id={`f-${f.key}`}
                        value={form[f.key] ?? ''}
                        disabled={saving}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        className="mt-0.5 w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-50"
                      >
                        <option value="">–</option>
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : f.textarea ? (
                      <textarea
                        id={`f-${f.key}`}
                        rows={2}
                        value={form[f.key] ?? ''}
                        disabled={saving}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        className="mt-0.5 w-full resize-none rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-50"
                      />
                    ) : (
                      <input
                        id={`f-${f.key}`}
                        type={f.type ?? 'text'}
                        value={form[f.key] ?? ''}
                        disabled={saving}
                        onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                        className="mt-0.5 w-full rounded-ios-sm border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/30 disabled:opacity-50"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" disabled={saving} onClick={() => setEditLead(null)}>
              Abbrechen
            </Button>
            <Button variant="navy" size="sm" loading={saving} onClick={speichern}>
              Speichern
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
