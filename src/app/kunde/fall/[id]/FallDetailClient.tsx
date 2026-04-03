'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { uploadDokument, sendNachricht } from './actions'

// ─── Types ──────────────────────────────────────────────────────────────────

type Nachricht = {
  id: string
  kanal: string
  sender_id: string
  sender_rolle: string
  nachricht: string
  hat_anhang: boolean | null
  anhang_url: string | null
  created_at: string
}

type Fall = {
  id: string
  fall_nummer: string | null
  status: string
  schadens_ursache: string | null
  schadens_beschreibung: string | null
  schadens_datum: string | null
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
  sv_zugewiesen_am: string | null
  sv_termin: string | null
  gutachten_eingegangen_am: string | null
  gutachten_betrag: number | null
  kanzlei_uebergeben_am: string | null
  regulierung_betrag: number | null
  regulierung_am: string | null
  created_at: string
  // OCR-extrahierte Felder
  schadenhoehe_netto: number | null
  wiederbeschaffungswert: number | null
  restwert: number | null
  nutzungsausfall_tage: number | null
  nutzungsausfall_tagessatz: number | null
  reparaturdauer_tage: number | null
  totalschaden: boolean | null
  gutachter_honorar: number | null
  schadenfall_typ: string | null
  kunden_konstellation: string | null
  ki_geschaetzte_kosten_min: number | null
  ki_geschaetzte_kosten_max: number | null
  besichtigungsort_adresse: string | null
  unfallort: string | null
}

type Dokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string | null
  created_at: string
  kategorie: string | null
  quelle: string | null
  sichtbar_fuer: string[] | null
  hochgeladen_von_rolle: string | null
}

type SV = {
  id: string
  paket: string
  profile: { vorname: string | null; nachname: string | null; telefon: string | null } | null
} | null

// ─── Constants ──────────────────────────────────────────────────────────────

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

const KATEGORIE_LABEL: Record<string, string> = {
  kundendokument: 'Ihre Dokumente',
  schadensfoto: 'Schadensfotos',
  gutachten: 'Gutachten',
  kanzlei: 'Kanzlei-Dokumente',
  unterschrift: 'Unterschriften',
  sonstiges: 'Sonstige Dokumente',
  'whatsapp-foto': 'WhatsApp-Fotos',
  'gutachter-foto': 'Gutachter-Fotos',
}

const KATEGORIE_ORDER = [
  'schadensfoto',
  'whatsapp-foto',
  'gutachter-foto',
  'gutachten',
  'kanzlei',
  'kundendokument',
  'unterschrift',
  'sonstiges',
]

const QUELLE_LABEL: Record<string, string> = {
  flowlink: 'Flow-Link',
  portal: 'Portal',
  whatsapp: 'WhatsApp',
  gutachter: 'Gutachter',
  admin: 'Admin',
  kanzlei: 'Kanzlei',
}

// Timeline steps derived from the case data
type TimelineStep = {
  label: string
  description: string
  date: string | null
  reached: boolean
  active: boolean
}

const STATUS_ORDER = [
  'ersterfassung',
  'sv-zugewiesen',
  'sv-termin',
  'gutachten-eingegangen',
  'filmcheck',
  'kanzlei-uebergeben',
  'anschlussschreiben',
  'regulierung',
  'abgeschlossen',
]

function getStatusIndex(status: string): number {
  const idx = STATUS_ORDER.indexOf(status)
  return idx >= 0 ? idx : 0
}

function buildTimeline(fall: Fall): TimelineStep[] {
  const currentIdx = getStatusIndex(fall.status)

  return [
    {
      label: 'Schadensfall erfasst',
      description: 'Ihr Schadensfall wurde aufgenommen und wird bearbeitet.',
      date: fall.created_at,
      reached: currentIdx >= 0,
      active: currentIdx === 0,
    },
    {
      label: 'Gutachter zugewiesen',
      description: 'Ein Sachverständiger wurde mit der Begutachtung beauftragt.',
      date: fall.sv_zugewiesen_am,
      reached: currentIdx >= 1,
      active: currentIdx >= 1 && currentIdx <= 2,
    },
    {
      label: 'Gutachten erstellt',
      description: 'Das Gutachten wurde erstellt und wird geprüft.',
      date: fall.gutachten_eingegangen_am,
      reached: currentIdx >= 3,
      active: currentIdx >= 3 && currentIdx <= 4,
    },
    {
      label: 'An Kanzlei übergeben',
      description: 'Ihr Fall wurde an die Partnerkanzlei zur rechtlichen Durchsetzung übergeben.',
      date: fall.kanzlei_uebergeben_am,
      reached: currentIdx >= 5,
      active: currentIdx >= 5 && currentIdx <= 6,
    },
    {
      label: 'Regulierung',
      description: fall.regulierung_betrag
        ? `Die Versicherung hat ${fmtCurrency(fall.regulierung_betrag)} reguliert.`
        : 'Die Schadensregulierung durch die Versicherung läuft.',
      date: fall.regulierung_am,
      reached: currentIdx >= 7,
      active: currentIdx === 7,
    },
    {
      label: 'Abgeschlossen',
      description: 'Ihr Schadensfall wurde erfolgreich abgeschlossen.',
      date: fall.status === 'abgeschlossen' ? fall.regulierung_am : null,
      reached: currentIdx >= 8,
      active: currentIdx === 8,
    },
  ]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

function fmtCurrency(val: number | null) {
  if (val == null) return '—'
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

// ─── Main ───────────────────────────────────────────────────────────────────

type Kundenbetreuer = {
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
} | null

export default function FallDetailClient({
  fall,
  dokumente,
  sv,
  nachrichten,
  kundenbetreuer,
}: {
  fall: Fall & {
    kanzlei_ansprechpartner_name?: string | null
    kanzlei_ansprechpartner_email?: string | null
    kanzlei_ansprechpartner_telefon?: string | null
    kanzlei_ansprechpartner_position?: string | null
  }
  dokumente: Dokument[]
  sv: SV
  nachrichten: Nachricht[]
  kundenbetreuer?: Kundenbetreuer
}) {
  const router = useRouter()
  const timeline = buildTimeline(fall)
  const isStorniert = fall.status === 'storniert'

  // Group documents by kategorie
  const grouped = dokumente.reduce<Record<string, Dokument[]>>((acc, doc) => {
    const key = doc.kategorie ?? 'sonstiges'
    if (!acc[key]) acc[key] = []
    acc[key].push(doc)
    return acc
  }, {})

  return (
    <div className="w-full px-4 pb-8 max-w-xl mx-auto">
        <div className="space-y-5">

          {/* Storniert banner */}
          {isStorniert && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-600 font-medium text-sm">Dieser Fall wurde storniert.</p>
            </div>
          )}

          {/* BUG-62: Status-Verlauf ENTFERNT — der obere Stepper in page.tsx ist die einzige Fortschrittsanzeige */}

          {/* ── Dateien ── */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h3 className="text-[#0D1B3E] text-sm font-semibold mb-3">
              Dateien
            </h3>

            {dokumente.length === 0 ? (
              <p className="text-gray-400 text-sm mb-4">Noch keine Dateien vorhanden.</p>
            ) : (
              <div className="space-y-5 mb-4">
                {KATEGORIE_ORDER.filter(k => grouped[k]?.length).map(kat => {
                  const docs = grouped[kat]
                  const isPhoto = kat === 'schadensfoto' || kat === 'whatsapp-foto' || kat === 'gutachter-foto'

                  return (
                    <div key={kat}>
                      <p className="text-gray-500 text-xs font-medium mb-2">
                        {KATEGORIE_LABEL[kat] ?? kat} ({docs.length})
                      </p>

                      {isPhoto ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                          {docs.map(doc => (
                            <a
                              key={doc.id}
                              href={doc.datei_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block aspect-square rounded-xl overflow-hidden bg-gray-100 hover:opacity-80 transition-opacity"
                            >
                              <img
                                src={doc.datei_url}
                                alt={doc.datei_name ?? 'Foto'}
                                className="w-full h-full object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {docs.map(doc => (
                            <a
                              key={doc.id}
                              href={doc.datei_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-gray-100 transition-colors group"
                            >
                              <DocIcon />
                              <div className="min-w-0 flex-1">
                                <span className="text-gray-800 text-sm block truncate">
                                  {doc.datei_name ?? doc.datei_url.split('/').pop()}
                                </span>
                                <span className="text-gray-400 text-xs flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] font-medium">
                                    {KATEGORIE_LABEL[doc.kategorie ?? ''] ?? doc.kategorie ?? doc.typ}
                                  </span>
                                  {doc.quelle && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100/60 text-gray-500 text-[10px]">
                                      {QUELLE_LABEL[doc.quelle] ?? doc.quelle}
                                    </span>
                                  )}
                                  <span>{fmt(doc.created_at)}</span>
                                </span>
                              </div>
                              {/* Download indicator */}
                              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-gray-400 group-hover:text-gray-500 shrink-0 transition-colors">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                              </svg>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Upload Nachreichung */}
            <DokumentUpload fallId={fall.id} onDone={() => router.refresh()} />
          </div>

          {/* ── Nachrichten ── */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h3 className="text-[#0D1B3E] text-sm font-semibold mb-3">
              Nachrichten
            </h3>
            <NachrichtenBereich fallId={fall.id} nachrichten={nachrichten} onSend={() => router.refresh()} />
          </div>

          {/* ── Auszahlung / Schadensdetails ── */}
          {fall.schadenhoehe_netto != null && (
            <AuszahlungsUebersicht fall={fall} />
          )}

          {/* ── Ansprechpartner (2 Karten nebeneinander) ── */}
          <div>
            <h3 className="text-[#0D1B3E] text-sm font-semibold mb-3">
              Ihre Ansprechpartner
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* KARTE 1: Kundenbetreuer bei Claimondo */}
              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">
                  Ihr Kundenbetreuer bei Claimondo
                </p>
                {kundenbetreuer ? (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: '#4573A2' }}>
                        <span className="text-gray-900 text-sm font-bold">
                          {(kundenbetreuer.vorname?.[0] ?? '').toUpperCase()}{(kundenbetreuer.nachname?.[0] ?? '').toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-gray-900 text-sm font-medium">
                          {`${kundenbetreuer.vorname ?? ''} ${kundenbetreuer.nachname ?? ''}`.trim() || '—'}
                        </p>
                        <p className="text-gray-500 text-xs">Kundenbetreuer</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {kundenbetreuer.telefon && (
                        <a href={`tel:${kundenbetreuer.telefon}`} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl text-sm text-[#7BA3CC] hover:bg-gray-200 transition-colors">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                          Anrufen
                        </a>
                      )}
                      {kundenbetreuer.email && (
                        <a href={`mailto:${kundenbetreuer.email}`} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl text-sm text-[#7BA3CC] hover:bg-gray-200 transition-colors">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                          E-Mail schreiben
                        </a>
                      )}
                      <a href={`/kunde/fall/${fall.id}#nachrichten`} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl text-sm text-[#4573A2] hover:bg-gray-200 transition-colors">
                        <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>
                        Chat öffnen
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-gray-400 text-sm">Wird Ihnen in Kürze zugewiesen.</p>
                )}
              </div>

              {/* KARTE 2: Kanzlei LexDrive */}
              <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-3">
                  Ihre Kanzlei LexDrive
                </p>
                {fall.kanzlei_ansprechpartner_name ? (
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-cyan-400"><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg>
                      </div>
                      <div>
                        <p className="text-gray-900 text-sm font-medium">{fall.kanzlei_ansprechpartner_name}</p>
                        <p className="text-gray-500 text-xs">{fall.kanzlei_ansprechpartner_position ?? 'Rechtsanwalt'}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {fall.kanzlei_ansprechpartner_telefon && (
                        <a href={`tel:${fall.kanzlei_ansprechpartner_telefon}`} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl text-sm text-[#7BA3CC] hover:bg-gray-200 transition-colors">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" /></svg>
                          Anrufen
                        </a>
                      )}
                      {fall.kanzlei_ansprechpartner_email && (
                        <a href={`mailto:${fall.kanzlei_ansprechpartner_email}`} className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-xl text-sm text-[#7BA3CC] hover:bg-gray-200 transition-colors">
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" /></svg>
                          E-Mail schreiben
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-400 text-sm">Wird nach Kanzlei-Übergabe zugewiesen.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Fall-Info ── */}
          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
            <h3 className="text-[#0D1B3E] text-sm font-semibold mb-3">
              Fall-Details
            </h3>
            <InfoRow label="Fallnummer" value={fall.fall_nummer ?? fall.id.slice(0, 8)} />
            <InfoRow label="Schadensart" value={URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? '—'} />
            <InfoRow label="Schadensdatum" value={fmt(fall.schadens_datum) ?? '—'} />
            <InfoRow
              label="Adresse"
              value={[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'}
            />
            {fall.schadens_beschreibung && (
              <div className="mt-3 pt-3 border-t border-gray-200/50">
                <p className="text-gray-500 text-xs mb-1">Beschreibung</p>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">{fall.schadens_beschreibung}</p>
              </div>
            )}
          </div>
        </div>
    </div>
  )
}

// ─── Shared UI ──────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-200/50 last:border-0">
      <span className="text-gray-500 text-sm w-32 shrink-0">{label}</span>
      <span className="text-gray-800 text-sm">{value || '—'}</span>
    </div>
  )
}

function DocIcon() {
  return (
    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-gray-500 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  )
}

// ─── Dokument Upload ────────────────────────────────────────────────────────

function DokumentUpload({ fallId, onDone }: { fallId: string; onDone: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData(e.currentTarget)
      await uploadDokument(fallId, formData)
      if (fileRef.current) fileRef.current.value = ''
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-gray-500 text-xs mb-2">Dokument nachreichen</p>
      <form onSubmit={handleUpload} className="flex items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          name="file"
          required
          accept="image/*,.pdf,.doc,.docx"
          className="flex-1 text-xs text-gray-500 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 file:cursor-pointer hover:file:bg-zinc-700"
        />
        <button
          type="submit"
          disabled={uploading}
          className="px-4 py-2 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-40"
        >
          {uploading ? 'Lädt...' : 'Hochladen'}
        </button>
      </form>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}

// ─── Auszahlungs-Übersicht ──────────────────────────────────────────────────

function AuszahlungsUebersicht({ fall }: { fall: Fall }) {
  const nutzungsausfall = (fall.nutzungsausfall_tage ?? 0) * (fall.nutzungsausfall_tagessatz ?? 0)
  const anwaltskosten = (fall.schadenhoehe_netto ?? 0) * 0.13
  const total = (fall.schadenhoehe_netto ?? 0) + nutzungsausfall + (fall.gutachter_honorar ?? 0) + anwaltskosten

  const SF_LABELS: Record<string, string> = {
    'SF-01': 'Unverschuldeter Unfall — die gegnerische Versicherung zahlt.',
    'SF-02': 'Teilschuld — anteilige Regulierung durch beide Versicherungen.',
    'SF-03': 'Vandalismus/Diebstahl — Ihre Kaskoversicherung reguliert.',
    'SF-04': 'Eigenverschulden — Regulierung ueber Ihre Vollkasko.',
  }

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
      <h3 className="text-[#0D1B3E] text-sm font-semibold mb-4">Voraussichtliche Auszahlung</h3>
      <div className="text-center mb-5">
        <p className="text-3xl font-bold text-[#4573A2] tabular-nums">{fmtCurrency(fall.regulierung_betrag ?? total)}</p>
        <p className="text-gray-500 text-xs mt-1">{fall.regulierung_betrag ? 'Reguliert' : 'Geschaetzter Anspruch'}</p>
      </div>
      <div className="space-y-2 mb-4">
        <AuszahlungsRow label="Reparaturkosten (netto)" value={fall.schadenhoehe_netto} />
        {fall.totalschaden && fall.wiederbeschaffungswert != null && (
          <>
            <AuszahlungsRow label="Wiederbeschaffungswert" value={fall.wiederbeschaffungswert} />
            {fall.restwert != null && <AuszahlungsRow label="Abzgl. Restwert" value={-fall.restwert} />}
          </>
        )}
        {nutzungsausfall > 0 && <AuszahlungsRow label={`Nutzungsausfall (${fall.nutzungsausfall_tage} Tage)`} value={nutzungsausfall} />}
        {fall.gutachter_honorar != null && <AuszahlungsRow label="Gutachterkosten" value={fall.gutachter_honorar} />}
        <AuszahlungsRow label="Anwaltskosten (ca.)" value={anwaltskosten} />
        <div className="border-t border-gray-300 pt-2 flex justify-between">
          <span className="text-gray-900 text-sm font-semibold">Gesamt</span>
          <span className="text-gray-900 text-sm font-semibold tabular-nums">{fmtCurrency(total)}</span>
        </div>
      </div>
      {fall.totalschaden && (
        <div className="bg-amber-50/50 border border-amber-800/30 rounded-xl p-3 mb-3">
          <p className="text-amber-300 text-xs font-medium">Totalschaden festgestellt</p>
          <p className="text-amber-400/70 text-xs mt-0.5">Die Reparaturkosten uebersteigen den Wiederbeschaffungswert.</p>
        </div>
      )}
      {fall.ki_geschaetzte_kosten_min != null && fall.ki_geschaetzte_kosten_max != null && (
        <div className="bg-[#4573A2]/5 border border-[#4573A2]/20 rounded-xl p-3 mb-3">
          <p className="text-violet-300 text-xs font-medium">KI-Vorabschaetzung</p>
          <p className="text-violet-400 text-sm font-semibold mt-1 tabular-nums">
            {fmtCurrency(fall.ki_geschaetzte_kosten_min)} — {fmtCurrency(fall.ki_geschaetzte_kosten_max)}
          </p>
          {fall.schadenhoehe_netto != null && (
            <p className="text-gray-500 text-xs mt-1">
              Gutachten-Wert: {fmtCurrency(fall.schadenhoehe_netto)} (Abweichung:{' '}
              {(() => {
                const avg = (fall.ki_geschaetzte_kosten_min! + fall.ki_geschaetzte_kosten_max!) / 2
                const diff = Math.round(((fall.schadenhoehe_netto! - avg) / fall.schadenhoehe_netto!) * 100)
                return `${diff > 0 ? '+' : ''}${diff}%`
              })()})
            </p>
          )}
          <p className="text-gray-400 text-[10px] mt-1">Dies ist eine automatische Vorabschaetzung. Der verbindliche Wert stammt aus dem Gutachten.</p>
        </div>
      )}
      {fall.schadenfall_typ && SF_LABELS[fall.schadenfall_typ] && (
        <div className="bg-gray-100/50 rounded-xl p-3">
          <p className="text-gray-700 text-xs font-medium">Ihre Schadenskonstellation</p>
          <p className="text-gray-500 text-xs mt-0.5">{SF_LABELS[fall.schadenfall_typ]}</p>
        </div>
      )}
    </div>
  )
}

function AuszahlungsRow({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null
  const negative = value < 0
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={`tabular-nums ${negative ? 'text-red-400' : 'text-gray-800'}`}>{fmtCurrency(value)}</span>
    </div>
  )
}

// ─── Nachrichten ─────────────────────────────────────────────────────────────

const KANAL_TABS = [
  { key: 'portal-kunde-claimondo' as const, label: 'Mein Berater' },
  { key: 'portal-kunde-gutachter' as const, label: 'Mein Gutachter' },
]

const ROLLE_LABEL: Record<string, string> = {
  kunde: 'Sie',
  admin: 'Claimondo',
  gutachter: 'Gutachter',
  system: 'System',
}

function NachrichtenBereich({
  fallId,
  nachrichten,
  onSend,
}: {
  fallId: string
  nachrichten: Nachricht[]
  onSend: () => void
}) {
  const [activeKanal, setActiveKanal] = useState<'portal-kunde-claimondo' | 'portal-kunde-gutachter'>('portal-kunde-claimondo')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const filtered = nachrichten.filter(m => m.kanal === activeKanal)

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setError(null)
    setSending(true)
    try {
      await sendNachricht(fallId, text, activeKanal)
      setText('')
      onSend()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      {/* Channel tabs */}
      <div className="flex gap-1 mb-4">
        {KANAL_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveKanal(tab.key); setError(null) }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeKanal === tab.key
                ? 'bg-[#4573A2] text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Messages area */}
      {filtered.length === 0 ? (
        <p className="text-gray-400 text-sm mb-4">
          Noch keine Nachrichten. Stellen Sie hier Ihre Fragen.
        </p>
      ) : (
        <div className="space-y-3 mb-4 max-h-96 overflow-y-auto pr-1">
          {filtered.map(msg => {
            const isOwn = msg.sender_rolle === 'kunde'
            return (
              <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isOwn
                    ? 'bg-[#4573A2] text-white'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {/* Sender badge */}
                  <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                    isOwn ? 'text-white/60' : 'text-gray-500'
                  }`}>
                    {ROLLE_LABEL[msg.sender_rolle] ?? msg.sender_rolle}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{msg.nachricht}</p>
                  {/* Attachment indicator */}
                  {msg.hat_anhang && msg.anhang_url && (
                    <a
                      href={msg.anhang_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-1 mt-1 text-xs underline ${
                        isOwn ? 'text-white/60' : 'text-[#7BA3CC]'
                      }`}
                    >
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      Anhang
                    </a>
                  )}
                  {/* Timestamp */}
                  <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/60/70' : 'text-gray-500'}`}>
                    {new Date(msg.created_at).toLocaleString('de-DE', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Nachricht schreiben..."
          className="flex-1 bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#4573A2]"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-4 py-2.5 bg-[#4573A2] hover:bg-[#1E3A5F] text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-40"
        >
          {sending ? '...' : 'Senden'}
        </button>
      </form>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  )
}
