'use client'
// Vertrieb-CRM P2: das CRM-Cockpit fuer einen Lead. Alle Mutationen ueber bestehende
// partner-leads-Actions (updatePartnerLead / konvertierePartnerLead / protokolliereAktivitaet).
import { useState } from 'react'
import { Button } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { updatePartnerLead, konvertierePartnerLead } from '@/app/admin/partner-leads/actions'
import AktivitaetLog from './AktivitaetLog'
import { LEAD_STATUS_OPTIONS, LEAD_EINSTUFUNG_OPTIONS } from '../_lib/lead-status-labels'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebLeadDetail } from '../_lib/lead-detail'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'
const CARD_CLS = 'rounded-ios-md border border-claimondo-border bg-claimondo-bg/40 p-3'
const LABEL_CLS = 'text-caption uppercase tracking-wide text-claimondo-ondo/60'

export default function LeadCockpit({
  kontakt,
  detail,
  onChanged,
}: {
  kontakt: VertriebKontakt
  detail: VertriebLeadDetail
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [notiz, setNotiz] = useState(detail.notiz ?? '')

  async function patch(p: Parameters<typeof updatePartnerLead>[1]) {
    setBusy(true)
    setFehler(null)
    const res = await updatePartnerLead(kontakt.id, p)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Konnte nicht gespeichert werden.')
      return
    }
    onChanged()
  }

  async function convert() {
    if (!confirm('Diesen Lead in einen aktiven Partner umwandeln? Es wird ein Zugang angelegt und eine Willkommens-Mail versendet.'))
      return
    setBusy(true)
    setFehler(null)
    const res = await konvertierePartnerLead(kontakt.id)
    setBusy(false)
    if (!res.ok) {
      setFehler(res.error ?? 'Konvertierung fehlgeschlagen.')
      return
    }
    onChanged()
  }

  const ap = detail.ansprechpartner
  const apName = [ap.vorname, ap.nachname].filter(Boolean).join(' ')
  const hatAp = apName || ap.position || ap.email || ap.telefon

  return (
    <div className="space-y-4">
      <div className={CARD_CLS}>
        <p className={LABEL_CLS}>Ansprechpartner</p>
        {hatAp ? (
          <p className="text-sm text-claimondo-navy">
            {apName && <span className="font-medium">{apName}</span>}
            {ap.position && <span className="text-claimondo-ondo/70"> · {ap.position}</span>}
            {(ap.telefon || ap.email) && <br />}
            {ap.telefon && <span>{ap.telefon}</span>}
            {ap.telefon && ap.email && <span> · </span>}
            {ap.email && <span>{ap.email}</span>}
          </p>
        ) : (
          <p className="text-caption text-claimondo-ondo/50">Noch kein Ansprechpartner hinterlegt.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} size="sm" />
          <select
            value={detail.status}
            onChange={(e) => patch({ status: e.target.value })}
            disabled={busy}
            aria-label="Status ändern"
            className={FELD_CLS}
          >
            {LEAD_STATUS_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <select
          value={detail.einstufung ?? ''}
          onChange={(e) => patch({ einstufung: e.target.value || null })}
          disabled={busy}
          aria-label="Einstufung"
          className={FELD_CLS}
        >
          <option value="">Uneingestuft</option>
          {LEAD_EINSTUFUNG_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
        <Button variant="navy" size="sm" loading={busy} onClick={convert}>
          → In Partner umwandeln
        </Button>
      </div>
      {fehler && <p className="text-sm text-danger">{fehler}</p>}

      <div>
        <p className={`${LABEL_CLS} mb-2`}>Aktivität</p>
        <AktivitaetLog leadId={kontakt.id} aktivitaeten={detail.aktivitaeten} onChanged={onChanged} />
      </div>

      <div>
        <p className={`${LABEL_CLS} mb-1`}>Notiz</p>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          onBlur={() => notiz !== (detail.notiz ?? '') && patch({ notiz })}
          rows={3}
          placeholder="Interne Notiz zum Lead…"
          className={`${FELD_CLS} w-full resize-y`}
        />
      </div>
    </div>
  )
}
