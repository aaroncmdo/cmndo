'use client'

// AAR-298 / P2d-3 (dispatch-config-unify): Inline-Editor für Zeugen-Kontaktdaten
// (leads.zeugen_kontakte jsonb-Array). Extrahiert aus Phase4Stammdaten, damit
// die flache Dispatcher-Form (v2 Sektion-Panel) und die Phase-4-Stammdaten
// denselben Editor nutzen. Self-saving via saveStammdaten (kein patchLead/refresh
// — identisches Verhalten wie zuvor inline).

import { useState, useTransition } from 'react'
import { LoaderIcon, CheckIcon } from 'lucide-react'
import { saveStammdaten } from '../_actions/stammdaten'

export type ZeugenKontakt = { name: string; telefon?: string; email?: string; notiz?: string }

export function ZeugenKontakteEditor({
  leadId,
  initialKontakte,
}: {
  leadId: string
  initialKontakte: ZeugenKontakt[]
}) {
  const [kontakte, setKontakte] = useState<ZeugenKontakt[]>(
    initialKontakte.length > 0 ? initialKontakte : [{ name: '', telefon: '', email: '', notiz: '' }],
  )
  const [, startTransition] = useTransition()
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  function save(next: ZeugenKontakt[]) {
    setStatus('saving')
    startTransition(async () => {
      // Leere Einträge filtern beim Save
      const cleaned = next.filter((k) => k.name.trim() || k.telefon?.trim() || k.email?.trim())
      const r = await saveStammdaten(leadId, {
        zeugen_kontakte: cleaned.length > 0 ? cleaned : null,
      })
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  function updateKontakt(idx: number, field: 'name' | 'telefon' | 'email' | 'notiz', value: string) {
    const next = kontakte.map((k, i) => (i === idx ? { ...k, [field]: value } : k))
    setKontakte(next)
  }

  function addKontakt() {
    setKontakte([...kontakte, { name: '', telefon: '', email: '', notiz: '' }])
  }

  function removeKontakt(idx: number) {
    const next = kontakte.filter((_, i) => i !== idx)
    setKontakte(next.length > 0 ? next : [{ name: '', telefon: '', email: '', notiz: '' }])
    save(next)
  }

  return (
    <div className="space-y-2 mt-2 pt-2 border-t border-claimondo-border">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo font-medium">
          Zeugen-Kontaktdaten
        </p>
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
      </div>
      {kontakte.map((k, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2 rounded-ios-lg bg-claimondo-bg">
          <input
            type="text"
            value={k.name}
            onChange={(e) => updateKontakt(i, 'name', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Name"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          <input
            type="tel"
            value={k.telefon ?? ''}
            onChange={(e) => updateKontakt(i, 'telefon', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Telefon"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          <input
            type="email"
            value={k.email ?? ''}
            onChange={(e) => updateKontakt(i, 'email', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Email (optional)"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          <input
            type="text"
            value={k.notiz ?? ''}
            onChange={(e) => updateKontakt(i, 'notiz', e.target.value)}
            onBlur={() => save(kontakte)}
            placeholder="Notiz (optional)"
            className="px-2 py-1 text-xs border border-claimondo-border rounded bg-white"
          />
          {kontakte.length > 1 && (
            <button
              type="button"
              onClick={() => removeKontakt(i)}
              className="text-[10px] text-red-600 hover:underline col-span-full text-left"
            >
              Entfernen
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addKontakt}
        className="text-[11px] text-claimondo-ondo hover:underline"
      >
        + Weiteren Zeugen hinzufügen
      </button>
    </div>
  )
}
