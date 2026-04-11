'use client'

import { useState, useTransition, useRef } from 'react'
import { uploadTechnischeStellungnahme } from './actions'
import { UploadIcon, CheckCircleIcon, FileTextIcon } from 'lucide-react'

export default function StellungnahmeUpload({ fallId }: { fallId: string }) {
  const [pending, startTransition] = useTransition()
  const [file, setFile] = useState<File | null>(null)
  const [notiz, setNotiz] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit() {
    if (!file) return
    startTransition(async () => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('notiz', notiz)
      const result = await uploadTechnischeStellungnahme(fallId, fd)
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error ?? 'Fehler beim Upload')
      }
    })
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center space-y-3">
        <CheckCircleIcon className="w-10 h-10 text-green-500 mx-auto" />
        <p className="text-sm font-semibold text-green-800">Stellungnahme erfolgreich hochgeladen</p>
        <p className="text-xs text-green-600">Der Kundenbetreuer wurde benachrichtigt und prüft Ihre Stellungnahme.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-gray-900">PDF hochladen</p>
        <p className="text-xs text-gray-500 mt-0.5">Maximale Dateigröße: 20 MB</p>
      </div>

      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-[#4573A2] transition-colors"
        onClick={() => inputRef.current?.click()}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileTextIcon className="w-5 h-5 text-[#4573A2]" />
            <span className="text-sm font-medium text-gray-700">{file.name}</span>
            <span className="text-xs text-gray-400">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
          </div>
        ) : (
          <>
            <UploadIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Klicken oder Datei hierher ziehen</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div>
        <label className="block text-xs text-gray-500 mb-1">Anmerkungen (optional)</label>
        <textarea
          value={notiz}
          onChange={e => setNotiz(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm h-20"
          placeholder="z.B. Erläuterung zu UPE-Aufschlägen..."
        />
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <button
        disabled={pending || !file}
        onClick={handleSubmit}
        className="w-full px-4 py-3 rounded-xl bg-[#4573A2] text-white font-medium text-sm hover:bg-[#3a6290] disabled:opacity-50 transition-colors"
      >
        {pending ? 'Wird hochgeladen...' : 'Stellungnahme einreichen'}
      </button>
    </div>
  )
}
