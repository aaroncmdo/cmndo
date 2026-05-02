'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { terminAnnehmen, terminGegenvorschlag } from '@/lib/actions/termin-actions'
import { waehleGegenvorschlagSlot } from './actions'
import Link from 'next/link'
// AAR-754 (Phase C): Shared Stammdaten.
import { StammdatenReadSection } from '@/components/shared/stammdaten'
import { Modal } from '@/components/primitives/Modal'
// AAR-759 (Phase 1): Mietwagen-Status-Anzeige
import { MietwagenStatusCard } from '@/components/shared/mietwagen'

type Dokument = { id: string; typ: string; datei_url: string; datei_name: string | null; created_at: string }
type AktiverTermin = { id: string; status: string; start_zeit: string; end_zeit: string; vorgeschlagenes_datum: string | null; gegenvorschlag_von: string | null; gegenvorschlag_grund: string | null; sv_id: string | null; sv_vorgeschlagene_slots?: Array<{ datum: string; uhrzeit: string }> | null }

function fmt(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// Tab-System entfernt — Übersicht + Dokumente werden direkt
// untereinander gerendert.

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FallDetailSections({
  fall, svName, dokumente, aktiverTermin,
}: {
  fall: Record<string, unknown>
  svName: string | null
  /** @deprecated — Kontakt-Cards leben in der Sidebar */
  svTelefon?: string | null
  svVerifiziert?: boolean
  kbName?: string | null
  dokumente: Dokument[]
  /** @deprecated — Chat ist entfernt, Nachrichten gehen ueber Sidebar */
  nachrichten?: unknown[]
  /** @deprecated — userId nur noch fuer Chat genutzt, der ist raus */
  userId?: string
  /** @deprecated — Chat-Teilnehmer nicht mehr noetig */
  chatTeilnehmer?: unknown[]
  aktiverTermin?: AktiverTermin | null
}) {
  return (
    <div className="space-y-8">
      {/* Übersicht */}
      <div className="space-y-5">
          {/* FallIdentityHeader entfernt — die PageHeader weiter oben (page.tsx)
              zeigt bereits CLM-Nr + Kennzeichen + Fahrzeug. KB + Gutachter leben
              in den Sidebar-Cards. */}

          {/* AAR-754: Shared StammdatenReadSection — ersetzt die inline
              Fahrzeug-Section. Kunde-Rolle filtert eigenen Kontakt + Halter
              automatisch raus. Unfallhergang bleibt separat darunter. */}
          <StammdatenReadSection
            rolle="kunde"
            lead={null}
            fall={fall}
            title="Fahrzeug & Unfall"
          />

          {/* AAR-759: Mietwagen-Status für Kunde (Phase 1 read-only) */}
          <MietwagenStatusCard
            rolle="kunde"
            fall={{
              mietwagen_hat: (fall.mietwagen_hat as boolean | null) ?? null,
              mietwagen_seit_datum: (fall.mietwagen_seit_datum as string | null) ?? null,
              mietwagen_limit_tage: (fall.mietwagen_limit_tage as number | null) ?? null,
              mietwagen_limit_grund: (fall.mietwagen_limit_grund as string | null) ?? null,
              mietwagen_rechnung_vorhanden: (fall.mietwagen_rechnung_vorhanden as boolean | null) ?? null,
              mietwagen_argumentations_puffer: (fall.mietwagen_argumentations_puffer as number | null) ?? null,
              mietwagen_vermieter: (fall.mietwagen_vermieter as string | null) ?? null,
              nutzungsausfall_tage: (fall.nutzungsausfall_tage as number | null) ?? null,
            }}
          />

          {!!fall.schadens_beschreibung && (
            <Section title="Unfallhergang">
              <p className="text-sm text-claimondo-navy whitespace-pre-wrap">
                {fall.schadens_beschreibung as string}
              </p>
            </Section>
          )}

          {/* KFZ-134: SV-Gegenvorschlag Banner (altes Format: 1 Datum) */}
          {aktiverTermin && aktiverTermin.status === 'gegenvorschlag' && aktiverTermin.gegenvorschlag_von === 'sv' && aktiverTermin.vorgeschlagenes_datum && !aktiverTermin.sv_vorgeschlagene_slots?.length && (
            <GegenvorschlagBanner
              fallId={fall.id as string}
              svName={svName ?? 'Sachverständiger'}
              vorgeschlagenesDatum={aktiverTermin.vorgeschlagenes_datum}
              grund={aktiverTermin.gegenvorschlag_grund}
            />
          )}

          {/* KFZ-192: SV hat mehrere alternative Slots vorgeschlagen */}
          {aktiverTermin && aktiverTermin.status === 'gegenvorschlag' && aktiverTermin.sv_vorgeschlagene_slots && aktiverTermin.sv_vorgeschlagene_slots.length > 0 && (
            <SlotAuswahlBanner
              fallId={fall.id as string}
              terminId={aktiverTermin.id}
              svName={svName ?? 'Sachverständiger'}
              slots={aktiverTermin.sv_vorgeschlagene_slots}
            />
          )}
      </div>
      {/* Dokumente leben jetzt im ClaimSummary-Tab — diese Section ist
          obsolet, BelegUploadCard + DokumenteDownloadListe wurden in
          components/kunde/ClaimSummary.tsx integriert. */}
    </div>
  )
}

// ─── Section + InfoRow ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-5">
      <h3 className="text-sm font-semibold text-claimondo-navy mb-3">{title}</h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-claimondo-border last:border-0">
      <span className="text-sm text-claimondo-ondo">{label}</span>
      <span className="text-sm text-claimondo-navy font-medium text-right">{value}</span>
    </div>
  )
}

// ─── KFZ-134: Gegenvorschlag-Banner (Kunde sieht SV-Vorschlag) ────────────

function GegenvorschlagBanner({ fallId, svName, vorgeschlagenesDatum, grund }: {
  fallId: string; svName: string; vorgeschlagenesDatum: string; grund: string | null
}) {
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [neuerTermin, setNeuerTermin] = useState('')
  const [kundeGrund, setKundeGrund] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const datumStr = new Date(vorgeschlagenesDatum).toLocaleString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  async function handleAnnehmen() {
    setLoading(true)
    const result = await terminAnnehmen({ source: 'kunde', fallId })
    setLoading(false)
    if (result.success) {
      setDone('Termin bestätigt! Der Sachverständige wird informiert.')
    }
  }

  async function handleGegenvorschlag() {
    if (!neuerTermin) return
    setLoading(true)
    const result = await terminGegenvorschlag({ neuesDatum: neuerTermin, grund: kundeGrund, source: 'kunde', fallId })
    setLoading(false)
    if (result.success) {
      setShowModal(false)
      setDone('Ihr Gegenvorschlag wurde übermittelt. Der Sachverständige wird informiert.')
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm text-green-700 font-medium">{done}</p>
      </div>
    )
  }

  return (
    <>
      <div className="bg-claimondo-ondo/5 border border-claimondo-light-blue/30 rounded-xl p-5">
        <p className="text-sm font-semibold text-claimondo-navy mb-2">Neuer Terminvorschlag vom Sachverständigen</p>
        <p className="text-sm text-claimondo-shield mb-1">
          {svName} hat einen alternativen Termin vorgeschlagen: <strong>{datumStr}</strong>
        </p>
        {grund && <p className="text-xs text-claimondo-ondo mb-3">Grund: {grund}</p>}
        {!grund && <div className="mb-3" />}

        <div className="space-y-2">
          <button onClick={handleAnnehmen} disabled={loading}
            className="w-full py-3 rounded-xl bg-claimondo-ondo text-white font-medium text-sm hover:bg-claimondo-shield transition-colors disabled:opacity-40">
            {loading ? 'Wird verarbeitet...' : 'Vorschlag annehmen'}
          </button>
          <button onClick={() => setShowModal(true)} disabled={loading}
            className="w-full py-3 rounded-xl bg-white text-claimondo-shield font-medium text-sm border border-claimondo-shield hover:bg-[#f8f9fb] transition-colors disabled:opacity-40">
            Anderen Termin vorschlagen
          </button>
          <Link href={`/kunde/faelle/${fallId}/kalender`}
            className="w-full py-3 rounded-xl bg-white text-claimondo-shield font-medium text-sm border border-claimondo-light-blue/30 hover:bg-[#f8f9fb] transition-colors flex items-center justify-center gap-2">
            <CalendarIcon className="w-4 h-4" /> Kalender des Gutachters öffnen
          </Link>
        </div>
      </div>

      {/* Modal: Anderen Termin vorschlagen */}
      <Modal open={showModal} onClose={() => setShowModal(false)} maxWidth={384} ariaLabel="Anderen Termin vorschlagen">
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">Anderen Termin vorschlagen</h3>
        <p className="text-sm text-claimondo-ondo mb-4">Wählen Sie einen für Sie passenden Termin:</p>

        {/* AAR-452: text-base (16px) + min-h-[44px] für iOS-Kompatibilität */}
        <input type="datetime-local" value={neuerTermin} onChange={e => setNeuerTermin(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full border border-claimondo-border rounded-lg px-3 min-h-[44px] text-base text-claimondo-navy mb-3 focus:outline-none focus:border-claimondo-ondo" />
        <textarea value={kundeGrund} onChange={e => setKundeGrund(e.target.value)}
          placeholder="Begründung (optional)"
          className="w-full border border-claimondo-border rounded-lg px-3 py-2.5 text-base text-claimondo-navy mb-4 focus:outline-none focus:border-claimondo-ondo resize-none" rows={2} />

        <div className="flex gap-2">
          <button onClick={() => setShowModal(false)}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-medium text-claimondo-ondo bg-[#f8f9fb] hover:bg-claimondo-border transition-colors">
            Abbrechen
          </button>
          <button onClick={handleGegenvorschlag} disabled={loading || !neuerTermin}
            className="flex-1 min-h-[44px] rounded-lg text-sm font-medium text-white bg-claimondo-ondo hover:bg-claimondo-shield transition-colors disabled:opacity-50">
            {loading ? 'Wird gesendet...' : 'Vorschlag senden'}
          </button>
        </div>
      </Modal>
    </>
  )
}

// ─── KFZ-192: Slot-Auswahl Banner (Kunde wählt aus SV-Gegenvorschlägen) ─────

function SlotAuswahlBanner({
  fallId,
  terminId,
  svName,
  slots,
}: {
  fallId: string
  terminId: string
  svName: string
  slots: Array<{ datum: string; uhrzeit: string }>
}) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleWahl(slot: { datum: string; uhrzeit: string }) {
    setLoading(true)
    setError(null)
    const result = await waehleGegenvorschlagSlot(fallId, terminId, slot)
    setLoading(false)
    if (result.success) {
      const datumStr = (() => {
        try {
          return new Date(`${slot.datum}T${slot.uhrzeit}`).toLocaleString('de-DE', {
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        } catch {
          return `${slot.datum} ${slot.uhrzeit}`
        }
      })()
      setDone(`Termin am ${datumStr} wurde bestätigt! Der Sachverständige wird informiert.`)
    } else {
      setError(result.error ?? 'Fehler beim Bestätigen')
    }
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
        <p className="text-sm text-green-700 font-medium">{done}</p>
      </div>
    )
  }

  return (
    <div className="bg-claimondo-ondo/5 border border-claimondo-light-blue/30 rounded-xl p-5">
      <p className="text-sm font-semibold text-claimondo-navy mb-1">
        {svName} hat alternative Termine vorgeschlagen
      </p>
      <p className="text-xs text-claimondo-ondo mb-4">
        Bitte wählen Sie einen der folgenden Termine:
      </p>
      <div className="space-y-2">
        {slots.map((slot, idx) => {
          const datumStr = (() => {
            try {
              return new Date(`${slot.datum}T${slot.uhrzeit}`).toLocaleString('de-DE', {
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
              })
            } catch {
              return `${slot.datum} ${slot.uhrzeit}`
            }
          })()
          return (
            <button
              key={idx}
              onClick={() => handleWahl(slot)}
              disabled={loading}
              className="w-full text-left px-4 py-3 rounded-xl border border-claimondo-light-blue/40 bg-white hover:bg-claimondo-ondo/5 hover:border-claimondo-ondo transition-colors disabled:opacity-40"
            >
              <span className="text-sm font-medium text-claimondo-navy">{datumStr}</span>
              <span className="block text-xs text-claimondo-ondo mt-0.5">Diesen Termin wählen →</span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
    </div>
  )
}
