'use client'

// AAR-126: Vor-Ort-Upload-Card für den Polizeibericht.
// Erscheint im Termin-Detail wenn fall.polizei_vor_ort=true und der Kunde
// den Bericht noch nicht hochgeladen hat. SV nimmt Foto/Datei + optional
// Aktenzeichen auf, alles geht via FormData zur Server Action.

import { useState, useTransition, useRef } from 'react'
import { ClipboardCheckIcon, UploadCloudIcon, CheckCircleIcon } from 'lucide-react'
import { uploadPolizeiberichtAsSv } from './actions'

export default function PolizeiberichtUpload({
  fallId,
  bereitsBekanntesAktenzeichen,
}: {
  fallId: string
  bereitsBekanntesAktenzeichen: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [aktenzeichen, setAktenzeichen] = useState(bereitsBekanntesAktenzeichen ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    if (!file) {
      setToast('Bitte Datei auswählen')
      return
    }
    const fd = new FormData()
    fd.set('file', file)
    if (aktenzeichen.trim()) fd.set('aktenzeichen', aktenzeichen.trim())

    startTransition(async () => {
      const r = await uploadPolizeiberichtAsSv(fallId, fd)
      if (r.success) {
        setToast('Polizeibericht hochgeladen')
        setFile(null)
        if (inputRef.current) inputRef.current.value = ''
      } else {
        setToast(r.error ?? 'Fehler')
      }
      setTimeout(() => setToast(null), 4000)
    })
  }

  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <ClipboardCheckIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">Vor-Ort einzuholen</p>
          <ul className="mt-2 space-y-1.5 text-xs text-amber-800">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <span>
                <strong>Polizeibericht</strong> — Kunde hat ihn noch nicht hochgeladen.
                Bitte Aktenzeichen und Beschreibung vom Kunden aufnehmen, ggf. Foto vom Bericht machen.
              </span>
            </li>
          </ul>
          {bereitsBekanntesAktenzeichen && (
            <p className="mt-2 text-xs text-amber-700">
              Bereits bekanntes Aktenzeichen: <strong>{bereitsBekanntesAktenzeichen}</strong>
            </p>
          )}

          {/* Upload-Form */}
          <div className="mt-3 space-y-2 bg-white rounded-lg p-3 border border-amber-200">
            <input
              type="text"
              value={aktenzeichen}
              onChange={(e) => setAktenzeichen(e.target.value)}
              placeholder="Aktenzeichen (optional)"
              className="w-full px-3 py-1.5 border border-claimondo-border rounded-lg text-xs"
            />
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-claimondo-ondo file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-100 file:text-amber-900 file:font-medium hover:file:bg-amber-200"
            />
            {file && (
              <p className="text-[10px] text-claimondo-ondo truncate">
                Ausgewählt: {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </p>
            )}
            <button
              type="button"
              disabled={pending || !file}
              onClick={handleSubmit}
              className="w-full text-xs font-medium px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {toast === 'Polizeibericht hochgeladen'
                ? <><CheckCircleIcon className="w-3.5 h-3.5" /> Hochgeladen</>
                : <><UploadCloudIcon className="w-3.5 h-3.5" /> {pending ? 'Lade hoch...' : 'Polizeibericht hochladen'}</>
              }
            </button>
            {toast && (
              <p className={`text-[10px] ${toast === 'Polizeibericht hochgeladen' ? 'text-emerald-700' : 'text-red-700'}`}>
                {toast}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
