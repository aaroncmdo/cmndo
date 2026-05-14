'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { markiereAlsBezahlt, storniereAbrechnung, manuellVersenden, manuellGenerieren } from '../abrechnungen-actions'
import { Modal } from '@/components/primitives/Modal'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { ABRECHNUNG_STATUS_COLORS, ABRECHNUNG_STATUS_LABELS } from '@/lib/statusLabels'

type Abrechnung = {
  id: string
  empfaenger_typ: string
  empfaenger_name: string
  abrechnungs_nr: string
  abrechnungs_zeitraum_start: string
  abrechnungs_zeitraum_ende: string
  summe_brutto: number
  versand_datum: string | null
  faellig_am: string | null
  status: string
  pdf_path: string | null
  pdf_url: string | null
}

type Props = {
  abrechnungen: Abrechnung[]
}

function eur(val: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AbrechnungenSection({ abrechnungen }: Props) {
  const [filterTyp, setFilterTyp] = useState<string>('alle')
  const [filterStatus, setFilterStatus] = useState<string>('alle')
  const [bezahltModal, setBezahltModal] = useState<{ id: string; brutto: number } | null>(null)
  const [bezahltBetrag, setBezahltBetrag] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const [genMonat, setGenMonat] = useState('')
  const [genTyp, setGenTyp] = useState<'marketing' | 'kanzlei'>('marketing')

  const filtered = abrechnungen.filter(a => {
    if (filterTyp !== 'alle' && a.empfaenger_typ !== filterTyp) return false
    if (filterStatus !== 'alle' && a.status !== filterStatus) return false
    return true
  })

  async function handleBezahlt() {
    if (!bezahltModal) return
    setLoading(bezahltModal.id)
    const result = await markiereAlsBezahlt(bezahltModal.id, parseFloat(bezahltBetrag) || bezahltModal.brutto)
    if (!result.ok) toast.error(result.error ?? 'Fehler')
    setBezahltModal(null)
    setBezahltBetrag('')
    setLoading(null)
  }

  async function handleStornieren(id: string) {
    if (!confirm('Abrechnung wirklich stornieren?')) return
    setLoading(id)
    await storniereAbrechnung(id)
    setLoading(null)
  }

  async function handleVersenden(id: string) {
    setLoading(id)
    const result = await manuellVersenden(id)
    if (!result.ok) toast.error(result.error ?? 'Fehler')
    setLoading(null)
  }

  async function handleGenerieren() {
    if (!genMonat) return
    setLoading('gen')
    const result = await manuellGenerieren(genMonat, genTyp)
    if (!result.ok) toast.error(result.error ?? 'Fehler')
    setLoading(null)
    setGenMonat('')
  }

  return (
    <div className="pb-8">
      <div>
        <div className="bg-white border border-claimondo-border rounded-2xl overflow-hidden">

          {/* Header */}
          <div className="px-5 py-4 border-b border-claimondo-border flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-claimondo-ondo uppercase tracking-wider">
              Abrechnungen
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <select
                value={filterTyp}
                onChange={e => setFilterTyp(e.target.value)}
                className="border border-claimondo-border rounded-ios-lg px-2 py-1 text-claimondo-navy"
              >
                <option value="alle">Alle Typen</option>
                <option value="marketing">Marketing</option>
                <option value="kanzlei">Kanzlei</option>
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-claimondo-border rounded-ios-lg px-2 py-1 text-claimondo-navy"
              >
                <option value="alle">Alle Status</option>
                <option value="entwurf">Entwurf</option>
                <option value="versendet">Versendet</option>
                <option value="bezahlt">Bezahlt</option>
                <option value="ueberfaellig">Überfällig</option>
                <option value="storniert">Storniert</option>
              </select>
            </div>
          </div>

          {/* Manuell generieren */}
          <div className="px-5 py-3 bg-claimondo-bg border-b border-claimondo-border flex flex-wrap items-center gap-2 text-xs">
            <span className="text-claimondo-ondo">Neue Abrechnung:</span>
            <input
              type="month"
              value={genMonat}
              onChange={e => setGenMonat(e.target.value)}
              className="border border-claimondo-border rounded-ios-lg px-2 py-1"
            />
            <select
              value={genTyp}
              onChange={e => setGenTyp(e.target.value as 'marketing' | 'kanzlei')}
              className="border border-claimondo-border rounded-ios-lg px-2 py-1"
            >
              <option value="marketing">Marketing</option>
              <option value="kanzlei">Kanzlei</option>
            </select>
            <button
              onClick={handleGenerieren}
              disabled={!genMonat || loading === 'gen'}
              className="bg-claimondo-ondo text-white px-3 py-1 rounded-ios-lg hover:bg-claimondo-shield disabled:opacity-50"
            >
              {loading === 'gen' ? 'Generiere...' : 'Generieren'}
            </button>
          </div>

          {/* Tabelle */}
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-claimondo-ondo/70 text-sm">Keine Abrechnungen gefunden.</p>
            </div>
          ) : (
            <DataTableContainer variant="plain">
              <Table>
                <Thead className="!bg-transparent border-b border-claimondo-border">
                  <Tr>
                    <Th className="text-left !text-claimondo-ondo text-xs">Nr.</Th>
                    <Th className="text-left !text-claimondo-ondo text-xs">Empfänger</Th>
                    <Th className="text-left !text-claimondo-ondo text-xs">Zeitraum</Th>
                    <Th className="text-right !text-claimondo-ondo text-xs">Brutto</Th>
                    <Th className="text-center !text-claimondo-ondo text-xs">Versand</Th>
                    <Th className="text-center !text-claimondo-ondo text-xs">Fällig</Th>
                    <Th className="text-center !text-claimondo-ondo text-xs">Status</Th>
                    <Th className="text-right !text-claimondo-ondo text-xs">Aktionen</Th>
                  </Tr>
                </Thead>
                <Tbody className="!divide-y-0">
                  {filtered.map(abr => (
                    <Tr key={abr.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg transition-colors">
                      <Td className="font-mono text-xs !text-claimondo-ondo">{abr.abrechnungs_nr}</Td>
                      <Td className="text-xs">
                        <span className="block">{abr.empfaenger_name}</span>
                        <span className="text-[10px] text-claimondo-ondo/70">{abr.empfaenger_typ}</span>
                      </Td>
                      <Td className="!text-claimondo-ondo text-xs">
                        {fmtDate(abr.abrechnungs_zeitraum_start)} — {fmtDate(abr.abrechnungs_zeitraum_ende)}
                      </Td>
                      <Td className="text-right tabular-nums text-xs font-semibold">{eur(abr.summe_brutto)}</Td>
                      <Td className="text-center !text-claimondo-ondo text-xs">{fmtDate(abr.versand_datum)}</Td>
                      <Td className="text-center !text-claimondo-ondo text-xs">{fmtDate(abr.faellig_am)}</Td>
                      <Td className="text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${ABRECHNUNG_STATUS_COLORS[abr.status] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                          {ABRECHNUNG_STATUS_LABELS[abr.status] ?? abr.status}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* PDF Download — signed-URL, 1h TTL */}
                          {abr.pdf_url && (
                            <a
                              href={abr.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] px-2 py-0.5 rounded bg-claimondo-bg text-claimondo-ondo hover:bg-claimondo-border"
                            >
                              PDF
                            </a>
                          )}
                          {/* Versenden (nur Entwurf) */}
                          {abr.status === 'entwurf' && (
                            <button
                              onClick={() => handleVersenden(abr.id)}
                              disabled={loading === abr.id}
                              className="text-[10px] px-2 py-0.5 rounded bg-claimondo-bg text-claimondo-ondo hover:bg-claimondo-bg disabled:opacity-50"
                            >
                              {loading === abr.id ? '...' : 'Senden'}
                            </button>
                          )}
                          {/* Bezahlt markieren */}
                          {['versendet', 'ueberfaellig'].includes(abr.status) && (
                            <button
                              onClick={() => { setBezahltModal({ id: abr.id, brutto: abr.summe_brutto }); setBezahltBetrag(String(abr.summe_brutto)) }}
                              className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            >
                              Bezahlt
                            </button>
                          )}
                          {/* Stornieren */}
                          {!['storniert', 'bezahlt'].includes(abr.status) && (
                            <button
                              onClick={() => handleStornieren(abr.id)}
                              disabled={loading === abr.id}
                              className="text-[10px] px-2 py-0.5 rounded bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-50"
                            >
                              Storno
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </DataTableContainer>
          )}

          {/* Bezahlt-Modal */}
          <Modal open={bezahltModal !== null} onClose={() => setBezahltModal(null)} maxWidth={384} ariaLabel="Als bezahlt markieren">
            {bezahltModal && (
              <>
                <h3 className="text-sm font-semibold text-claimondo-navy mb-4">Als bezahlt markieren</h3>
                <label className="block text-xs text-claimondo-ondo mb-1">Eingegangener Betrag (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bezahltBetrag}
                  onChange={e => setBezahltBetrag(e.target.value)}
                  className="w-full border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm mb-4"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setBezahltModal(null)}
                    className="px-3 py-1.5 text-xs text-claimondo-ondo hover:text-claimondo-navy"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleBezahlt}
                    disabled={loading === bezahltModal.id}
                    className="px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-ios-lg hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {loading === bezahltModal.id ? 'Speichere...' : 'Bestätigen'}
                  </button>
                </div>
              </>
            )}
          </Modal>

        </div>
      </div>
    </div>
  )
}
