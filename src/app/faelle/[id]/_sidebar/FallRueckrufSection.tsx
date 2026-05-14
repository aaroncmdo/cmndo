'use client'

// AAR-637: Rückruf-Section in der Admin/KB-Fallakte. Liest + schreibt
// admin_termine mit typ='rueckruf' + fall_id. Parallel zur Lead-Rückruf-
// Section, nur dass hier der Bezug über fall_id läuft (Leads sind nach
// Konversion eingefroren).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { PhoneCallIcon, CheckCircle2Icon } from 'lucide-react'
import { saveFallRueckruf, markFallRueckrufErledigt } from './rueckruf-actions'

type OffenerTermin = {
  id: string
  start_zeit: string
  notizen: string | null
  status: 'offen' | 'erledigt' | 'abgesagt'
} | null

export default function FallRueckrufSection({ fallId }: { fallId: string }) {
  const router = useRouter()
  const [termin, setTermin] = useState<OffenerTermin>(null)
  const [datum, setDatum] = useState('')
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { data } = await supabase
      .from('admin_termine')
      .select('id, start_zeit, notizen, status')
      .eq('fall_id', fallId)
      .eq('typ', 'rueckruf')
      .in('status', ['offen', 'erledigt'])
      .order('start_zeit', { ascending: false })
      .limit(1)
      .maybeSingle<OffenerTermin>()
    setTermin(data)
    if (data?.start_zeit) {
      const d = new Date(data.start_zeit)
      const p = (n: number) => String(n).padStart(2, '0')
      setDatum(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`)
    } else {
      setDatum('')
    }
    setNotiz(data?.notizen ?? '')
  }, [fallId])

  useEffect(() => { void load() }, [load])

  const isErledigt = termin?.status === 'erledigt'
  const hasDatum = !!termin && termin.status === 'offen'
  const inPast = hasDatum && new Date(termin!.start_zeit) < new Date()

  async function handleSave() {
    setSaving(true)
    setErrorMsg(null)
    const r = await saveFallRueckruf(fallId, datum ? new Date(datum).toISOString() : null, notiz || null)
    if (!r.success) setErrorMsg(r.error ?? 'Speichern fehlgeschlagen')
    else { await load(); router.refresh() }
    setSaving(false)
  }

  async function handleErledigt() {
    setSaving(true)
    setErrorMsg(null)
    const r = await markFallRueckrufErledigt(fallId)
    if (!r.success) setErrorMsg(r.error ?? 'Konnte nicht als erledigt markiert werden')
    else { await load(); router.refresh() }
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-ios-xl border border-claimondo-border p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-claimondo-navy">
        <PhoneCallIcon className="w-3.5 h-3.5 text-amber-400" /> Rückruf
        {isErledigt && (
          <span className="ml-auto text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full">Erledigt</span>
        )}
        {hasDatum && inPast && !isErledigt && (
          <span className="ml-auto text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">Überfällig</span>
        )}
      </div>

      <input
        type="datetime-local"
        value={datum}
        onChange={e => setDatum(e.target.value)}
        className="w-full bg-claimondo-bg border border-claimondo-border text-claimondo-navy text-[11px] rounded-ios-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
      />
      <input
        type="text"
        value={notiz}
        onChange={e => setNotiz(e.target.value)}
        placeholder="Notiz"
        className="w-full bg-claimondo-bg border border-claimondo-border text-claimondo-navy text-[11px] rounded-ios-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-claimondo-ondo placeholder-claimondo-ondo/60"
      />

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-claimondo-ondo hover:bg-claimondo-navy disabled:opacity-50 text-white text-[11px] font-medium rounded-ios-lg px-2 py-1.5 transition-colors"
        >
          {saving ? '...' : 'Speichern'}
        </button>
        {hasDatum && !isErledigt && (
          <button
            onClick={handleErledigt}
            disabled={saving}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-medium rounded-ios-lg px-2 py-1.5 transition-colors"
          >
            <CheckCircle2Icon className="w-3 h-3" /> Erledigt
          </button>
        )}
      </div>

      {errorMsg && <p className="text-[10px] text-red-600">Fehler: {errorMsg}</p>}
    </div>
  )
}
