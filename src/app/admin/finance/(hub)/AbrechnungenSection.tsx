'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { markiereAlsBezahlt, storniereAbrechnung, manuellVersenden, manuellGenerieren } from '../abrechnungen-actions'

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
}

type Props = {
  abrechnungen: Abrechnung[]
  pdfBaseUrl: string
}

const STATUS_COLORS: Record<string, string> = {
  entwurf: 'bg-[#f8f9fb] text-claimondo-ondo',
  versendet: 'bg-[#f8f9fb] text-claimondo-ondo',
  bezahlt: 'bg-emerald-50 text-emerald-600',
  ueberfaellig: 'bg-red-50 text-red-600',
  storniert: 'bg-[#f8f9fb] text-claimondo-ondo/70 line-through',
}

function eur(val: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AbrechnungenSection({ abrechnungen, pdfBaseUrl }: Props) {
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
    try {
      await markiereAlsBezahlt(bezahltModal.id, parseFloat(bezahltBetrag) || bezahltModal.brutto)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler')
    }
    setBezahltModal(null)
    setBezahltBetrag('')
    setLoading(null)
  }

  async function handleStornieren(id: string) {
    if (!confirm('Abrechnung wirklich stornieren?')) return
    setLoading(id)
    try { await storniereAbrechnung(id) } catch { /* */ }
    setLoading(null)
  }

  async function handleVersenden(id: string) {
    setLoading(id)
    try { await manuellVersenden(id) } catch (err) { toast.error(err instanceof Error ? err.message : 'Fehler') }
    setLoading(null)
  }

  async function handleGenerieren() {
    if (!genMonat) return
    setLoading('gen')
    try { await manuellGenerieren(genMonat, genTyp) } catch (err) { toast.error(err instanceof Error ? err.message : 'Fehler') }
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
                className="border border-claimondo-border rounded-lg px-2 py-1 text-claimondo-navy"
              >
                <option value="alle">Alle Typen</option>
                <option value="marketing">Marketing</option>
                <option value="kanzlei">Kanzlei</option>
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="border border-claimondo-border rounded-lg px-2 py-1 text-claimondo-navy"
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
          <div className="px-5 py-3 bg-[#f8f9fb] border-b border-claimondo-border flex flex-wrap items-center gap-2 text-xs">
            <span className="text-claimondo-ondo">Neue Abrechnung:</span>
            <input
              type="month"
              value={genMonat}
              onChange={e => setGenMonat(e.target.value)}
              className="border border-claimondo-border rounded-lg px-2 py-1"
            />
            <select
              value={genTyp}
              onChange={e => setGenTyp(e.target.value as 'marketing' | 'kanzlei')}
              className="border border-claimondo-border rounded-lg px-2 py-1"
            >
              <option value="marketing">Marketing</option>
              <option value="kanzlei">Kanzlei</option>
            </select>
            <button
              onClick={handleGenerieren}
              disabled={!genMonat || loading === 'gen'}
              className="bg-[#4573A2] text-white px-3 py-1 rounded-lg hover:bg-[#3a6590] disabled:opacity-50"
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-claimondo-border">
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium text-xs">Nr.</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium text-xs">Empfänger</th>
                    <th className="text-left px-4 py-3 text-claimondo-ondo font-medium text-xs">Zeitraum</th>
                    <th className="text-right px-4 py-3 text-claimondo-ondo font-medium text-xs">Brutto</th>
                    <th className="text-center px-4 py-3 text-claimondo-ondo font-medium text-xs">Versand</th>
                    <th className="text-center px-4 py-3 text-claimondo-ondo font-medium text-xs">Fällig</th>
                    <th className="text-center px-4 py-3 text-claimondo-ondo font-medium text-xs">Status</th>
                    <th className="text-right px-4 py-3 text-claimondo-ondo font-medium text-xs">Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(abr => (
                    <tr key={abr.id} className="border-b border-claimondo-border/50 hover:bg-[#f8f9fb] transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-[#4573A2]">{abr.abrechnungs_nr}</td>
                      <td className="px-4 py-3 text-claimondo-navy text-xs">
                        <span className="block">{abr.empfaenger_name}</span>
                        <span className="text-[10px] text-claimondo-ondo/70">{abr.empfaenger_typ}</span>
                      </td>
                      <td className="px-4 py-3 text-claimondo-ondo text-xs">
                        {fmtDate(abr.abrechnungs_zeitraum_start)} — {fmtDate(abr.abrechnungs_zeitraum_ende)}
                      </td>
                      <td className="px-4 py-3 text-right text-claimondo-navy tabular-nums text-xs font-semibold">{eur(abr.summe_brutto)}</td>
                      <td className="px-4 py-3 text-center text-claimondo-ondo text-xs">{fmtDate(abr.versand_datum)}</td>
                      <td className="px-4 py-3 text-center text-claimondo-ondo text-xs">{fmtDate(abr.faellig_am)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[abr.status] ?? 'bg-[#f8f9fb] text-claimondo-ondo'}`}>
                          {abr.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* PDF Download */}
                          {abr.pdf_path && (
                            <a
                              href={`${pdfBaseUrl}/${abr.pdf_path}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[10px] px-2 py-0.5 rounded bg-[#f8f9fb] text-claimondo-ondo hover:bg-claimondo-border"
                            >
                              PDF
                            </a>
                          )}
                          {/* Versenden (nur Entwurf) */}
                          {abr.status === 'entwurf' && (
                            <button
                              onClick={() => handleVersenden(abr.id)}
                              disabled={loading === abr.id}
                              className="text-[10px] px-2 py-0.5 rounded bg-[#f8f9fb] text-claimondo-ondo hover:bg-[#f8f9fb] disabled:opacity-50"
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Bezahlt-Modal */}
          {bezahltModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
                <h3 className="text-sm font-semibold text-claimondo-navy mb-4">Als bezahlt markieren</h3>
                <label className="block text-xs text-claimondo-ondo mb-1">Eingegangener Betrag (EUR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={bezahltBetrag}
                  onChange={e => setBezahltBetrag(e.target.value)}
                  className="w-full border border-claimondo-border rounded-lg px-3 py-2 text-sm mb-4"
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
                    className="px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {loading === bezahltModal.id ? 'Speichere...' : 'Bestätigen'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
