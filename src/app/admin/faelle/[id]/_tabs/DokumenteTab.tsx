'use client'

import { useState, useRef, useTransition } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  uploadAnschlussschreiben,
  uploadPflichtdokument,
  upsertQcCheckliste,
  qcBestanden,
  qcNachbesserung,
} from '../_actions'
import { markDokumentNachgereicht } from '../_actions/dokumente'
import { useRouter } from 'next/navigation'
import {
  FileTextIcon, UploadIcon, CheckCircle2Icon, ClockIcon,
  DownloadIcon, EyeIcon, SearchIcon, Loader2Icon, FileCheckIcon,
  BellIcon, ClipboardCheckIcon, ServerIcon,
} from 'lucide-react'
// AAR-327: Wiederverwendbare Dokument-Anforderungs-UI (Modal + Liste)
import AnforderungenListe, {
  type AnforderungsItem,
} from '@/components/dokumente/AnforderungenListe'
import type { AnforderbarerSlot } from '@/components/dokumente/AnforderungsModal'
// AAR-326: KB-Zuordnungs-UI + QC-Modal + Drag&Drop
import DokumenteUnzugeordnetBox from '@/components/dokumente/DokumenteUnzugeordnetBox'
import DokumenteListeSortierbar, {
  type SortierbarPflicht,
} from '@/components/dokumente/DokumenteListeSortierbar'
import DokumenteQcModal, { type QcDoc } from '@/components/dokumente/DokumenteQcModal'
import type {
  UnzugeordnetDoc,
  ZuordnungsSlot,
} from '@/components/dokumente/DokumenteZuordnungsModal'

type Pflichtdok = {
  id: string
  dokument_typ: string
  status: string
  pflicht: boolean
  dokument_url: string | null
  hochgeladen_am: string | null
}

type Dokument = {
  id: string
  typ: string
  datei_url: string
  datei_name: string
  datei_groesse: number | null
  kategorie: string
  quelle: string | null
  hochgeladen_von_rolle: string | null
  created_at: string
}

// AAR-356: System-generierte / externe Dokumente die das Admin-Team immer
// sehen soll, unabhängig vom Pflichtdokumente-Katalog. SA + Vollmacht kommen
// aus dem FlowLink-Signatur-Flow, CarDentity-Vorschaden aus der Typ-B-Abfrage,
// Gutachten + Kanzlei-Paket aus der `dokumente`-Tabelle (kategorie-basiert).
type SystemDokumenteProps = {
  sa_pdf_url: string | null
  sa_unterschrift_url: string | null
  vollmacht_pdf: string | null
  vorschaden_typ_b_pdf_url: string | null
  gutachten: { id: string; datei_url: string; datei_name: string; hochgeladen_am: string | null } | null
  kanzleiPaket: { id: string; datei_url: string; datei_name: string; hochgeladen_am: string | null } | null
}

type FallAS = {
  anschlussschreiben_url: string | null
  anschlussschreiben_sendedatum: string | null
  anschlussschreiben_unterschrift: boolean | null
  anschlussschreiben_ocr_am: string | null
}

// AAR-170: QC-Checkliste — die 9 Prüf-Felder entsprechen 1:1 den Spalten in
// Tabelle qc_checkliste (verifiziert via information_schema).
type QcCheckliste = {
  id?: string
  fall_id?: string
  gutachten_vorhanden?: boolean | null
  gutachten_vollstaendig?: boolean | null
  fin_17_zeichen?: boolean | null
  schadenspositionen_erfasst?: boolean | null
  fotos_ausreichend?: boolean | null
  sa_vorhanden?: boolean | null
  vollmacht_vorhanden?: boolean | null
  kundendaten_vollstaendig?: boolean | null
  vorschaeden_beruecksichtigt?: boolean | null
  kommentar?: string | null
  status?: string | null
  geprueft_von?: string | null
  geprueft_am?: string | null
}

const QC_FIELDS: { key: keyof QcCheckliste; label: string }[] = [
  { key: 'gutachten_vorhanden', label: 'Gutachten vorhanden' },
  { key: 'gutachten_vollstaendig', label: 'Gutachten vollständig' },
  { key: 'fin_17_zeichen', label: 'FIN hat 17 Zeichen' },
  { key: 'schadenspositionen_erfasst', label: 'Schadenspositionen erfasst' },
  { key: 'fotos_ausreichend', label: 'Fotos ausreichend' },
  { key: 'sa_vorhanden', label: 'Sachverständigen-Auftrag vorhanden' },
  { key: 'vollmacht_vorhanden', label: 'Vollmacht vorhanden' },
  { key: 'kundendaten_vollstaendig', label: 'Kundendaten vollständig' },
  { key: 'vorschaeden_beruecksichtigt', label: 'Vorschäden berücksichtigt' },
]

// DB-Keys bleiben ASCII (CHECK-Constraint auf pflichtdokumente.dokument_typ),
// UI-Labels nutzen echte Umlaute (Claimondo-Sprachregel).
const DOK_LABELS: Record<string, string> = {
  fahrzeugschein: 'Fahrzeugschein',
  schadensfotos: 'Schadensfotos (min. 4)', polizeibericht: 'Polizeibericht',
  gegner_daten: 'Gegner-Daten', eigene_versicherung: 'Eigene Versicherung',
  gewerbenachweis: 'Gewerbenachweis', 'gf_vollmacht': 'GF-Vollmacht',
  halter_vollmacht: 'Halter-Vollmacht', halter_ausweis: 'Halter-Ausweis',
  aerztliches_attest: 'Ärztliches Attest', krankenhausbericht: 'Krankenhausbericht',
  au_bescheinigung: 'AU-Bescheinigung', anschlussschreiben: 'Anschlussschreiben',
  // AAR-353: neue Katalog-Slots (Vorschaden-Trigger + Leasing/Finanzierung)
  reparaturrechnung_vorschaden: 'Reparaturrechnung (Vorschaden)',
  kaufvertrag: 'Kaufvertrag',
  freigabe_bank: 'Freigabe Bank',
}

const STATUS_CFG: Record<string, { bg: string; text: string; icon: typeof CheckCircle2Icon }> = {
  hochgeladen: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2Icon },
  geprueft: { bg: 'bg-[#4573A2]/5', text: 'text-[#4573A2]', icon: FileCheckIcon },
  ausstehend: { bg: 'bg-amber-50', text: 'text-amber-600', icon: ClockIcon },
  // AAR-168: „Nachreichen angefordert" — KB hat Reminder an Kunde getriggert
  nachgereicht_angefordert: { bg: 'bg-orange-50', text: 'text-orange-600', icon: BellIcon },
}

const KAT_COLORS: Record<string, string> = {
  kundendokument: 'bg-sky-50 text-sky-600',
  schadensfoto: 'bg-amber-50 text-amber-600',
  gutachten: 'bg-emerald-50 text-emerald-600',
  'gutachter-foto': 'bg-teal-50 text-teal-600',
  kanzlei: 'bg-purple-50 text-purple-600',
  unterschrift: 'bg-rose-50 text-rose-600',
  sonstiges: 'bg-gray-100 text-gray-600',
}

export default function DokumenteTab({
  fallId,
  pflichtdokumente,
  dokumente,
  fallAS,
  qcCheckliste,
  anforderbareSlots,
  anforderungenVonMir,
  rolleLabel,
  unzugeordneteUploads,
  zuPruefendeUploads,
  uploadbareSlots,
  sortierbareItems,
  systemDokumente,
}: {
  fallId: string
  pflichtdokumente: Pflichtdok[]
  dokumente: Dokument[]
  fallAS: FallAS
  qcCheckliste: QcCheckliste | null
  // AAR-327: Slot-Liste, die die aktuelle Rolle anfordern darf (aus Katalog)
  anforderbareSlots: AnforderbarerSlot[]
  // AAR-327: Bereits gestellte Anforderungen der aktuellen Rolle
  anforderungenVonMir: AnforderungsItem[]
  // AAR-327: Anzeige-Label der Rolle im Modal ("Claimondo", "Kanzlei", …)
  rolleLabel: string
  // AAR-326: fall_dokumente-Rows mit dokument_typ IN ('kunde-nachreichung','sonstiges')
  unzugeordneteUploads: UnzugeordnetDoc[]
  // AAR-326: Bereits einem Slot zugeordnete Uploads mit pflicht.status='hochgeladen'
  zuPruefendeUploads: QcDoc[]
  // AAR-326: Katalog-Slots die KB/Kunde hochladen dürfen (uploadbar_von)
  uploadbareSlots: ZuordnungsSlot[]
  // AAR-326: Pflichtdokumente im drag&drop-fähigen Shape
  sortierbareItems: SortierbarPflicht[]
  // AAR-356: System-Dokumente (SA, Vollmacht, Gutachten, Kanzlei-Paket,
  // CarDentity-Vorschaden) als eigene Sektion oberhalb der Pflichtdokumente
  systemDokumente: SystemDokumenteProps
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const asFileRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<{ id: string; typ: string } | null>(null)
  // AAR-168: Nachreichen-Button
  const [nachreichPending, startNachreichTransition] = useTransition()
  function handleNachreichen(pflichtdokId: string, label: string) {
    startNachreichTransition(async () => {
      const r = await markDokumentNachgereicht(pflichtdokId)
      if (r.success) {
        toast.success(`${label}: Kunde wird per WA erinnert`)
        router.refresh()
      } else toast.error(r.error ?? 'Nachreichen fehlgeschlagen')
    })
  }

  // AAR-170: QC-Checkliste — lokaler State für die 9 Checkboxen + Kommentar,
  // damit der KB mehrere Felder zugleich ändern kann bevor er speichert.
  const [qcState, setQcState] = useState<Record<string, boolean | null>>(() => {
    const init: Record<string, boolean | null> = {}
    for (const { key } of QC_FIELDS) {
      init[key as string] = (qcCheckliste?.[key] as boolean | null | undefined) ?? null
    }
    return init
  })
  const [qcKommentar, setQcKommentar] = useState<string>(qcCheckliste?.kommentar ?? '')
  const [qcPending, startQcTransition] = useTransition()
  const qcStatus = qcCheckliste?.status ?? null

  function toggleQc(key: string) {
    setQcState((prev) => ({ ...prev, [key]: prev[key] === true ? false : prev[key] === false ? null : true }))
  }

  function handleQcSpeichern() {
    startQcTransition(async () => {
      try {
        await upsertQcCheckliste(fallId, { ...qcState, kommentar: qcKommentar || null })
        toast.success('QC-Checkliste gespeichert')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
      }
    })
  }

  function handleQcBestanden() {
    startQcTransition(async () => {
      try {
        // Zuerst aktuelle Checks speichern, dann Bestanden-Flow (inkl. Filmcheck)
        await upsertQcCheckliste(fallId, qcState)
        await qcBestanden(fallId, qcKommentar)
        toast.success('QC bestanden — Kanzlei-Übergabe läuft')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'QC-Bestanden fehlgeschlagen')
      }
    })
  }

  function handleQcNachbesserung() {
    if (!qcKommentar.trim()) {
      toast.error('Kommentar erforderlich — Sachverständiger braucht Anmerkungen')
      return
    }
    startQcTransition(async () => {
      try {
        await upsertQcCheckliste(fallId, qcState)
        await qcNachbesserung(fallId, qcKommentar)
        toast.success('Nachbesserung angefordert — Task für SV erstellt')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nachbesserung fehlgeschlagen')
      }
    })
  }

  const pflichtCount = pflichtdokumente.length
  const hochgeladenCount = pflichtdokumente.filter(d => d.status !== 'ausstehend').length
  const pct = pflichtCount > 0 ? Math.round((hochgeladenCount / pflichtCount) * 100) : 0

  // AAR-326: QC-Modal-State (welches fall_dokument wird gerade geprüft)
  const [qcDoc, setQcDoc] = useState<QcDoc | null>(null)
  const [qcOpen, setQcOpen] = useState(false)
  // AAR-326: Drag&Drop-Sortierung ist optional (ausklappbar), damit der
  // bestehende Upload/Nachreichen-Flow oben unverändert sichtbar bleibt.
  const [sortierbarOpen, setSortierbarOpen] = useState(false)

  async function handleFileUpload(file: File, pflichtdokId: string) {
    setUploading(pflichtdokId)
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `faelle/${fallId}/${pflichtdokId}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('fall-dokumente').upload(path, file)
    if (upErr) { setUploading(null); return }
    const { data: urlData } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
    await uploadPflichtdokument(fallId, pflichtdokId, urlData.publicUrl)
    router.refresh()
    setUploading(null)
  }

  async function handleASUpload(file: File) {
    setUploading('as')
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `faelle/${fallId}/anschlussschreiben_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('fall-dokumente').upload(path, file)
    if (upErr) { setUploading(null); return }
    const { data: urlData } = supabase.storage.from('fall-dokumente').getPublicUrl(path)
    await uploadAnschlussschreiben(fallId, urlData.publicUrl, file.name)
    router.refresh()
    setUploading(null)
  }

  const filteredDoks = dokumente.filter(d => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return d.datei_name.toLowerCase().includes(q) || d.typ.toLowerCase().includes(q) || d.kategorie.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5">
      {/* Fortschritt */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 font-medium">Pflichtdokumente</span>
            <span className="text-xs text-gray-700 tabular-nums">{hochgeladenCount}/{pflichtCount} ({pct}%)</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-[#4573A2]'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {/* AAR-356: System-Dokumente — SA, Vollmacht, Gutachten, Kanzlei-Paket,
          CarDentity-Vorschadenbericht. Reine Übersicht mit Download/Vorschau,
          kein Upload-Flow — die Files werden von anderen Systemen (FlowLink,
          SV-Portal, Kanzlei-Paket-Generator, CarDentity-Worker) erzeugt. */}
      <SystemDokumenteBox systemDokumente={systemDokumente} />

      {/* Anschlussschreiben Upload + OCR */}
      <div className={`rounded-xl border p-4 ${fallAS.anschlussschreiben_url ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <FileTextIcon className="w-4 h-4" /> Anschlussschreiben
          </h3>
          {fallAS.anschlussschreiben_url ? (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Hochgeladen + OCR</span>
          ) : (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Ausstehend</span>
          )}
        </div>

        {fallAS.anschlussschreiben_url ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Sendedatum (OCR)</span>
                <p className="text-gray-800 font-medium">{fallAS.anschlussschreiben_sendedatum ? new Date(fallAS.anschlussschreiben_sendedatum).toLocaleDateString('de-DE') : 'Nicht erkannt'}</p>
              </div>
              <div>
                <span className="text-gray-500">Unterschrift</span>
                <p className={`font-medium ${fallAS.anschlussschreiben_unterschrift ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {fallAS.anschlussschreiben_unterschrift ? 'Erkannt' : 'Nicht erkannt'}
                </p>
              </div>
            </div>
            <a href={fallAS.anschlussschreiben_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#4573A2] hover:underline">
              <EyeIcon className="w-3 h-3" /> Dokument ansehen
            </a>
          </div>
        ) : (
          <div>
            <input ref={asFileRef} type="file" accept=".pdf,image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleASUpload(f) }} />
            <button onClick={() => asFileRef.current?.click()} disabled={uploading === 'as'}
              className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
              {uploading === 'as' ? <Loader2Icon className="w-3.5 h-3.5 animate-spin" /> : <UploadIcon className="w-3.5 h-3.5" />}
              {uploading === 'as' ? 'Hochladen + OCR...' : 'AS hochladen (PDF)'}
            </button>
            <p className="text-[10px] text-gray-500 mt-1">OCR extrahiert automatisch Sendedatum und Unterschrift</p>
          </div>
        )}
      </div>

      {/* Pflichtdokumente Checkliste */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pflichtdokumente</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {pflichtdokumente.map(dok => {
            const cfg = STATUS_CFG[dok.status] ?? STATUS_CFG.ausstehend
            const Icon = cfg.icon
            const label = DOK_LABELS[dok.dokument_typ] ?? dok.dokument_typ
            return (
              <div key={dok.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 ${cfg.text} shrink-0`} />
                  <span className="text-sm text-gray-800 truncate">{label}</span>
                  {dok.pflicht && <span className="text-[9px] text-red-400 font-medium">Pflicht</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dok.status === 'ausstehend' || dok.status === 'nachgereicht_angefordert' ? (
                    <>
                      {dok.status === 'nachgereicht_angefordert' && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-orange-50 text-orange-600">
                          Nachreichen angefordert
                        </span>
                      )}
                      <input ref={uploadTarget?.id === dok.id ? fileRef : undefined} type="file" accept="image/*,.pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, dok.id) }} />
                      <button
                        onClick={() => { setUploadTarget({ id: dok.id, typ: dok.dokument_typ }); setTimeout(() => fileRef.current?.click(), 50) }}
                        disabled={uploading === dok.id}
                        className="text-[10px] text-[#4573A2] hover:text-[#1E3A5F] font-medium flex items-center gap-1 disabled:opacity-50">
                        {uploading === dok.id ? <Loader2Icon className="w-3 h-3 animate-spin" /> : <UploadIcon className="w-3 h-3" />}
                        Hochladen
                      </button>
                      {/* AAR-168: Nachreichen-Button — KB kann Kunde zum Nachreichen auffordern */}
                      {dok.status === 'ausstehend' && (
                        <button
                          onClick={() => handleNachreichen(dok.id, label)}
                          disabled={nachreichPending}
                          className="text-[10px] text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 disabled:opacity-50"
                          title='Kunde per WA erinnern — Status wird auf „nachgereicht_angefordert" gesetzt'
                        >
                          <BellIcon className="w-3 h-3" /> Nachreichen
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                        {dok.status === 'hochgeladen' ? 'Hochgeladen' : 'Geprüft'}
                      </span>
                      {dok.dokument_url && (
                        <a href={dok.dokument_url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
                          <DownloadIcon className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {pflichtdokumente.length === 0 && (
            <p className="px-4 py-6 text-center text-gray-400 text-xs">Keine Pflichtdokumente definiert</p>
          )}
        </div>
      </div>

      {/* AAR-326: Unzugeordnete Kunden-Uploads — KB weist einem Slot zu. */}
      <DokumenteUnzugeordnetBox docs={unzugeordneteUploads} slots={uploadbareSlots} />

      {/* AAR-326: Zu prüfende Uploads — zugeordnete Kunden-Uploads die noch
          auf QC warten (pflicht.status='hochgeladen'). Klick öffnet QC-Modal. */}
      {zuPruefendeUploads.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <FileCheckIcon className="w-3.5 h-3.5" /> Zu prüfende Uploads
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#4573A2]/10 text-[#4573A2] text-[10px] tabular-nums">
                {zuPruefendeUploads.length}
              </span>
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {zuPruefendeUploads.map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800 truncate">{d.label}</p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {d.original_filename ?? 'Unbenannt'} ·{' '}
                      {new Date(d.hochgeladen_am).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQcDoc(d)
                    setQcOpen(true)
                  }}
                  className="text-[10px] font-medium text-white bg-[#4573A2] hover:bg-[#1E3A5F] px-2.5 py-1 rounded-md shrink-0"
                >
                  Prüfen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AAR-326: Reihenfolge anpassen (drag&drop) — ausklappbar */}
      <div>
        <button
          type="button"
          onClick={() => setSortierbarOpen((v) => !v)}
          className="text-[11px] font-medium text-[#4573A2] hover:text-[#1E3A5F] inline-flex items-center gap-1"
        >
          {sortierbarOpen ? '− Reihenfolge verbergen' : '+ Reihenfolge anpassen'}
        </button>
        {sortierbarOpen && (
          <div className="mt-2">
            <DokumenteListeSortierbar fallId={fallId} items={sortierbareItems} />
          </div>
        )}
      </div>

      {/* AAR-327: Meine Anforderungen — Modal-Trigger + Liste bestehender Anforderungen */}
      <AnforderungenListe
        fallId={fallId}
        rolleLabel={rolleLabel}
        slotsVerfuegbar={anforderbareSlots}
        anforderungen={anforderungenVonMir}
      />

      {/* AAR-326: Mount-Point für QC-Modal (Single-Instance, zentral gesteuert) */}
      <DokumenteQcModal
        doc={qcDoc}
        open={qcOpen}
        onOpenChange={(v) => {
          setQcOpen(v)
          if (!v) setQcDoc(null)
        }}
      />

      {/* Alle Dateien */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alle Dateien ({dokumente.length})</h3>
          {dokumente.length > 3 && (
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Suche..."
                className="pl-7 pr-2 py-1 text-xs bg-gray-50 border border-gray-200 rounded-lg w-32 focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
            </div>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
          {filteredDoks.length === 0 ? (
            <p className="px-4 py-6 text-center text-gray-400 text-xs">Keine Dateien</p>
          ) : filteredDoks.map(dok => {
            const katColor = KAT_COLORS[dok.kategorie] ?? KAT_COLORS.sonstiges
            return (
              <div key={dok.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-gray-800 truncate">{dok.datei_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${katColor}`}>{dok.kategorie}</span>
                      {dok.quelle && <span className="text-[9px] text-gray-400">{dok.quelle}</span>}
                      <span className="text-[9px] text-gray-400">{new Date(dok.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                  </div>
                </div>
                <a href={dok.datei_url} target="_blank" rel="noopener noreferrer"
                  className="text-gray-400 hover:text-[#4573A2] transition-colors shrink-0 p-1">
                  <DownloadIcon className="w-3.5 h-3.5" />
                </a>
              </div>
            )
          })}
        </div>
      </div>

      {/* AAR-170: QC-Checkliste (Filmcheck) — vorher im Monolithen, jetzt
          direkt im Dokumente-Tab. 9 Boolean-Felder + Kommentar + Bestanden/
          Nachbesserung. Bestanden triggert saveFilmcheck() + Kanzlei-Tasks. */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <ClipboardCheckIcon className="w-3.5 h-3.5" /> QC-Checkliste (Filmcheck)
          </h3>
          {qcStatus && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                qcStatus === 'bestanden'
                  ? 'bg-emerald-50 text-emerald-600'
                  : qcStatus === 'nachbesserung'
                  ? 'bg-orange-50 text-orange-600'
                  : 'bg-gray-50 text-gray-500'
              }`}
            >
              {qcStatus === 'bestanden' ? 'Bestanden' : qcStatus === 'nachbesserung' ? 'Nachbesserung' : qcStatus}
            </span>
          )}
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QC_FIELDS.map(({ key, label }) => {
              const v = qcState[key as string]
              const badge =
                v === true
                  ? { bg: 'bg-emerald-50 border-emerald-200 text-emerald-700', txt: 'Ja' }
                  : v === false
                  ? { bg: 'bg-red-50 border-red-200 text-red-700', txt: 'Nein' }
                  : { bg: 'bg-gray-50 border-gray-200 text-gray-500', txt: '—' }
              return (
                <button
                  key={key as string}
                  type="button"
                  onClick={() => toggleQc(key as string)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors hover:border-[#4573A2] ${badge.bg}`}
                >
                  <span className="text-gray-800">{label}</span>
                  <span className="ml-2 text-[10px]">{badge.txt}</span>
                </button>
              )
            })}
          </div>
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">
              Kommentar / Anmerkungen
            </label>
            <textarea
              value={qcKommentar}
              onChange={(e) => setQcKommentar(e.target.value)}
              rows={3}
              placeholder="Bei Nachbesserung: konkrete Hinweise für Sachverständigen"
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#4573A2]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleQcSpeichern}
              disabled={qcPending}
              className="px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Zwischenstand speichern
            </button>
            <button
              type="button"
              onClick={handleQcBestanden}
              disabled={qcPending}
              className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
            >
              QC bestanden → Kanzlei übergeben
            </button>
            <button
              type="button"
              onClick={handleQcNachbesserung}
              disabled={qcPending}
              className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              Nachbesserung anfordern
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            Klick auf ein Feld zykelt zwischen — / Ja / Nein. Bestanden speichert
            automatisch + löst Filmcheck-Flow aus (Kanzlei-Paket, AS-Sendedatum).
          </p>
        </div>
      </div>
    </div>
  )
}

// AAR-356: System-Dokumente-Box. 6 Zeilen, Status-Badge + Vorschau/Download.
// Keine Schreib-Interaktion — das Admin-Team sieht nur was andere Systeme
// erzeugt haben. Wenn eine Quelle fehlt, wird ein „ausstehend"-Badge gezeigt.
function SystemDokumenteBox({ systemDokumente }: { systemDokumente: SystemDokumenteProps }) {
  const rows: { key: string; label: string; url: string | null; hint: string }[] = [
    { key: 'sa', label: 'Sachverständigen-Auftrag (SA)', url: systemDokumente.sa_pdf_url, hint: 'aus FlowLink-Signatur' },
    { key: 'sa_sig', label: 'SA-Unterschrift', url: systemDokumente.sa_unterschrift_url, hint: 'Unterschrift-Bucket' },
    { key: 'vollmacht', label: 'Vollmacht', url: systemDokumente.vollmacht_pdf, hint: 'aus FlowLink-Signatur' },
    { key: 'gutachten', label: 'Gutachten-PDF', url: systemDokumente.gutachten?.datei_url ?? null, hint: 'vom Sachverständigen' },
    { key: 'kanzlei', label: 'Kanzlei-Paket', url: systemDokumente.kanzleiPaket?.datei_url ?? null, hint: 'system-generiert' },
    { key: 'vorschaden', label: 'Vorschadenbericht (CarDentity)', url: systemDokumente.vorschaden_typ_b_pdf_url, hint: 'Typ-B-Abfrage' },
  ]
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
          <ServerIcon className="w-3.5 h-3.5" /> System-Dokumente
        </h3>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between px-4 py-2.5 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <FileTextIcon className={`w-4 h-4 shrink-0 ${r.url ? 'text-emerald-500' : 'text-gray-300'}`} />
              <div className="min-w-0">
                <p className="text-sm text-gray-800 truncate">{r.label}</p>
                <p className="text-[10px] text-gray-400">{r.hint}</p>
              </div>
            </div>
            {r.url ? (
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-[#4573A2] hover:text-[#1E3A5F]"
                >
                  <EyeIcon className="w-3 h-3" /> Vorschau
                </a>
                <a
                  href={r.url}
                  download
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-gray-700"
                >
                  <DownloadIcon className="w-3 h-3" /> Download
                </a>
              </div>
            ) : (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-gray-50 text-gray-400 shrink-0">
                Ausstehend
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
