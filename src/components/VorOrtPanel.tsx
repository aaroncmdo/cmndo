'use client'

import { useState } from 'react'
import { XIcon, CameraIcon, CheckIcon, NavigationIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface VorOrtPanelProps {
  fallId: string
  kundeName: string
  kennzeichen: string | null
  adresse: string | null
  onClose: () => void
  onComplete: () => void
}

const FOTO_PERSPEKTIVEN = ['Vorne', 'Hinten', 'Links', 'Rechts']

export default function VorOrtPanel({ fallId, kundeName, kennzeichen, adresse, onClose, onComplete }: VorOrtPanelProps) {
  const [fotos, setFotos] = useState<Record<string, boolean>>({})
  const [fin, setFin] = useState('')
  const [km, setKm] = useState('')
  const [notizen, setNotizen] = useState('')
  const [uploading, setUploading] = useState(false)
  const [completing, setCompleting] = useState(false)

  const fotosErledigt = FOTO_PERSPEKTIVEN.filter(p => fotos[p]).length
  const total = FOTO_PERSPEKTIVEN.length + 2 // fotos + FIN + km
  const erledigt = fotosErledigt + (fin.length === 17 ? 1 : 0) + (km ? 1 : 0)

  async function handleFotoUpload(perspektive: string, file: File) {
    setUploading(true)
    try {
      const supabase = createClient()
      // Compress: use canvas if needed (simplified here)
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${fallId}/gutachter/${perspektive.toLowerCase()}_${Date.now()}.${ext}`
      await supabase.storage.from('fall-dokumente').upload(path, file, { contentType: file.type })

      // AAR-553: Insert in fall_dokumente (dokumente-Tabelle gedroppt)
      await supabase.from('fall_dokumente').insert({
        fall_id: fallId,
        dokument_typ: 'schadensfoto',
        storage_path: path,
        original_filename: `${perspektive}.${ext}`,
        groesse_bytes: file.size,
        mime_type: file.type,
        kategorie: 'schadensfotos',
        quelle: 'gutachter-app',
        uploaded_by_sv: true,
      })

      setFotos(prev => ({ ...prev, [perspektive]: true }))
    } catch { /* */ }
    setUploading(false)
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      const supabase = createClient()
      // Update fall
      const updates: Record<string, unknown> = { status: 'besichtigung' }
      if (fin.length === 17) updates.fin_vin = fin.toUpperCase()
      if (km) updates.kilometerstand = parseInt(km)
      await supabase.from('faelle').update(updates).eq('id', fallId)

      // Timeline
      await supabase.from('timeline').insert({
        fall_id: fallId, typ: 'system',
        titel: 'Besichtigung abgeschlossen',
        beschreibung: `${fotosErledigt} Fotos, FIN: ${fin || '—'}, KM: ${km || '—'}. ${notizen || ''}`.trim(),
      })

      onComplete()
    } catch { /* */ }
    setCompleting(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col lg:items-center lg:justify-center lg:bg-black/40">
      <div className="flex flex-col h-full w-full lg:max-w-lg lg:h-auto lg:max-h-[90vh] lg:rounded-xl lg:shadow-2xl lg:overflow-hidden bg-white">
        {/* Header */}
        <div className="bg-gray-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <p className="text-sm font-semibold">{kundeName}</p>
            <p className="text-xs text-gray-400">{kennzeichen ?? '—'} · Vor-Ort Erfassung</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg"><XIcon className="w-5 h-5" /></button>
        </div>

        {/* Progress */}
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-500">{erledigt} von {total} erledigt</span>
            <span className="text-[#4573A2] font-semibold">{Math.round((erledigt / total) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-gray-200 rounded-full">
            <div className="h-full bg-[#4573A2] rounded-full transition-all" style={{ width: `${(erledigt / total) * 100}%` }} />
          </div>
        </div>

        {/* Navigation */}
        {adresse && (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adresse)}`}
            target="_blank" rel="noopener noreferrer"
            className="mx-4 mt-3 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            <NavigationIcon className="w-4 h-4" /> Zum Termin navigieren
          </a>
        )}

        {/* Checklist */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Fotos */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Schadensfotos ({fotosErledigt}/{FOTO_PERSPEKTIVEN.length})</p>
            <div className="grid grid-cols-2 gap-2">
              {FOTO_PERSPEKTIVEN.map(p => (
                <label key={p} className={`flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  fotos[p] ? 'border-green-300 bg-green-50 text-green-600' : 'border-gray-200 bg-gray-50 text-gray-500 hover:border-[#4573A2]/30'
                }`}>
                  {fotos[p] ? <CheckIcon className="w-4 h-4" /> : <CameraIcon className="w-4 h-4" />}
                  <span className="text-xs font-medium">{p}</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleFotoUpload(p, e.target.files[0]) }}
                    disabled={uploading} />
                </label>
              ))}
            </div>
          </div>

          {/* FIN */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">FIN / VIN (17 Zeichen)</p>
            <input type="text" value={fin} onChange={e => setFin(e.target.value.toUpperCase().slice(0, 17))} maxLength={17}
              placeholder="WVWZZZ3CZWE123456"
              className="w-full bg-white border border-gray-300 text-sm font-mono rounded-lg px-3 py-2 tracking-wider" />
            {fin.length > 0 && fin.length !== 17 && <p className="text-red-500 text-[10px] mt-1">{17 - fin.length} Zeichen fehlen</p>}
          </div>

          {/* Kilometerstand */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Kilometerstand</p>
            <input type="number" value={km} onChange={e => setKm(e.target.value)} placeholder="z.B. 45230"
              className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2" />
          </div>

          {/* Notizen */}
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Notizen zur Besichtigung</p>
            <textarea value={notizen} onChange={e => setNotizen(e.target.value)} rows={2} placeholder="Bemerkungen..."
              className="w-full bg-white border border-gray-300 text-sm rounded-lg px-3 py-2 resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-200 shrink-0">
          <button onClick={handleComplete} disabled={completing || fotosErledigt < 4}
            className="w-full bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium py-3 rounded-lg transition-colors">
            {completing ? 'Wird gespeichert...' : 'Besichtigung abschließen'}
          </button>
          {fotosErledigt < 4 && <p className="text-gray-400 text-[10px] text-center mt-1">Min. 4 Fotos benötigt</p>}
        </div>
      </div>
    </div>
  )
}
