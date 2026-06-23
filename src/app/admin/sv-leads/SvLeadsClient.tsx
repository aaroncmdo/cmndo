'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MapPinIcon, PlusIcon } from 'lucide-react'
import { createSvLead, type SvLeadRow } from './actions'
import PageHeader from '@/components/shared/PageHeader'
import { Button, Modal } from '@/components/primitives'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'
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
  offen: 'bg-claimondo-bg text-claimondo-ondo',
  beansprucht_pending: 'bg-warning-soft text-warning-strong',
  beansprucht: 'bg-info-soft text-info-strong',
  konvertiert: 'bg-success-soft text-success-strong',
  abgelehnt: 'bg-danger-soft text-danger-strong',
}

function formatDatum(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function SvLeadsClient({ svLeads }: { svLeads: SvLeadRow[] }) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)
  const [loading, setLoading] = useState(false)

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

    const result = await createSvLead(fd)
    setLoading(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('SV-Lead angelegt.')
    setShowDialog(false)
    router.refresh()
  }

  return (
    <div className="h-full overflow-y-auto py-8">
      <div>
        <div className="mb-6">
          <PageHeader
            title="SV-Leads"
            description={`${svLeads.length} Dead-Pin${svLeads.length === 1 ? '' : 's'}`}
            icon={MapPinIcon}
            actions={
              <Button
                variant="navy"
                onClick={openDialog}
                iconLeft={<PlusIcon className="w-4 h-4" />}
              >
                Neuer Dead-Pin
              </Button>
            }
          />
        </div>

        <DataTableContainer variant="plain" className="bg-white rounded-ios-lg border border-claimondo-border overflow-hidden">
          <Table>
            <Thead className="bg-transparent! text-sm! normal-case! tracking-normal!">
              <Tr className="border-b border-claimondo-border">
                <Th className="text-left text-claimondo-ondo!">Name / Firma</Th>
                <Th className="text-left text-claimondo-ondo!">Ort</Th>
                <Th className="text-left text-claimondo-ondo!">Status</Th>
                <Th className="text-left text-claimondo-ondo!">Quelle</Th>
                <Th className="text-left text-claimondo-ondo!">Aktualisiert</Th>
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
                    <span className="text-claimondo-ondo text-sm">{lead.quelle ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="text-claimondo-ondo text-sm">{formatDatum(lead.aktualisiert_am)}</span>
                  </Td>
                </Tr>
              ))}
              {svLeads.length === 0 && (
                <Tr>
                  <Td colSpan={5} className="py-12! text-center text-claimondo-ondo!">
                    Noch keine SV-Leads vorhanden.
                  </Td>
                </Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>

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
