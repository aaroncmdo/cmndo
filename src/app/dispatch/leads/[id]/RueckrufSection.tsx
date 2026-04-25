'use client'

// AAR-637: Rückruf-Daten liegen jetzt auf admin_termine (typ='rueckruf',
// lead_id=...). Die Komponente lädt den offenen Rückruf-Termin selbst via
// Browser-Client — so bleibt die Server-Page schlank und wir brauchen den
// Termin nicht durch den gesamten Dispatch-Context zu fädeln.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { saveRueckruf, markRueckrufErledigt } from './actions'
import { PhoneCallIcon, CheckCircle2Icon } from 'lucide-react'

type OffenerTermin = {
  id: string
  start_zeit: string
  notizen: string | null
  status: 'offen' | 'erledigt' | 'abgesagt'
} | null

export default function RueckrufSection({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [termin, setTermin] = useState<OffenerTermin>(null)
  const [datum, setDatum] = useState('')
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const loadTermin = useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data } = await supabase
      .from('admin_termine')
      .select('id, start_zeit, notizen, status')
      .eq('lead_id', leadId)
      .eq('typ', 'rueckruf')
      .in('status', ['offen', 'erledigt'])
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle<OffenerTermin>()
    setTermin(data)
    if (data?.start_zeit) {
      const local = new Date(data.start_zeit)
      const pad = (n: number) => String(n).padStart(2, '0')
      const iso = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`
      setDatum(iso)
    } else {
      setDatum('')
    }
    setNotiz(data?.notizen ?? '')
  }, [leadId])

  useEffect(() => { void loadTermin() }, [loadTermin])

  const isErledigt = termin?.status === 'erledigt'
  const hasDatum = !!termin && termin.status === 'offen'
  const inPast = hasDatum && new Date(termin!.start_zeit) < new Date()

  async function handleSave() {
    setSaving(true)
    setErrorMsg(null)
    try {
      const r = await saveRueckruf(
        leadId,
        datum ? new Date(datum).toISOString() : null,
        notiz || null,
      )
      if (r.success) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
        await loadTermin()
        router.refresh()
      } else {
        setErrorMsg(r.error ?? 'Speichern fehlgeschlagen')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unerwarteter Fehler')
    }
    setSaving(false)
  }

  async function handleErledigt() {
    setSaving(true)
    setErrorMsg(null)
    try {
      const r = await markRueckrufErledigt(leadId)
      if (r.success) {
        await loadTermin()
        router.refresh()
      } else {
        setErrorMsg(r.error ?? 'Konnte nicht als erledigt markiert werden')
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unerwarteter Fehler')
    }
    setSaving(false)
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <PhoneCallIcon className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-medium text-claimondo-ondo">Rückruftermin</h2>
        {isErledigt && (
          <span className="ml-auto bg-emerald-50 text-emerald-500 text-xs px-2 py-0.5 rounded-full">
            Erledigt
          </span>
        )}
        {!isErledigt && hasDatum && inPast && (
          <span className="ml-auto bg-red-50 text-red-500 text-xs font-semibold px-2 py-0.5 rounded-full">
            ÜBERFÄLLIG
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-claimondo-ondo mb-1 block">Datum &amp; Uhrzeit</label>
          <input
            type="datetime-local"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className="w-full bg-[#f8f9fb] border border-claimondo-border text-claimondo-navy text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
          />
        </div>
        <div>
          <label className="text-xs text-claimondo-ondo mb-1 block">Notiz</label>
          <input
            type="text"
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="z.B. Kunde ab 14 Uhr erreichbar"
            className="w-full bg-[#f8f9fb] border border-claimondo-border text-claimondo-navy text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-gray-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-claimondo-ondo hover:bg-claimondo-navy disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
        >
          {saving ? 'Speichert ...' : 'Termin speichern'}
        </button>

        {hasDatum && !isErledigt && (
          <button
            onClick={handleErledigt}
            disabled={saving}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
          >
            <CheckCircle2Icon className="w-3.5 h-3.5" />
            Rückruf erledigt
          </button>
        )}

        {saved && <span className="text-emerald-500 text-xs">Gespeichert</span>}
        {errorMsg && (
          <span className="text-red-600 text-xs" role="alert">
            Fehler: {errorMsg}
          </span>
        )}
      </div>
    </div>
  )
}
