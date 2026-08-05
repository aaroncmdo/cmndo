'use client'

import { useState } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import { CalendarIcon } from 'lucide-react'
import { terminAnnehmen, terminGegenvorschlag } from '@/lib/actions/termin-actions'
import { waehleGegenvorschlagSlot } from './actions'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import Link from 'next/link'
// AAR-727 Kandidat 1: Shared Download-Liste — Kunde zeigt flat list.
import DokumenteDownloadListe, { type DokumentItem } from '@/components/shared/DokumenteDownloadListe'
// AAR-746 (Phase B): Shared Identity-Header — löst die "Aktueller Status"-
// Section ab. KB + Termin bleiben in einer separaten Detail-Section.
import { FallIdentityHeader } from '@/components/shared/fall-header'
// AAR-754 (Phase C): Shared Stammdaten + Kontakte.
import { StammdatenReadSection } from '@/components/shared/stammdaten'
// AAR Fallakte-Kanonisierung: kanonische Status/Notice-Box (statt inline bg-X-soft).
import { NoticeBox } from '@/components/shared/NoticeBox'
import { FallKontakteCard } from '@/components/shared/fall-kontakte'
import { Modal } from '@/components/primitives/Modal'
// AAR-759 (Phase 1): Mietwagen-Status-Anzeige
import { MietwagenStatusCard } from '@/components/shared/mietwagen'
// AAR-761 Phase 2: Kunde-Upload-Card fuer Belege
import { BelegUploadCard } from '@/components/kunde/beleg-upload'

type Dokument = { id: string; typ: string; datei_url: string; datei_name: string | null; created_at: string }
type AktiverTermin = { id: string; status: string; start_zeit: string; end_zeit: string; vorgeschlagenes_datum: string | null; gegenvorschlag_von: string | null; gegenvorschlag_grund: string | null; sv_id: string | null; sv_vorgeschlagene_slots?: Array<{ datum: string; uhrzeit: string }> | null }

const TABS = [
  { key: 'uebersicht' as const, label: 'Übersicht' },
  { key: 'dokumente' as const, label: 'Dokumente' },
]


function fmt(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(val: string | null): string {
  if (!val) return ''
  return new Date(val).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function FallDetailSections({
  fall, svName, svTelefon, svVerifiziert = false, kbName, dokumente, aktiverTermin,
}: {
  fall: Record<string, unknown>
  svName: string | null
  svTelefon: string | null
  svVerifiziert?: boolean
  kbName?: string | null
  dokumente: Dokument[]
  aktiverTermin?: AktiverTermin | null
}) {
  const t = useTranslations('kunde.fall')
  // Portal-i18n Leak 3: kundenfreundliches, lokalisiertes Status-Label statt
  // des rohen fall.status-Slugs (z.B. "ersterfassung"). .has()-Fallback auf den
  // Rohwert, damit ein unbekannter Status nicht crasht (next-intl wirft sonst).
  const tStatus = useTranslations('fallStatus')
  const statusSlug = (fall.status as string | null) ?? null
  const statusLabel = statusSlug
    ? tStatus.has(statusSlug)
      ? tStatus(statusSlug)
      : statusSlug
    : null
  const [activeTab, setActiveTab] = useState<'uebersicht' | 'dokumente'>('uebersicht')
  return (
    <div>
      {/* Tab-Leiste */}
      <div className="flex bg-white rounded-ios-xl border border-claimondo-border shadow-sm overflow-hidden mb-5">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-claimondo-ondo text-white'
                : 'text-claimondo-ondo hover:bg-claimondo-bg'
            }`}>
            {t(`tabs.${tab.key}`)}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      {activeTab === 'uebersicht' && (
        <div className="space-y-5">
          {/* AAR-746: Shared Identity-Header statt handgerollter Aktueller-
              Status-Section. KB + nächster Termin wandern in die Detail-
              Section darunter. */}
          <div className="-mx-4 sm:-mx-0 rounded-none sm:rounded-ios-xl overflow-hidden sm:border sm:border-claimondo-border">
            <FallIdentityHeader
              rolle="kunde"
              fallNummer={(fall.claim_nummer as string) ?? (fall.id as string)?.slice(0, 8)}
              subphaseLabel={statusLabel}
              className="!border-b-0"
            />
          </div>

          {/* AAR-754: Shared FallKontakteCard — ersetzt die handgerollten
              "Ihr Ansprechpartner" + "Ihr Gutachter" Sections. Kunde-Rolle
              nutzt Labels "Ihr Betreuer" / "Ihr Gutachter" automatisch. */}
          <FallKontakteCard
            rolle="kunde"
            kundenbetreuer={
              kbName
                ? { vorname: kbName, nachname: null, telefon: null, email: null }
                : null
            }
            sv={
              svName
                ? {
                    vorname: svName,
                    nachname: null,
                    telefon: svTelefon,
                    email: null,
                    verifiziert: svVerifiziert,
                  }
                : null
            }
          />

          {/* AAR-754: Shared StammdatenReadSection — ersetzt die inline
              Fahrzeug-Section. Kunde-Rolle filtert eigenen Kontakt + Halter
              automatisch raus. Unfallhergang bleibt separat darunter. */}
          <StammdatenReadSection
            rolle="kunde"
            lead={null}
            fall={fall}
            title={t('uebersicht.fahrzeugUnfall')}
          />

          {/* AAR-759: Mietwagen-Status für Kunde (Phase 1 read-only) */}
          <MietwagenStatusCard
            rolle="kunde"
            fall={{
              mietwagen_hat: (fall.hat_mietwagen as boolean | null) ?? null,
              mietwagen_seit_datum: (fall.mietwagen_seit_datum as string | null) ?? null,
              mietwagen_limit_tage: (fall.mietwagen_limit_tage as number | null) ?? null,
              mietwagen_limit_grund: (fall.mietwagen_limit_grund as string | null) ?? null,
              mietwagen_rechnung_vorhanden: (fall.mietwagen_rechnung_vorhanden as boolean | null) ?? null,
              mietwagen_argumentations_puffer: (fall.mietwagen_argumentations_puffer as number | null) ?? null,
              mietwagen_vermieter: (fall.mietwagen_vermieter as string | null) ?? null,
            }}
          />

          {!!fall.schadens_beschreibung && (
            <Section title={t('uebersicht.unfallhergang')}>
              <p className="text-sm text-claimondo-navy whitespace-pre-wrap">
                {fall.schadens_beschreibung as string}
              </p>
            </Section>
          )}

          {/* KFZ-134: SV-Gegenvorschlag Banner (altes Format: 1 Datum) */}
          {aktiverTermin && aktiverTermin.status === 'gegenvorschlag' && aktiverTermin.gegenvorschlag_von === 'sv' && aktiverTermin.vorgeschlagenes_datum && !aktiverTermin.sv_vorgeschlagene_slots?.length && (
            <GegenvorschlagBanner
              fallId={fall.id as string}
              svName={svName ?? t('uebersicht.sachverstaendiger')}
              vorgeschlagenesDatum={aktiverTermin.vorgeschlagenes_datum}
              grund={aktiverTermin.gegenvorschlag_grund}
            />
          )}

          {/* Gap E (05.08.): SV hat einen Termin reserviert (initialer Vorschlag) — Kunde
              bestaetigt oder schlaegt einen anderen vor. Ohne diesen Zweig fuehrte die
              "Besichtigungstermin bestaetigen"-Aufgabe (jetzt-zu-tun.ts) ins Leere: nur der
              gegenvorschlag-Zweig hatte eine Annehmen-UI. Derselbe Banner via variant='reserviert'. */}
          {aktiverTermin && aktiverTermin.status === 'reserviert' && aktiverTermin.start_zeit && (
            <GegenvorschlagBanner
              fallId={fall.id as string}
              svName={svName ?? t('uebersicht.sachverstaendiger')}
              vorgeschlagenesDatum={aktiverTermin.start_zeit}
              grund={null}
              variant="reserviert"
            />
          )}

          {/* KFZ-192: SV hat mehrere alternative Slots vorgeschlagen */}
          {aktiverTermin && aktiverTermin.status === 'gegenvorschlag' && aktiverTermin.sv_vorgeschlagene_slots && aktiverTermin.sv_vorgeschlagene_slots.length > 0 && (
            <SlotAuswahlBanner
              fallId={fall.id as string}
              terminId={aktiverTermin.id}
              svName={svName ?? t('uebersicht.sachverstaendiger')}
              slots={aktiverTermin.sv_vorgeschlagene_slots}
            />
          )}
        </div>
      )}

      {activeTab === 'dokumente' && (
        <div className="space-y-5">
          {/* AAR-761 Phase 2: Upload-Card mit Typ-Auswahl + OCR */}
          <BelegUploadCard fallId={fall.id as string} />

          <Section title={t('dokumente.hochgeladen')}>
            <DokumenteDownloadListe
              variant="list"
              rolle="kunde"
              enableVorschau
              emptyTitle={t('dokumente.leer')}
              dokumente={dokumente.map<DokumentItem>(doc => ({
                id: doc.id,
                name: doc.datei_name ?? t('dokumente.fallback'),
                url: doc.datei_url,
                typ: doc.typ,
                createdAt: doc.created_at,
              }))}
            />
          </Section>
        </div>
      )}

    </div>
  )
}

// ─── Section + InfoRow ──────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-5">
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

function GegenvorschlagBanner({ fallId, svName, vorgeschlagenesDatum, grund, variant = 'gegenvorschlag' }: {
  fallId: string; svName: string; vorgeschlagenesDatum: string; grund: string | null
  // Gap E: 'reserviert' = initialer SV-Vorschlag (start_zeit), 'gegenvorschlag' = alternativer
  // Vorschlag (vorgeschlagenes_datum). Nur Titel + Vorschlag-Text unterscheiden sich; Annehmen/
  // Gegenvorschlag/Kalender-Aktionen sind identisch → derselbe Banner, ein variant-Schalter.
  variant?: 'gegenvorschlag' | 'reserviert'
}) {
  const t = useTranslations('kunde.fall')
  const format = useFormatter()
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [neuerTermin, setNeuerTermin] = useState('')
  const [kundeGrund, setKundeGrund] = useState('')
  const [done, setDone] = useState<string | null>(null)

  const datumStr = format.dateTime(new Date(vorgeschlagenesDatum), { timeZone: 'Europe/Berlin',
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  async function handleAnnehmen() {
    setLoading(true)
    const result = await terminAnnehmen({ source: 'kunde', fallId })
    setLoading(false)
    if (result.success) {
      setDone(t('gegenvorschlag.angenommen'))
    }
  }

  async function handleGegenvorschlag() {
    if (!neuerTermin) return
    setLoading(true)
    const result = await terminGegenvorschlag({ neuesDatum: neuerTermin, grund: kundeGrund, source: 'kunde', fallId })
    setLoading(false)
    if (result.success) {
      setShowModal(false)
      setDone(t('gegenvorschlag.uebermittelt'))
    }
  }

  if (done) {
    return (
      <NoticeBox tone="success" className="rounded-ios-xl p-4">
        <p className="text-sm font-medium">{done}</p>
      </NoticeBox>
    )
  }

  return (
    <>
      <div className="bg-claimondo-ondo/5 border border-claimondo-light-blue/30 rounded-ios-xl p-5">
        <p className="text-sm font-semibold text-claimondo-navy mb-2">
          {variant === 'reserviert' ? t('terminVorschlag.titel') : t('gegenvorschlag.titel')}
        </p>
        <p className="text-sm text-claimondo-shield mb-1">
          {variant === 'reserviert'
            ? t('terminVorschlag.vorschlagText', { svName })
            : t('gegenvorschlag.vorschlagText', { svName })}{' '}
          <strong>{datumStr}</strong>
        </p>
        {grund && <p className="text-xs text-claimondo-ondo mb-3">{t('gegenvorschlag.grund', { grund })}</p>}
        {!grund && <div className="mb-3" />}

        <div className="space-y-2">
          <button onClick={handleAnnehmen} disabled={loading}
            className="w-full py-3 rounded-ios-xl bg-claimondo-ondo text-white font-medium text-sm hover:bg-claimondo-shield transition-colors disabled:opacity-40">
            {loading ? t('gegenvorschlag.wirdVerarbeitet') : t('gegenvorschlag.annehmen')}
          </button>
          <button onClick={() => setShowModal(true)} disabled={loading}
            className="w-full py-3 rounded-ios-xl bg-white text-claimondo-shield font-medium text-sm border border-claimondo-shield hover:bg-claimondo-bg transition-colors disabled:opacity-40">
            {t('gegenvorschlag.anderenVorschlagen')}
          </button>
          <Link href={`/kunde/faelle/${fallId}/kalender`}
            className="w-full py-3 rounded-ios-xl bg-white text-claimondo-shield font-medium text-sm border border-claimondo-light-blue/30 hover:bg-claimondo-bg transition-colors flex items-center justify-center gap-2">
            <CalendarIcon className="w-4 h-4" /> {t('gegenvorschlag.kalenderOeffnen')}
          </Link>
        </div>
      </div>

      {/* Modal: Anderen Termin vorschlagen */}
      <Modal open={showModal} onClose={() => setShowModal(false)} maxWidth={384} ariaLabel={t('gegenvorschlag.anderenVorschlagen')}>
        <h3 className="text-lg font-semibold text-claimondo-navy mb-2">{t('gegenvorschlag.anderenVorschlagen')}</h3>
        <p className="text-sm text-claimondo-ondo mb-4">{t('gegenvorschlag.modalIntro')}</p>

        {/* AAR-452: text-base (16px) + min-h-[44px] für iOS-Kompatibilität */}
        <input type="datetime-local" value={neuerTermin} onChange={e => setNeuerTermin(e.target.value)}
          min={new Date().toISOString().slice(0, 16)}
          className="w-full border border-claimondo-border rounded-ios-lg px-3 min-h-[44px] text-base text-claimondo-navy mb-3 focus:outline-none focus:border-claimondo-ondo" />
        <textarea value={kundeGrund} onChange={e => setKundeGrund(e.target.value)}
          placeholder={t('gegenvorschlag.begruendungPlatzhalter')}
          className="w-full border border-claimondo-border rounded-ios-lg px-3 py-2.5 text-base text-claimondo-navy mb-4 focus:outline-none focus:border-claimondo-ondo resize-none" rows={2} />

        <div className="flex gap-2">
          <button onClick={() => setShowModal(false)}
            className="flex-1 min-h-[44px] rounded-ios-lg text-sm font-medium text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors">
            {t('gegenvorschlag.abbrechen')}
          </button>
          <button onClick={handleGegenvorschlag} disabled={loading || !neuerTermin}
            className="flex-1 min-h-[44px] rounded-ios-lg text-sm font-medium text-white bg-claimondo-ondo hover:bg-claimondo-shield transition-colors disabled:opacity-50">
            {loading ? t('gegenvorschlag.wirdGesendet') : t('gegenvorschlag.vorschlagSenden')}
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
  const t = useTranslations('kunde.fall')
  const format = useFormatter()
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
          return format.dateTime(new Date(berlinWallClockToUtc(`${slot.datum}T${slot.uhrzeit}`)), { timeZone: 'Europe/Berlin',
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
          })
        } catch {
          return `${slot.datum} ${slot.uhrzeit}`
        }
      })()
      setDone(t('slotAuswahl.bestaetigt', { datumStr }))
    } else {
      setError(result.error ?? t('slotAuswahl.fehlerBestaetigen'))
    }
  }

  if (done) {
    return (
      <NoticeBox tone="success" className="rounded-ios-xl p-4">
        <p className="text-sm font-medium">{done}</p>
      </NoticeBox>
    )
  }

  return (
    <div className="bg-claimondo-ondo/5 border border-claimondo-light-blue/30 rounded-ios-xl p-5">
      <p className="text-sm font-semibold text-claimondo-navy mb-1">
        {t('slotAuswahl.titel', { svName })}
      </p>
      <p className="text-xs text-claimondo-ondo mb-4">
        {t('slotAuswahl.intro')}
      </p>
      <div className="space-y-2">
        {slots.map((slot, idx) => {
          const datumStr = (() => {
            try {
              return format.dateTime(new Date(berlinWallClockToUtc(`${slot.datum}T${slot.uhrzeit}`)), { timeZone: 'Europe/Berlin',
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
              className="w-full text-left px-4 py-3 rounded-ios-xl border border-claimondo-light-blue/40 bg-white hover:bg-claimondo-ondo/5 hover:border-claimondo-ondo transition-colors disabled:opacity-40"
            >
              <span className="text-sm font-medium text-claimondo-navy">{datumStr}</span>
              <span className="block text-xs text-claimondo-ondo mt-0.5">{t('slotAuswahl.waehlen')}</span>
            </button>
          )
        })}
      </div>
      {error && <p className="text-danger text-xs mt-3">{error}</p>}
    </div>
  )
}
