'use client'

// Admin-Fallakte Dokumente-Tab.
// AAR-755 (Phase D): Ehemals 739-LOC-Monolith. Nach Dekomposition
// orchestriert diese Datei nur noch: Fortschrittsbalken + Pflicht-Matrix,
// Sub-Components (SystemDokumenteBox, AnschlussschreibenUploadBlock,
// QcChecklisteBlock), Pflichtdokumente-Liste mit Upload, Drag&Drop-
// Sortierung, Anforderungs-Listen und die "Alle Dateien"-Tabelle.

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import {
  DownloadIcon,
  FileCheckIcon,
  FileTextIcon,
  Loader2Icon,
  SearchIcon,
  UploadIcon,
  BellIcon,
  CheckCircle2Icon,
  ClockIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getStorageUrl } from '@/lib/storage/url'
import { uploadPflichtdokument } from '../_actions'
import {
  markDokumentNachgereicht,
  syncPflichtdokumenteForFall,
} from '../_actions/dokumente'
// AAR-542 (C5): Pflicht-Matrix-UI
import PflichtDocMatrix from '@/components/admin/fallakte/PflichtDocMatrix'
import type { PflichtDocMatrixEntry } from '@/lib/dokumente/pflicht-evaluator'
import { StatusBadge } from '@/components/shared/StatusBadge'
// AAR-327: Dokument-Anforderungs-UI
import AnforderungenListe, { type AnforderungsItem } from '@/components/dokumente/AnforderungenListe'
import type { AnforderbarerSlot } from '@/components/dokumente/AnforderungsModal'
// AAR-762 Phase 3: Liste offene Ad-hoc-Anforderungen
import { AdHocAnforderungenListe } from '@/components/admin/fallakte/anforderung'
import type { AdHocAnforderungRow } from '@/lib/dokumente/ad-hoc-anforderung'
// AAR-761 Phase 3: Beleg-OCR-Review-Liste
import { BelegReviewList } from '@/components/admin/fallakte/beleg-review'
import type { BelegReviewItem } from '@/lib/beleg-review/actions'
// AAR-326: KB-Zuordnungs-UI + QC-Modal + Drag&Drop
import DokumenteUnzugeordnetBox from '@/components/dokumente/DokumenteUnzugeordnetBox'
import DokumenteListeSortierbar, { type SortierbarPflicht } from '@/components/dokumente/DokumenteListeSortierbar'
import DokumenteQcModal, { type QcDoc } from '@/components/dokumente/DokumenteQcModal'
import type { UnzugeordnetDoc, ZuordnungsSlot } from '@/components/dokumente/DokumenteZuordnungsModal'
// AAR-755: Extrahierte Sub-Components
import {
  SystemDokumenteBox,
  AnschlussschreibenUploadBlock,
  QcChecklisteBlock,
  type SystemDokumenteProps,
  type FallAS,
  type QcCheckliste,
} from '@/components/admin/fallakte/dokumente'
// CMM-33: Zentrale Pflichtdokumente-Section als Übersicht oben im Tab.
import PflichtdokumenteSection, {
  type PflichtSlotForView,
  type PflichtSectionRolle,
} from '@/components/fall/PflichtdokumenteSection'

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

const DOK_LABELS: Record<string, string> = {
  fuehrerschein: 'Führerschein',
  fahrzeugschein: 'Fahrzeugschein',
  abtretungserklaerung: 'Abtretungserklärung',
  sicherungsabtretung: 'Sicherungsabtretung',
  vollmacht: 'Vollmacht',
  polizeibericht: 'Polizeibericht',
  fotos: 'Unfallfotos',
  unterschrift: 'Unterschrift',
  zb1: 'Zulassungsbescheinigung Teil I',
  gutachten: 'Gutachten',
}

const STATUS_CFG: Record<string, { bg: string; text: string; icon: typeof CheckCircle2Icon }> = {
  ausstehend: { bg: 'bg-amber-50', text: 'text-amber-600', icon: ClockIcon },
  nachgereicht_angefordert: { bg: 'bg-orange-50', text: 'text-orange-600', icon: BellIcon },
  hochgeladen: { bg: 'bg-claimondo-bg', text: 'text-claimondo-ondo', icon: CheckCircle2Icon },
  geprueft: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: CheckCircle2Icon },
}

const KAT_COLORS: Record<string, string> = {
  gutachten: 'bg-claimondo-bg text-claimondo-ondo',
  rechtlich: 'bg-amber-50 text-amber-700',
  kunden_upload: 'bg-emerald-50 text-emerald-700',
  kanzlei: 'bg-claimondo-ondo/10 text-claimondo-navy',
  sonstiges: 'bg-claimondo-bg text-claimondo-ondo',
}

type DokumenteTabProps = {
  fallId: string
  /** CMM-33: Smart-Filter Slots für die Übersichts-Section oben. */
  pflichtSlots?: PflichtSlotForView[]
  /** CMM-33: Rolle des betrachtenden Users — bestimmt Upload-Permission. */
  viewerRolle: PflichtSectionRolle
  pflichtdokumente: Pflichtdok[]
  dokumente: Dokument[]
  fallAS: FallAS
  qcCheckliste: QcCheckliste | null
  anforderbareSlots: AnforderbarerSlot[]
  anforderungenVonMir: AnforderungsItem[]
  rolleLabel: string
  adHocAnforderungen: AdHocAnforderungRow[]
  belegeZumReview: BelegReviewItem[]
  unzugeordneteUploads: UnzugeordnetDoc[]
  zuPruefendeUploads: QcDoc[]
  uploadbareSlots: ZuordnungsSlot[]
  sortierbareItems: SortierbarPflicht[]
  systemDokumente: SystemDokumenteProps
  pflichtMatrix: PflichtDocMatrixEntry[]
  isAdmin: boolean
}

export default function DokumenteTab({
  fallId,
  pflichtSlots,
  viewerRolle,
  pflichtdokumente,
  dokumente,
  fallAS,
  qcCheckliste,
  anforderbareSlots,
  anforderungenVonMir,
  rolleLabel,
  adHocAnforderungen,
  belegeZumReview,
  unzugeordneteUploads,
  zuPruefendeUploads,
  uploadbareSlots,
  sortierbareItems,
  systemDokumente,
  pflichtMatrix,
  isAdmin,
}: DokumenteTabProps) {
  const router = useRouter()
  const [uploading, setUploading] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [matrixSyncPending, startMatrixSyncTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadTarget, setUploadTarget] = useState<{ id: string; typ: string } | null>(null)
  const [nachreichPending, startNachreichTransition] = useTransition()
  const [qcDoc, setQcDoc] = useState<QcDoc | null>(null)
  const [qcOpen, setQcOpen] = useState(false)
  const [sortierbarOpen, setSortierbarOpen] = useState(false)

  function handleMatrixReEvaluate() {
    startMatrixSyncTransition(async () => {
      const r = await syncPflichtdokumenteForFall(fallId)
      if (!r.success) {
        toast.error(r.error ?? 'Matrix-Sync fehlgeschlagen')
        return
      }
      if (r.created && r.created > 0) {
        toast.success(`${r.created} fehlende Pflicht-Slot${r.created > 1 ? 's' : ''} angelegt`)
      } else {
        toast.success('Matrix ist synchron')
      }
      router.refresh()
    })
  }

  function handleNachreichen(pflichtdokId: string, label: string) {
    startNachreichTransition(async () => {
      const r = await markDokumentNachgereicht(pflichtdokId)
      if (r.success) {
        toast.success(`${label}: Kunde wird per WA erinnert`)
        router.refresh()
      } else toast.error(r.error ?? 'Nachreichen fehlgeschlagen')
    })
  }

  async function handleFileUpload(file: File, pflichtdokId: string) {
    setUploading(pflichtdokId)
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `faelle/${fallId}/${pflichtdokId}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('fall-dokumente').upload(path, file)
    if (upErr) {
      setUploading(null)
      return
    }
    const url = await getStorageUrl(supabase, 'fall-dokumente', path)
    if (!url) {
      setUploading(null)
      toast.error('URL-Generierung fehlgeschlagen')
      return
    }
    const r = await uploadPflichtdokument(fallId, pflichtdokId, url)
    if (!r.success) {
      console.error('[DokumenteTab] uploadPflichtdokument:', r.error)
    }
    router.refresh()
    setUploading(null)
  }

  const pflichtCount = pflichtdokumente.length
  const hochgeladenCount = pflichtdokumente.filter((d) => d.status !== 'ausstehend').length
  const pct = pflichtCount > 0 ? Math.round((hochgeladenCount / pflichtCount) * 100) : 0

  const filteredDoks = dokumente.filter((d) => {
    if (!filter) return true
    const q = filter.toLowerCase()
    return (
      d.datei_name.toLowerCase().includes(q) ||
      d.typ.toLowerCase().includes(q) ||
      d.kategorie.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      {/* CMM-33: Zentrale Pflichtdokumente-Übersicht — Smart-Filter Slots
          mit Status + Download (+ Upload für Admin/KB). Die alte Drag&Drop-
          Verwaltungs-UI bleibt darunter erhalten. */}
      {pflichtSlots && pflichtSlots.length > 0 && (
        <PflichtdokumenteSection
          slots={pflichtSlots}
          fallId={fallId}
          rolle={viewerRolle}
          variant="card"
          title="Pflichtdokumente vom Kunden"
        />
      )}

      {/* Fortschritt */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-claimondo-ondo font-medium">Pflichtdokumente</span>
            <span className="text-xs text-claimondo-navy tabular-nums">
              {hochgeladenCount}/{pflichtCount} ({pct}%)
            </span>
          </div>
          <div className="h-2 bg-claimondo-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-claimondo-ondo'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* AAR-542 (C5): Pflicht-Matrix */}
      <PflichtDocMatrix
        entries={pflichtMatrix}
        isAdmin={isAdmin}
        onReEvaluate={isAdmin ? handleMatrixReEvaluate : undefined}
      />
      {matrixSyncPending && (
        <p className="text-[10px] text-claimondo-ondo/70 -mt-3">Matrix wird synchronisiert …</p>
      )}

      {/* AAR-356/AAR-755: System-Dokumente (extrahiert) */}
      <SystemDokumenteBox systemDokumente={systemDokumente} />

      {/* AAR-755: Anschlussschreiben (extrahiert) */}
      <AnschlussschreibenUploadBlock fallId={fallId} fallAS={fallAS} />

      {/* Pflichtdokumente Checkliste */}
      <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-claimondo-border bg-claimondo-bg">
          <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider">
            Pflichtdokumente
          </h3>
        </div>
        <div className="divide-y divide-claimondo-border">
          {pflichtdokumente.map((dok) => {
            const cfg = STATUS_CFG[dok.status] ?? STATUS_CFG.ausstehend
            const Icon = cfg.icon
            const label = DOK_LABELS[dok.dokument_typ] ?? dok.dokument_typ
            return (
              <div key={dok.id} className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className={`w-4 h-4 ${cfg.text} shrink-0`} />
                  <span className="text-sm text-claimondo-navy truncate">{label}</span>
                  {dok.pflicht && (
                    <span className="text-[9px] text-red-400 font-medium">Pflicht</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {dok.status === 'ausstehend' || dok.status === 'nachgereicht_angefordert' ? (
                    <>
                      {dok.status === 'nachgereicht_angefordert' && (
                        <StatusBadge tone="warning">Nachreichen angefordert</StatusBadge>
                      )}
                      <input
                        ref={uploadTarget?.id === dok.id ? fileRef : undefined}
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) handleFileUpload(f, dok.id)
                        }}
                      />
                      <button
                        onClick={() => {
                          setUploadTarget({ id: dok.id, typ: dok.dokument_typ })
                          setTimeout(() => fileRef.current?.click(), 50)
                        }}
                        disabled={uploading === dok.id}
                        className="text-[10px] text-claimondo-ondo hover:text-claimondo-navy font-medium flex items-center gap-1 disabled:opacity-50"
                      >
                        {uploading === dok.id ? (
                          <Loader2Icon className="w-3 h-3 animate-spin" />
                        ) : (
                          <UploadIcon className="w-3 h-3" />
                        )}
                        Hochladen
                      </button>
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
                      <StatusBadge colorCls={`${cfg.bg} ${cfg.text}`}>
                        {dok.status === 'hochgeladen' ? 'Hochgeladen' : 'Geprüft'}
                      </StatusBadge>
                      {dok.dokument_url && (
                        <a
                          href={dok.dokument_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-claimondo-ondo/70 hover:text-claimondo-navy"
                        >
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
            <p className="px-4 py-6 text-center text-claimondo-ondo/70 text-xs">
              Keine Pflichtdokumente definiert
            </p>
          )}
        </div>
      </div>

      {/* AAR-326: Unzugeordnete Kunden-Uploads */}
      <DokumenteUnzugeordnetBox docs={unzugeordneteUploads} slots={uploadbareSlots} />

      {/* AAR-326: Zu prüfende Uploads */}
      {zuPruefendeUploads.length > 0 && (
        <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-claimondo-border bg-claimondo-bg">
            <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider flex items-center gap-2">
              <FileCheckIcon className="w-3.5 h-3.5" /> Zu prüfende Uploads
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-claimondo-ondo/10 text-claimondo-ondo text-[10px] tabular-nums">
                {zuPruefendeUploads.length}
              </span>
            </h3>
          </div>
          <div className="divide-y divide-claimondo-border">
            {zuPruefendeUploads.map((d) => (
              <div
                key={d.id}
                className="px-4 py-2.5 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileTextIcon className="w-4 h-4 text-claimondo-ondo/70 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-claimondo-navy truncate">{d.label}</p>
                    <p className="text-[10px] text-claimondo-ondo truncate">
                      {d.original_filename ?? 'Unbenannt'} ·{' '}
                      {new Date(d.hochgeladen_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQcDoc(d)
                    setQcOpen(true)
                  }}
                  className="text-[10px] font-medium text-white bg-claimondo-ondo hover:bg-claimondo-navy px-2.5 py-1 rounded-ios-md shrink-0"
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
          className="text-[11px] font-medium text-claimondo-ondo hover:text-claimondo-navy inline-flex items-center gap-1"
        >
          {sortierbarOpen ? '− Reihenfolge verbergen' : '+ Reihenfolge anpassen'}
        </button>
        {sortierbarOpen && (
          <div className="mt-2">
            <DokumenteListeSortierbar fallId={fallId} items={sortierbareItems} />
          </div>
        )}
      </div>

      {/* AAR-761 Phase 3: OCR-Belege zum Review (Admin/KB) */}
      <BelegReviewList items={belegeZumReview} />

      {/* AAR-327: Meine Anforderungen */}
      <AnforderungenListe
        fallId={fallId}
        rolleLabel={rolleLabel}
        slotsVerfuegbar={anforderbareSlots}
        anforderungen={anforderungenVonMir}
      />

      {/* AAR-762 Phase 3: Ad-hoc Dokument-Anforderungen (Admin/KB) */}
      <AdHocAnforderungenListe anforderungen={adHocAnforderungen} />

      {/* AAR-326: Mount-Point für QC-Modal */}
      <DokumenteQcModal
        doc={qcDoc}
        open={qcOpen}
        onOpenChange={(v) => {
          setQcOpen(v)
          if (!v) setQcDoc(null)
        }}
      />

      {/* Alle Dateien */}
      <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-claimondo-border flex items-center justify-between bg-claimondo-bg">
          <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider">
            Alle Dateien ({dokumente.length})
          </h3>
          {dokumente.length > 3 && (
            <div className="relative">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-claimondo-ondo/70" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Suche..."
                className="pl-7 pr-2 py-1 text-xs bg-claimondo-bg border border-claimondo-border rounded-ios-lg w-32 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
              />
            </div>
          )}
        </div>
        <div className="max-h-[400px] overflow-y-auto divide-y divide-claimondo-border">
          {filteredDoks.length === 0 ? (
            <p className="px-4 py-6 text-center text-claimondo-ondo/70 text-xs">
              Keine Dateien
            </p>
          ) : (
            filteredDoks.map((dok) => {
              const katColor = KAT_COLORS[dok.kategorie] ?? KAT_COLORS.sonstiges
              return (
                <div
                  key={dok.id}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-claimondo-bg transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileTextIcon className="w-4 h-4 text-claimondo-ondo/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-claimondo-navy truncate">{dok.datei_name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StatusBadge colorCls={katColor}>
                          {dok.kategorie}
                        </StatusBadge>
                        {dok.quelle && (
                          <span className="text-[9px] text-claimondo-ondo/70">{dok.quelle}</span>
                        )}
                        <span className="text-[9px] text-claimondo-ondo/70">
                          {new Date(dok.created_at).toLocaleDateString('de-DE')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <a
                    href={dok.datei_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-claimondo-ondo/70 hover:text-claimondo-navy transition-colors shrink-0 p-1"
                  >
                    <DownloadIcon className="w-3.5 h-3.5" />
                  </a>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* AAR-170/AAR-755: QC-Checkliste (extrahiert) */}
      <QcChecklisteBlock fallId={fallId} qcCheckliste={qcCheckliste} />
    </div>
  )
}
