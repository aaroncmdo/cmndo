'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  FileTextIcon,
  UploadIcon,
  ClockIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  CameraIcon,
  ScaleIcon,
  GavelIcon,
  ImageIcon,
  MessageSquareIcon,
  SendIcon,
  DownloadIcon,
  FolderOpenIcon,
} from 'lucide-react'
import { uploadGutachten, uploadDokument, uploadDatei, saveFinVinGutachter, sendChatNachricht } from './actions'

const DOKUMENT_TYP_LABEL: Record<string, string> = {
  fahrzeugschein: 'Fahrzeugschein',
  fuehrerschein: 'Fuehrerschein',
  schadensfotos: 'Schadensfotos',
  gegner_daten: 'Gegnerdaten',
  polizeibericht: 'Polizeibericht',
  leasingvertrag: 'Leasingvertrag',
  finanzierungsvertrag: 'Finanzierungsvertrag',
  gewerbenachweis: 'Gewerbenachweis',
  gf_vollmacht: 'GF-Vollmacht',
  halter_vollmacht: 'Halter-Vollmacht',
  halter_ausweis: 'Halter-Ausweis',
  aerztliches_attest: 'Aerztl. Attest',
  krankenhausbericht: 'Krankenhausbericht',
  au_bescheinigung: 'AU-Bescheinigung',
  gutachten: 'Gutachten',
}

const STATUS_BADGE: Record<string, string> = {
  ausstehend: 'bg-red-50 text-red-300',
  hochgeladen: 'bg-green-50 text-green-300',
  geprueft: 'bg-blue-50 text-blue-300',
  abgelehnt: 'bg-amber-50 text-amber-300',
}

const KANZLEI_STEPS = [
  { key: 'kanzlei-uebergeben', label: 'Kanzlei-Uebergabe', desc: 'Akte an Kanzlei uebergeben' },
  { key: 'anschlussschreiben', label: 'Anschlussschreiben', desc: 'Kanzlei hat AS an Versicherung gesendet' },
  { key: 'regulierung', label: 'Regulierung', desc: 'Versicherung bearbeitet den Anspruch' },
  { key: 'abgeschlossen', label: 'Zahlung eingegangen', desc: 'Regulierung abgeschlossen, Zahlung da' },
]

type TabKey = 'uebersicht' | 'dokumente' | 'dateien' | 'gutachten' | 'kanzlei' | 'timeline' | 'chat'

export default function FallDetailClient({
  fall,
  lead,
  dokumente,
  pflichtdokumente,
  parteien,
  timeline,
  nachrichten,
  kundenbetreuer,
}: {
  fall: Record<string, unknown>
  lead: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null } | null
  dokumente: Record<string, unknown>[]
  pflichtdokumente: Record<string, unknown>[]
  parteien: Record<string, unknown>[]
  timeline: Record<string, unknown>[]
  nachrichten: Record<string, unknown>[]
  kundenbetreuer?: { vorname: string | null; nachname: string | null; email: string | null; telefon: string | null } | null
}) {
  const [tab, setTab] = useState<TabKey>('uebersicht')
  const [uploading, setUploading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [finInput, setFinInput] = useState('')
  const [finSaving, setFinSaving] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [dateiUploading, setDateiUploading] = useState(false)
  const [dateiKategorie, setDateiKategorie] = useState<string>('gutachter-foto')
  const gutachtenFormRef = useRef<HTMLFormElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const dateiInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  const kundenName = lead ? `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() : '—'
  const fallId = fall.id as string
  const hasGutachten = !!(fall.gutachten_eingegangen_am)

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'uebersicht', label: 'Uebersicht' },
    { key: 'dokumente', label: `Dokumente (${pflichtdokumente.length})` },
    { key: 'dateien', label: `Dateien (${dokumente.length})` },
    { key: 'gutachten', label: 'Gutachten' },
    { key: 'kanzlei', label: 'Kanzlei-Status' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'chat', label: `Chat (${nachrichten.length})` },
  ]

  // Determine which kanzlei step is active
  const kanzleiStatusOrder = ['kanzlei-uebergeben', 'anschlussschreiben', 'regulierung', 'abgeschlossen']
  const currentStatusIndex = kanzleiStatusOrder.indexOf(fall.status as string)

  // Separate pflichtdokumente into uploaded and missing
  const uploadedDocs = pflichtdokumente.filter(d => d.status !== 'ausstehend')
  const missingDocs = pflichtdokumente.filter(d => d.status === 'ausstehend')

  // Schadensfotos from dokumente
  const fotos = dokumente.filter(d => {
    const typ = d.typ as string
    return typ === 'schadensfotos' || typ === 'foto' || (d.datei_name as string)?.match(/\.(jpg|jpeg|png|webp)$/i)
  })

  async function handleGutachtenSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setUploading(true)
    try {
      const formData = new FormData(e.currentTarget)
      await uploadGutachten(fallId, formData)
      setSuccess('Gutachten erfolgreich hochgeladen!')
      gutachtenFormRef.current?.reset()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  async function handleDocUpload(e: React.ChangeEvent<HTMLInputElement>, pflichtdokumentId?: string) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSuccess(null)
    setUploadingDoc(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (pflichtdokumentId) formData.append('pflichtdokument_id', pflichtdokumentId)
      await uploadDokument(fallId, formData)
      setSuccess(`"${file.name}" hochgeladen!`)
      if (docInputRef.current) docInputRef.current.value = ''
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploadingDoc(false)
    }
  }

  async function handleChatSend() {
    if (!chatInput.trim() || chatSending) return
    setError(null)
    setChatSending(true)
    try {
      await sendChatNachricht(fallId, chatInput)
      setChatInput('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nachricht konnte nicht gesendet werden')
    } finally {
      setChatSending(false)
    }
  }

  async function handleDateiUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSuccess(null)
    setDateiUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('kategorie', dateiKategorie)
      await uploadDatei(fallId, formData)
      setSuccess(`"${file.name}" hochgeladen!`)
      if (dateiInputRef.current) dateiInputRef.current.value = ''
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setDateiUploading(false)
    }
  }

  // Auto-scroll chat to bottom when messages change or tab switches to chat
  useEffect(() => {
    if (tab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [tab, nachrichten.length])

  return (
    <div className="px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/gutachter/faelle" className="text-sm text-gray-500 hover:text-gray-800 transition-colors mb-6 inline-block">
          ← Zurueck zu Faelle
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {(fall.fall_nummer as string) ?? (fall.id as string).slice(0, 8)}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">{kundenName}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-300">
            {fall.status as string}
          </span>
        </div>

        {/* Vorschaden Warning */}
        {(fall.vorschaden_vorhanden as boolean) && (
          <div className="bg-red-50 border border-red-800 rounded-xl p-4 mb-5 flex items-center gap-3">
            <AlertTriangleIcon className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-red-300 font-medium text-sm">VORSCHADEN GEFUNDEN</p>
              <p className="text-red-400 text-xs mt-0.5">
                {fall.vorschaden_anzahl ? `${fall.vorschaden_anzahl} Vorschaeden bekannt` : 'Details pruefen'}
              </p>
            </div>
          </div>
        )}

        {/* Feedback messages */}
        {error && (
          <div className="bg-red-50 border border-red-800 rounded-xl p-3 mb-4 flex items-center gap-2">
            <XCircleIcon className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-800 rounded-xl p-3 mb-4 flex items-center gap-2">
            <CheckCircle2Icon className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-green-300 text-sm">{success}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-200 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 py-2 px-2 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                tab === t.key ? 'bg-zinc-700 text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab: Uebersicht */}
        {tab === 'uebersicht' && (
          <div className="space-y-5">
            {/* Stammdaten */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-gray-500 mb-4">Stammdaten</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Kunde" value={kundenName} />
                <InfoRow label="Telefon" value={lead?.telefon ?? '—'} />
                <InfoRow label="E-Mail" value={lead?.email ?? '—'} />
                <InfoRow label="Schadensart" value={(fall.schadens_ursache as string) ?? '—'} />
                <InfoRow label="Kennzeichen" value={(fall.kennzeichen as string) ?? '—'} />
                <InfoRow label="Fahrzeug" value={[fall.fahrzeug_hersteller, fall.fahrzeug_modell].filter(Boolean).join(' ') || '—'} />
                <InfoRow label="Schadenfall-Typ" value={(fall.schadenfall_typ as string) ?? '—'} />
                <InfoRow label="Adresse" value={[fall.schadens_adresse, fall.schadens_plz, fall.schadens_ort].filter(Boolean).join(', ') || '—'} />
              </div>
            </div>

            {/* Schadensfotos */}
            {fotos.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-medium text-gray-500 mb-3">Schadensfotos</h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {fotos.map(foto => (
                    <a
                      key={foto.id as string}
                      href={foto.datei_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square bg-gray-100 rounded-xl overflow-hidden hover:opacity-80 transition-opacity flex items-center justify-center"
                    >
                      <ImageIcon className="w-8 h-8 text-gray-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Flags */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-gray-500 mb-3">Flags</h2>
              <div className="flex flex-wrap gap-2">
                {fall.personenschaden_flag ? <Badge label="Personenschaden" color="bg-red-50 text-red-300" /> : null}
                {fall.mietwagen_flag ? <Badge label="Mietwagen" color="bg-blue-50 text-blue-300" /> : null}
                {fall.leasing_flag ? <Badge label="Leasing" color="bg-violet-50 text-violet-300" /> : null}
                {fall.finanzierung_flag ? <Badge label="Finanzierung" color="bg-amber-50 text-amber-300" /> : null}
                {fall.gewerbe_flag ? <Badge label="Gewerbe" color="bg-cyan-50 text-cyan-300" /> : null}
                {fall.halter_ungleich_fahrer_flag ? <Badge label="Halter != Fahrer" color="bg-orange-50 text-orange-300" /> : null}
                {!fall.gegner_bekannt ? <Badge label="Gegner unbekannt" color="bg-gray-100 text-gray-500" /> : null}
              </div>
            </div>

            {/* Ansprechpartner bei Claimondo */}
            {kundenbetreuer && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-medium text-gray-500 mb-3">Ihr Ansprechpartner bei Claimondo</h2>
                <div className="space-y-2">
                  <p className="text-gray-900 text-sm font-medium">
                    {`${kundenbetreuer.vorname ?? ''} ${kundenbetreuer.nachname ?? ''}`.trim() || '—'}
                  </p>
                  {kundenbetreuer.telefon && (
                    <a href={`tel:${kundenbetreuer.telefon}`} className="flex items-center gap-2 text-blue-400 text-sm hover:text-blue-300">
                      <span className="text-gray-500 text-xs">Tel:</span> {kundenbetreuer.telefon}
                    </a>
                  )}
                  {kundenbetreuer.email && (
                    <a href={`mailto:${kundenbetreuer.email}`} className="flex items-center gap-2 text-blue-400 text-sm hover:text-blue-300 truncate">
                      <span className="text-gray-500 text-xs">Mail:</span> {kundenbetreuer.email}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* FIN/VIN Eingabe */}
            {!(fall.fin_vin) && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-medium text-gray-500 mb-3">FIN / VIN eingeben</h2>
                <p className="text-gray-500 text-xs mb-3">
                  Fahrzeug-Identifikationsnummer (17 Zeichen) fuer Vorschaden-Pruefung
                </p>
                <div className="flex gap-2">
                  <input
                    value={finInput}
                    onChange={(e) => setFinInput(e.target.value.toUpperCase())}
                    placeholder="WBA1234567890ABCD"
                    maxLength={17}
                    className="flex-1 bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    onClick={async () => {
                      setFinSaving(true); setError(null)
                      try {
                        await saveFinVinGutachter(fallId, finInput)
                        setSuccess('FIN gespeichert. Vorschaden-Pruefung gestartet.')
                        setFinInput('')
                        router.refresh()
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Fehler')
                      } finally {
                        setFinSaving(false)
                      }
                    }}
                    disabled={finSaving || finInput.length !== 17}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-gray-500 text-gray-900 text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
                  >
                    {finSaving ? '...' : 'Speichern'}
                  </button>
                </div>
              </div>
            )}

            {/* FIN vorhanden */}
            {!!(fall.fin_vin) && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5">
                <h2 className="text-sm font-medium text-gray-500 mb-2">FIN / VIN</h2>
                <p className="text-gray-900 font-mono tracking-wider text-sm">{String(fall.fin_vin)}</p>
                <p className="text-gray-400 text-xs mt-1">
                  Quelle: {String(fall.fin_quelle ?? '—')}
                  {fall.vorschaden_geprueft
                    ? fall.vorschaden_vorhanden
                      ? ` · Vorschaden: ${fall.vorschaden_anzahl ?? '?'} gefunden`
                      : ' · Vorschadenfrei'
                    : ' · Pruefung laeuft...'}
                </p>
              </div>
            )}

            {/* Aktueller Status */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h2 className="text-sm font-medium text-gray-500 mb-3">Aktueller Status</h2>
              <div className="text-sm text-gray-800">
                <InfoRow label="Status" value={(fall.status as string) ?? '—'} />
                <div className="mt-2">
                  <InfoRow label="SV-Termin" value={fall.sv_termin ? new Date(fall.sv_termin as string).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'} />
                </div>
                {!!fall.gutachten_eingegangen_am && (
                  <div className="mt-2">
                    <InfoRow label="Gutachten eingegangen" value={new Date(fall.gutachten_eingegangen_am as string).toLocaleDateString('de-DE')} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab: Dokumente */}
        {tab === 'dokumente' && (
          <div className="space-y-5">
            {/* Missing docs as red cards */}
            {missingDocs.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-400 mb-3 flex items-center gap-2">
                  <AlertTriangleIcon className="w-4 h-4" />
                  Fehlende Dokumente ({missingDocs.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {missingDocs.map(doc => (
                    <div key={doc.id as string} className="bg-red-50/30 border border-red-900/50 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileTextIcon className="w-4 h-4 text-red-400" />
                        <span className="text-red-300 text-sm font-medium">
                          {DOKUMENT_TYP_LABEL[doc.dokument_typ as string] ?? doc.dokument_typ}
                        </span>
                      </div>
                      <p className="text-red-400/60 text-xs mb-3">
                        {doc.pflicht ? 'Pflichtdokument' : 'Optional'} · Noch nicht hochgeladen
                      </p>
                      <label className="flex items-center justify-center gap-2 bg-red-900/50 hover:bg-red-900/70 text-red-300 text-sm font-medium py-2 px-3 rounded-lg cursor-pointer transition-colors">
                        <UploadIcon className="w-4 h-4" />
                        Hochladen
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => handleDocUpload(e, doc.id as string)}
                          disabled={uploadingDoc}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded docs */}
            {uploadedDocs.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-3">Vorhandene Dokumente ({uploadedDocs.length})</h3>
                <div className="space-y-2">
                  {uploadedDocs.map(doc => (
                    <div key={doc.id as string} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileTextIcon className="w-4 h-4 text-gray-500" />
                        <div>
                          <p className="text-gray-800 text-sm font-medium">
                            {DOKUMENT_TYP_LABEL[doc.dokument_typ as string] ?? doc.dokument_typ}
                          </p>
                          {doc.hochgeladen_am ? (
                            <p className="text-gray-400 text-xs">{new Date(doc.hochgeladen_am as string).toLocaleDateString('de-DE')}</p>
                          ) : null}
                          {doc.quelle ? (
                            <span className="text-gray-400 text-xs">Quelle: {String(doc.quelle)}</span>
                          ) : null}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGE[doc.status as string] ?? 'bg-gray-100 text-gray-500'}`}>
                        {doc.status as string}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload additional document */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Dokument hochladen (vor Ort eingesammelt)</h3>
              <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-zinc-500 rounded-xl p-6 cursor-pointer transition-colors">
                <UploadIcon className="w-6 h-6 text-gray-500" />
                <span className="text-gray-500 text-sm">{uploadingDoc ? 'Wird hochgeladen...' : 'Datei auswaehlen oder hierher ziehen'}</span>
                <input
                  ref={docInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleDocUpload}
                  disabled={uploadingDoc}
                />
              </label>
            </div>

            {pflichtdokumente.length === 0 && uploadedDocs.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">Keine Pflichtdokumente vorhanden.</p>
            )}
          </div>
        )}

        {/* Tab: Dateien */}
        {tab === 'dateien' && (
          <div className="space-y-5">
            {/* Upload section */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <UploadIcon className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-500">Datei hochladen</h3>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={dateiKategorie}
                  onChange={(e) => setDateiKategorie(e.target.value)}
                  className="bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="gutachter-foto">Gutachter-Foto</option>
                  <option value="gutachten">Gutachten</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
                <label className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-zinc-500 rounded-xl p-4 cursor-pointer transition-colors">
                  <UploadIcon className="w-5 h-5 text-gray-500" />
                  <span className="text-gray-500 text-sm">{dateiUploading ? 'Wird hochgeladen...' : 'Datei auswaehlen'}</span>
                  <input
                    ref={dateiInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleDateiUpload}
                    disabled={dateiUploading}
                  />
                </label>
              </div>
            </div>

            {/* Documents grouped by kategorie */}
            {(() => {
              const KATEGORIE_LABEL: Record<string, string> = {
                'kundendokument': 'Kundendokument',
                'schadensfoto': 'Schadensfoto',
                'gutachten': 'Gutachten',
                'kanzlei': 'Kanzlei',
                'gutachter-foto': 'Gutachter-Foto',
                'unterschrift': 'Unterschrift',
                'whatsapp-foto': 'WhatsApp-Foto',
                'sonstiges': 'Sonstiges',
              }

              const KATEGORIE_COLOR: Record<string, string> = {
                'kundendokument': 'bg-blue-50 text-blue-300',
                'schadensfoto': 'bg-amber-50 text-amber-300',
                'gutachten': 'bg-violet-50 text-violet-300',
                'kanzlei': 'bg-cyan-50 text-cyan-300',
                'gutachter-foto': 'bg-green-50 text-green-300',
                'unterschrift': 'bg-pink-950 text-pink-300',
                'whatsapp-foto': 'bg-emerald-50 text-emerald-300',
                'sonstiges': 'bg-gray-100 text-gray-500',
              }

              const QUELLE_COLOR: Record<string, string> = {
                'flowlink': 'bg-blue-50 text-blue-400',
                'portal': 'bg-violet-50 text-violet-400',
                'whatsapp': 'bg-emerald-50 text-emerald-400',
                'gutachter': 'bg-green-50 text-green-400',
                'admin': 'bg-amber-50 text-amber-400',
                'kanzlei': 'bg-cyan-50 text-cyan-400',
              }

              // Group documents by kategorie
              const grouped: Record<string, Record<string, unknown>[]> = {}
              for (const doc of dokumente) {
                const kat = (doc.kategorie as string) ?? 'sonstiges'
                if (!grouped[kat]) grouped[kat] = []
                grouped[kat].push(doc)
              }

              const kategorieOrder = ['kundendokument', 'schadensfoto', 'gutachten', 'kanzlei', 'gutachter-foto', 'unterschrift', 'whatsapp-foto', 'sonstiges']
              const sortedKeys = Object.keys(grouped).sort(
                (a, b) => (kategorieOrder.indexOf(a) === -1 ? 99 : kategorieOrder.indexOf(a)) - (kategorieOrder.indexOf(b) === -1 ? 99 : kategorieOrder.indexOf(b))
              )

              if (dokumente.length === 0) {
                return (
                  <div className="text-center py-12">
                    <FolderOpenIcon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Noch keine Dateien vorhanden.</p>
                  </div>
                )
              }

              return sortedKeys.map(kat => (
                <div key={kat}>
                  <h3 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-2">
                    <FolderOpenIcon className="w-4 h-4" />
                    {KATEGORIE_LABEL[kat] ?? kat} ({grouped[kat].length})
                  </h3>
                  <div className="space-y-2">
                    {grouped[kat].map(doc => (
                      <div
                        key={doc.id as string}
                        className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <FileTextIcon className="w-4 h-4 text-gray-500 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-gray-800 text-sm font-medium truncate">{doc.datei_name as string}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${KATEGORIE_COLOR[(doc.kategorie as string) ?? 'sonstiges'] ?? 'bg-gray-100 text-gray-500'}`}>
                                {KATEGORIE_LABEL[(doc.kategorie as string) ?? 'sonstiges'] ?? doc.kategorie ?? 'Sonstiges'}
                              </span>
                              {!!(doc.quelle) && (
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${QUELLE_COLOR[doc.quelle as string] ?? 'bg-gray-100 text-gray-500'}`}>
                                  {String(doc.quelle)}
                                </span>
                              )}
                              <span className="text-gray-400 text-[10px]">
                                {new Date(doc.created_at as string).toLocaleDateString('de-DE')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <a
                          href={doc.datei_url as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-3 py-2 rounded-lg transition-colors"
                        >
                          <DownloadIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Download</span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            })()}
          </div>
        )}

        {/* Tab: Gutachten */}
        {tab === 'gutachten' && (
          <div className="space-y-5">
            {hasGutachten ? (
              <>
                {/* Already submitted */}
                <div className="bg-green-50/30 border border-green-900/50 rounded-2xl p-6 flex items-center gap-4">
                  <CheckCircle2Icon className="w-8 h-8 text-green-400 shrink-0" />
                  <div>
                    <p className="text-green-300 font-medium">Gutachten eingereicht</p>
                    <p className="text-green-400/60 text-sm mt-0.5">
                      Eingegangen am {new Date(fall.gutachten_eingegangen_am as string).toLocaleDateString('de-DE')}
                      {fall.gutachten_betrag != null && (
                        <> · Schadenhoehe: {Number(fall.gutachten_betrag).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR</>
                      )}
                    </p>
                  </div>
                </div>

                {/* Gutachten documents */}
                {dokumente.filter(d => (d.typ as string) === 'gutachten').map(doc => (
                  <div key={doc.id as string} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileTextIcon className="w-4 h-4 text-gray-500" />
                      <div>
                        <p className="text-gray-800 text-sm font-medium">{doc.datei_name as string}</p>
                        <p className="text-gray-400 text-xs">{new Date(doc.created_at as string).toLocaleDateString('de-DE')}</p>
                      </div>
                    </div>
                    <a
                      href={doc.datei_url as string}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Oeffnen
                    </a>
                  </div>
                ))}
              </>
            ) : (
              <>
                {/* Upload form */}
                <div className="bg-white border border-gray-200 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                      <ScaleIcon className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                      <h2 className="text-gray-900 font-medium">Gutachten hochladen</h2>
                      <p className="text-gray-500 text-xs">PDF-Datei mit Ihrem Gutachten und Schadenhoehe</p>
                    </div>
                  </div>

                  <form ref={gutachtenFormRef} onSubmit={handleGutachtenSubmit} className="space-y-4">
                    {/* PDF Upload */}
                    <div>
                      <label className="text-sm text-gray-500 mb-2 block">Gutachten-PDF *</label>
                      <input
                        type="file"
                        name="datei"
                        accept="application/pdf"
                        required
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700 file:font-medium hover:file:bg-zinc-700 file:cursor-pointer file:transition-colors"
                      />
                    </div>

                    {/* Schadenhöhe */}
                    <div>
                      <label className="text-sm text-gray-500 mb-2 block">Schadenhoehe (Netto-RK) *</label>
                      <div className="relative">
                        <input
                          type="number"
                          name="betrag"
                          step="0.01"
                          min="0"
                          required
                          placeholder="0,00"
                          className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm">EUR</span>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={uploading}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-gray-500 text-gray-900 font-medium py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                      <UploadIcon className="w-4 h-4" />
                      {uploading ? 'Wird hochgeladen...' : 'Gutachten einreichen'}
                    </button>
                  </form>
                </div>
              </>
            )}

            {/* Vor-Ort Fotos upload */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <CameraIcon className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-500">Vor-Ort Fotos hochladen</h3>
              </div>
              <p className="text-gray-400 text-xs mb-3">Fotos die Sie bei der Besichtigung vor Ort gemacht haben</p>
              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 hover:border-zinc-500 rounded-xl p-4 cursor-pointer transition-colors">
                <CameraIcon className="w-5 h-5 text-gray-500" />
                <span className="text-gray-500 text-sm">{uploadingDoc ? 'Wird hochgeladen...' : 'Fotos auswaehlen'}</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleDocUpload}
                  disabled={uploadingDoc}
                />
              </label>
            </div>
          </div>
        )}

        {/* Tab: Kanzlei-Status */}
        {tab === 'kanzlei' && (
          <div className="space-y-5">
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-cyan-50 flex items-center justify-center">
                  <GavelIcon className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-gray-900 font-medium">Kanzlei-Bearbeitung</h2>
                  <p className="text-gray-500 text-xs">Aktueller Stand der rechtlichen Bearbeitung</p>
                </div>
              </div>

              <div className="space-y-4">
                {KANZLEI_STEPS.map((step, idx) => {
                  const stepIdx = kanzleiStatusOrder.indexOf(step.key)
                  const isCompleted = currentStatusIndex >= 0 && stepIdx <= currentStatusIndex
                  const isCurrent = (fall.status as string) === step.key

                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      {/* Step indicator */}
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isCompleted
                            ? 'bg-green-600 text-white'
                            : isCurrent
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-400'
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2Icon className="w-4 h-4" />
                          ) : (
                            <span className="text-xs font-bold">{idx + 1}</span>
                          )}
                        </div>
                        {idx < KANZLEI_STEPS.length - 1 && (
                          <div className={`w-px h-8 mt-1 ${isCompleted ? 'bg-green-700' : 'bg-gray-100'}`} />
                        )}
                      </div>

                      {/* Step content */}
                      <div className="pt-1">
                        <p className={`text-sm font-medium ${
                          isCompleted ? 'text-green-300' : isCurrent ? 'text-blue-300' : 'text-gray-500'
                        }`}>
                          {step.label}
                        </p>
                        <p className="text-gray-400 text-xs mt-0.5">{step.desc}</p>
                        {isCurrent && step.key === 'regulierung' && !!fall.regulierung_am && (
                          <p className="text-amber-400 text-xs mt-1">
                            Seit {new Date(fall.regulierung_am as string).toLocaleDateString('de-DE')}
                            {' · '}
                            Tag {Math.floor((Date.now() - new Date(fall.regulierung_am as string).getTime()) / (1000 * 60 * 60 * 24))} von 14
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {currentStatusIndex < 0 && (
                <div className="mt-6 bg-gray-100 rounded-xl p-4">
                  <p className="text-gray-500 text-sm">
                    Die Kanzlei-Bearbeitung hat noch nicht begonnen. Der Fall wird nach erfolgreichem Filmcheck an die Kanzlei uebergeben.
                  </p>
                </div>
              )}
            </div>

            {/* Financial info for gutachter */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5">
              <h3 className="text-sm font-medium text-gray-500 mb-3">Ihre Abrechnung fuer diesen Fall</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow label="Gutachten-Betrag" value={fall.gutachten_betrag != null ? `${Number(fall.gutachten_betrag).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR` : '—'} />
                <InfoRow label="Leadpreis" value={
                  (fall as Record<string, unknown>)._leadpreis != null
                    ? `${Number((fall as Record<string, unknown>)._leadpreis).toLocaleString('de-DE', { minimumFractionDigits: 2 })} EUR${(fall as Record<string, unknown>)._preistyp === 'einzel' ? ' (Einzel)' : ''}`
                    : 'Wird berechnet'
                } />
                <InfoRow label="Status" value={currentStatusIndex >= 3 ? 'Bezahlt' : currentStatusIndex >= 0 ? 'In Bearbeitung' : 'Ausstehend'} />
              </div>
            </div>
          </div>
        )}

        {/* Tab: Timeline */}
        {tab === 'timeline' && (
          <div className="space-y-3">
            {timeline.map(entry => (
              <div key={entry.id as string} className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-gray-800 text-sm font-medium">{entry.titel as string}</p>
                  <span className="text-gray-400 text-xs">
                    {new Date(entry.created_at as string).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {entry.beschreibung ? <p className="text-gray-500 text-xs">{String(entry.beschreibung)}</p> : null}
              </div>
            ))}
            {timeline.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">Keine Eintraege.</p>
            )}
          </div>
        )}

        {/* Tab: Chat */}
        {tab === 'chat' && (
          <div className="bg-white border border-gray-200 rounded-2xl flex flex-col" style={{ height: '70vh' }}>
            {/* Chat header */}
            <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
              <MessageSquareIcon className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-medium text-gray-500">Kunde-Gutachter Chat</h2>
              <span className="text-gray-400 text-xs ml-auto">{nachrichten.length} Nachrichten</span>
            </div>

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {nachrichten.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <MessageSquareIcon className="w-10 h-10 text-gray-300 mb-3" />
                  <p className="text-gray-500 text-sm">Noch keine Nachrichten.</p>
                  <p className="text-gray-400 text-xs mt-1">Schreiben Sie die erste Nachricht an den Kunden.</p>
                </div>
              )}
              {nachrichten.map(msg => {
                const isOwn = (msg.sender_rolle as string) === 'sachverstaendiger'
                const rolleLabel = isOwn ? 'Gutachter' : 'Kunde'
                const time = new Date(msg.created_at as string).toLocaleString('de-DE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })

                return (
                  <div
                    key={msg.id as string}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[75%] ${isOwn ? 'order-last' : ''}`}>
                      <div
                        className={`rounded-2xl px-4 py-2.5 ${
                          isOwn
                            ? 'bg-blue-50 border border-blue-900/50 text-blue-100'
                            : 'bg-gray-100 border border-gray-300 text-gray-800'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.nachricht as string}</p>
                        {!!(msg.hat_anhang) && !!(msg.anhang_url) && (
                          <a
                            href={msg.anhang_url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`inline-flex items-center gap-1 mt-1.5 text-xs ${
                              isOwn ? 'text-blue-300 hover:text-blue-200' : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            <FileTextIcon className="w-3 h-3" />
                            Anhang oeffnen
                          </a>
                        )}
                      </div>
                      <div className={`flex items-center gap-2 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            isOwn ? 'bg-blue-50/50 text-blue-400' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {rolleLabel}
                        </span>
                        <span className="text-gray-400 text-[10px]">{time}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            <div className="px-5 py-3 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleChatSend()
                    }
                  }}
                  placeholder="Nachricht schreiben..."
                  disabled={chatSending}
                  className="flex-1 bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:opacity-50"
                />
                <button
                  onClick={handleChatSend}
                  disabled={chatSending || !chatInput.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-gray-500 text-gray-900 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-2"
                >
                  <SendIcon className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">{chatSending ? 'Senden...' : 'Senden'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-gray-800 text-sm">{value}</p>
    </div>
  )
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${color}`}>{label}</span>
}
