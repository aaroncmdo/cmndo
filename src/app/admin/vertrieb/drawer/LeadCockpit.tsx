'use client'
// Vertrieb-CRM P2: das CRM-Cockpit fuer einen Lead. Alle Mutationen ueber bestehende
// partner-leads-Actions (updatePartnerLead / konvertierePartnerLead / protokolliereAktivitaet).
//
// Realtime-Ops (Fix Doppel-Reload): Feld-Aenderungen werden OPTIMISTISCH lokal eingetragen
// (onPatchDetail) — der Client kennt den Wert bereits, es gibt keinen Refetch/Neu-Load. Bei
// Server-Fehler wird der vorige Wert zurueckgerollt. onReloadDetail() ist ein STILLER
// Hintergrund-Refetch (kein Spinner) — nur wo der Server etwas berechnet (Auto-Log-Historie
// bei Status/Einstufung, Website-Anreicherung). onConverted() = einmaliger Roster-Refresh.
import { useEffect, useState } from 'react'
import { Button } from '@/components/primitives'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { updatePartnerLead, konvertierePartnerLead } from '@/app/admin/partner-leads/actions'
import AktivitaetLog from './AktivitaetLog'
import MailComposer from './MailComposer'
import ColdMailComposer from './ColdMailComposer'
import ColdMailVerlauf from './ColdMailVerlauf'
import { LEAD_STATUS_OPTIONS, LEAD_EINSTUFUNG_OPTIONS } from '../_lib/lead-status-labels'
import type { VorlageTyp } from '../_lib/mail-vorlagen'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'
import type { VertriebLeadDetail, LeadAktivitaet } from '../_lib/lead-detail'
import { reichereLeadAusWebsite } from '../_actions/reichere-lead-website'

const FELD_CLS =
  'rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40'
const CARD_CLS = 'rounded-ios-md border border-claimondo-border bg-claimondo-bg/40 p-3'
const LABEL_CLS = 'text-caption uppercase tracking-wide text-claimondo-ondo/60'

export default function LeadCockpit({
  kontakt,
  detail,
  onPatchDetail,
  onAppendAktivitaet,
  onReloadDetail,
  onConverted,
}: {
  kontakt: VertriebKontakt
  detail: VertriebLeadDetail
  // Optimistisch: neuen Feld-Stand sofort lokal spiegeln (kein Refetch).
  onPatchDetail: (partial: Partial<VertriebLeadDetail>) => void
  // Optimistisch: neue Aktivitaet oben einfuegen.
  onAppendAktivitaet: (a: LeadAktivitaet) => void
  // Stiller Hintergrund-Refetch fuer server-berechnete Daten.
  onReloadDetail: () => void
  // Nach Konvertierung: einmaliger Roster-Refresh (Identitaet wechselt).
  onConverted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [notiz, setNotiz] = useState(detail.notiz ?? '')
  const [composerTyp, setComposerTyp] = useState<VorlageTyp | null>(null)
  const [coldMailOffen, setColdMailOffen] = useState(false)
  // Nach einem Send den Verlauf neu laden (der Send-Status kommt danach per Webhook nach).
  const [verlaufToken, setVerlaufToken] = useState(0)
  const [apForm, setApForm] = useState({
    vorname: detail.ansprechpartner.vorname ?? '',
    nachname: detail.ansprechpartner.nachname ?? '',
    position: detail.ansprechpartner.position ?? '',
    email: detail.ansprechpartner.email ?? '',
    telefon: detail.ansprechpartner.telefon ?? '',
  })
  const [enrichBusy, setEnrichBusy] = useState(false)
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null)

  // apForm folgt dem Server-Stand: nach Enrichment/Refresh die editierbaren Felder aktualisieren.
  useEffect(() => {
    setApForm({
      vorname: detail.ansprechpartner.vorname ?? '',
      nachname: detail.ansprechpartner.nachname ?? '',
      position: detail.ansprechpartner.position ?? '',
      email: detail.ansprechpartner.email ?? '',
      telefon: detail.ansprechpartner.telefon ?? '',
    })
  }, [
    detail.ansprechpartner.vorname,
    detail.ansprechpartner.nachname,
    detail.ansprechpartner.position,
    detail.ansprechpartner.email,
    detail.ansprechpartner.telefon,
  ])

  /**
   * Speichert Feld-Aenderungen. `optimistisch` wird SOFORT lokal gespiegelt (Echtzeit,
   * kein Refetch); schlaegt der Server-Write fehl, wird der vorige Stand zurueckgerollt.
   * `reload` (nur Status/Einstufung) holt danach still die Auto-Log-Historie nach.
   */
  async function patch(
    updates: Parameters<typeof updatePartnerLead>[1],
    optimistisch: Partial<VertriebLeadDetail>,
    opts?: { reload?: boolean },
  ) {
    // Snapshot der betroffenen Felder fuer den Rollback bei Fehler.
    const vorher: Partial<VertriebLeadDetail> = {}
    if ('status' in optimistisch) vorher.status = detail.status
    if ('einstufung' in optimistisch) vorher.einstufung = detail.einstufung
    if ('notiz' in optimistisch) vorher.notiz = detail.notiz
    if ('ansprechpartner' in optimistisch) vorher.ansprechpartner = detail.ansprechpartner

    onPatchDetail(optimistisch) // sofort sichtbar
    setBusy(true)
    setFehler(null)
    const res = await updatePartnerLead(kontakt.id, updates)
    setBusy(false)
    if (!res.ok) {
      onPatchDetail(vorher) // Rollback
      setFehler(res.error ?? 'Konnte nicht gespeichert werden.')
      return
    }
    if (opts?.reload) onReloadDetail()
  }

  async function speichereAnsprechpartner() {
    const ap = {
      vorname: apForm.vorname.trim() || null,
      nachname: apForm.nachname.trim() || null,
      position: apForm.position.trim() || null,
      email: apForm.email.trim() || null,
      telefon: apForm.telefon.trim() || null,
    }
    await patch(
      {
        ansprechpartner_vorname: ap.vorname,
        ansprechpartner_nachname: ap.nachname,
        ansprechpartner_position: ap.position,
        ansprechpartner_email: ap.email,
        ansprechpartner_telefon: ap.telefon,
      },
      { ansprechpartner: ap },
    )
  }

  async function anreichern() {
    setEnrichBusy(true)
    setEnrichMsg(null)
    const res = await reichereLeadAusWebsite(kontakt.id)
    setEnrichBusy(false)
    if (!res.ok) {
      setEnrichMsg(res.error ?? 'Anreicherung fehlgeschlagen.')
      return
    }
    setEnrichMsg('Von Website übernommen.')
    // Der Server hat die ansprechpartner_*-Felder berechnet -> still nachladen (kein Neu-Load).
    onReloadDetail()
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
    onConverted()
  }

  const ap = detail.ansprechpartner
  const apName = [ap.vorname, ap.nachname].filter(Boolean).join(' ')
  const apDirty =
    apForm.vorname !== (ap.vorname ?? '') ||
    apForm.nachname !== (ap.nachname ?? '') ||
    apForm.position !== (ap.position ?? '') ||
    apForm.email !== (ap.email ?? '') ||
    apForm.telefon !== (ap.telefon ?? '')

  return (
    <div className="space-y-4">
      <div className={CARD_CLS}>
        <div className="flex items-center justify-between gap-2">
          <p className={LABEL_CLS}>Ansprechpartner</p>
          <Button variant="ghost" size="sm" loading={enrichBusy} onClick={anreichern}>
            🔍 Von Website anreichern
          </Button>
        </div>
        {enrichMsg && <p className="mt-1 text-caption text-claimondo-ondo/60">{enrichMsg}</p>}
        {/* Editierbar (Aaron): Name/Position + E-Mail und Telefon einzeln. Speichern via
            updatePartnerLead (ansprechpartner_*-Felder existieren bereits auf partner_leads). */}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input value={apForm.vorname} onChange={(e) => setApForm({ ...apForm, vorname: e.target.value })} placeholder="Vorname" className={FELD_CLS} />
          <input value={apForm.nachname} onChange={(e) => setApForm({ ...apForm, nachname: e.target.value })} placeholder="Nachname" className={FELD_CLS} />
          <input value={apForm.position} onChange={(e) => setApForm({ ...apForm, position: e.target.value })} placeholder="Position (z.B. Geschäftsführer)" className={`${FELD_CLS} col-span-2`} />
          <input type="email" value={apForm.email} onChange={(e) => setApForm({ ...apForm, email: e.target.value })} placeholder="E-Mail" className={FELD_CLS} />
          <input value={apForm.telefon} onChange={(e) => setApForm({ ...apForm, telefon: e.target.value })} placeholder="Telefon" className={FELD_CLS} />
        </div>
        {apDirty && (
          <div className="mt-2">
            <Button variant="navy" size="sm" loading={busy} onClick={speichereAnsprechpartner}>
              Ansprechpartner speichern
            </Button>
          </div>
        )}
        {(kontakt.email || kontakt.telefon) && (
          <p className="mt-2 text-caption text-claimondo-ondo/50">
            Firma-Kontakt: {kontakt.email ?? '—'}
            {kontakt.telefon ? ` · ${kontakt.telefon}` : ''}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge domain="vertrieb-workflow" code={kontakt.stufe} size="sm" />
          <select
            value={detail.status}
            onChange={(e) => patch({ status: e.target.value }, { status: e.target.value }, { reload: true })}
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
          onChange={(e) =>
            patch(
              { einstufung: e.target.value || null },
              { einstufung: e.target.value || null },
              { reload: true },
            )
          }
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
        <Button variant="ghost" size="sm" onClick={() => setComposerTyp('vorstellung')}>
          ✉️ Vorstellungs-Mail
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setComposerTyp('terminbestaetigung')}>
          📅 Terminbestätigung
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setColdMailOffen(true)}>
          📨 Cold-Mail
        </Button>
        <Button variant="navy" size="sm" loading={busy} onClick={convert}>
          → In Partner umwandeln
        </Button>
      </div>
      {fehler && <p className="text-sm text-danger">{fehler}</p>}

      {composerTyp && (
        <MailComposer
          leadId={kontakt.id}
          empfaenger={detail.ansprechpartner.email ?? kontakt.email}
          merge={{ Ansprechpartner: apName || (kontakt.name ?? ''), Firma: kontakt.name ?? '', Termin: '' }}
          startTyp={composerTyp}
          onClose={() => setComposerTyp(null)}
          onSent={onReloadDetail}
        />
      )}

      {coldMailOffen && (
        <ColdMailComposer
          leadId={kontakt.id}
          empfaenger={detail.ansprechpartner.email ?? kontakt.email}
          onClose={() => setColdMailOffen(false)}
          onSent={() => {
            setVerlaufToken((t) => t + 1)
            onReloadDetail()
          }}
        />
      )}

      {/* S3: Sende-Verlauf inkl. Zustell-/Oeffnungs-Status (Resend-Webhook).
          Rendert sich selbst weg, wenn noch nichts gesendet wurde. */}
      <ColdMailVerlauf leadId={kontakt.id} reloadToken={verlaufToken} />

      <div>
        <p className={`${LABEL_CLS} mb-2`}>Aktivität</p>
        <AktivitaetLog
          leadId={kontakt.id}
          aktivitaeten={detail.aktivitaeten}
          onAppend={onAppendAktivitaet}
          onReload={onReloadDetail}
        />
      </div>

      <div>
        <p className={`${LABEL_CLS} mb-1`}>Notiz</p>
        <textarea
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          onBlur={() => notiz !== (detail.notiz ?? '') && patch({ notiz }, { notiz })}
          rows={3}
          placeholder="Interne Notiz zum Lead…"
          className={`${FELD_CLS} w-full resize-y`}
        />
      </div>
    </div>
  )
}
