'use client'

// AAR-637: Rückruf-Section in der Admin/KB-Fallakte. Liest + schreibt
// admin_termine mit typ='rueckruf' + fall_id. Parallel zur Lead-Rückruf-
// Section, nur dass hier der Bezug über fall_id läuft (Leads sind nach
// Konversion eingefroren).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// AAR-892 / f99fdb10: shared createClient (verdrahtet realtime.setAuth) statt direktem
// createBrowserClient — Konsistenz + kein anon-Realtime bei spaeteren Subs.
import { createClient } from '@/lib/supabase/client'
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
    const supabase = createClient()
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
        <PhoneCallIcon className="w-3.5 h-3.5 text-warning" /> Rückruf
        {isErledigt && (
          <span className="ml-auto text-[10px] bg-success-soft text-success-strong px-1.5 py-0.5 rounded-full">Erledigt</span>
        )}
        {hasDatum && inPast && !isErledigt && (
          <span className="ml-auto text-[10px] bg-danger-soft text-danger-strong px-1.5 py-0.5 rounded-full font-semibold">Überfällig</span>
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
            className="flex items-center gap-1 bg-success hover:bg-success/90 disabled:opacity-50 text-white text-[11px] font-medium rounded-ios-lg px-2 py-1.5 transition-colors"
          >
            <CheckCircle2Icon className="w-3 h-3" /> Erledigt
          </button>
        )}
      </div>

      {errorMsg && <p className="text-[10px] text-danger">Fehler: {errorMsg}</p>}
    </div>
  )
}
