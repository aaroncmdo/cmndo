'use client'

import { useState, useRef, useTransition } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { uploadAnschlussschreiben, uploadPflichtdokument } from './actions'
import { markDokumentNachgereicht } from './actions/dokumente'
import { useRouter } from 'next/navigation'
import {
  FileTextIcon, UploadIcon, CheckCircle2Icon, ClockIcon, AlertCircleIcon,
  DownloadIcon, EyeIcon, SearchIcon, Loader2Icon, FileCheckIcon,
  BellIcon,
} from 'lucide-react'

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

type FallAS = {
  anschlussschreiben_url: string | null
  anschlussschreiben_sendedatum: string | null
  anschlussschreiben_unterschrift: boolean | null
  anschlussschreiben_ocr_am: string | null
}

const DOK_LABELS: Record<string, string> = {
  fahrzeugschein: 'Fahrzeugschein', fuehrerschein: 'Fuehrerschein',
  schadensfotos: 'Schadensfotos (min. 4)', polizeibericht: 'Polizeibericht',
  gegner_daten: 'Gegner-Daten', eigene_versicherung: 'Eigene Versicherung',
  leasingvertrag: 'Leasingvertrag', finanzierungsvertrag: 'Finanzierungsvertrag',
  gewerbenachweis: 'Gewerbenachweis', 'gf_vollmacht': 'GF-Vollmacht',
  halter_vollmacht: 'Halter-Vollmacht', halter_ausweis: 'Halter-Ausweis',
  aerztliches_attest: 'Aerztliches Attest', krankenhausbericht: 'Krankenhausbericht',
  au_bescheinigung: 'AU-Bescheinigung', anschlussschreiben: 'Anschlussschreiben',
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
}: {
  fallId: string
  pflichtdokumente: Pflichtdok[]
  dokumente: Dokument[]
  fallAS: FallAS
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

  const pflichtCount = pflichtdokumente.length
  const hochgeladenCount = pflichtdokumente.filter(d => d.status !== 'ausstehend').length
  const pct = pflichtCount > 0 ? Math.round((hochgeladenCount / pflichtCount) * 100) : 0

  async function handleFileUpload(file: File, pflichtdokId: string) {
    setUploading(pflichtdokId)
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `faelle/${fallId}/${pflichtdokId}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('dokumente').upload(path, file)
    if (upErr) { setUploading(null); return }
    const { data: urlData } = supabase.storage.from('dokumente').getPublicUrl(path)
    await uploadPflichtdokument(fallId, pflichtdokId, urlData.publicUrl)
    router.refresh()
    setUploading(null)
  }

  async function handleASUpload(file: File) {
    setUploading('as')
    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `faelle/${fallId}/anschlussschreiben_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('dokumente').upload(path, file)
    if (upErr) { setUploading(null); return }
    const { data: urlData } = supabase.storage.from('dokumente').getPublicUrl(path)
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
                        {dok.status === 'hochgeladen' ? 'Hochgeladen' : 'Geprueft'}
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
    </div>
  )
}
