'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { saveLeadNotiz } from './actions'
import { StickyNoteIcon, Loader2Icon, CheckIcon } from 'lucide-react'

export default function LeadNotizen({ leadId, notiz }: { leadId: string; notiz: string }) {
  const [text, setText] = useState(notiz)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestText = useRef(text)

  latestText.current = text

  const doSave = useCallback(async () => {
    const val = latestText.current
    setSaving(true)
    try {
      await saveLeadNotiz(leadId, val || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* */ }
    setSaving(false)
  }, [leadId])

  // Debounced auto-save: 1.5s after last keystroke
  useEffect(() => {
    if (text === notiz) return // no change
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { doSave() }, 1500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, notiz, doSave])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <StickyNoteIcon className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-medium text-gray-500">Notizen</h2>
        </div>
        <div className="flex items-center gap-1 h-5">
          {saving && <Loader2Icon className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
          {saved && <><CheckIcon className="w-3.5 h-3.5 text-emerald-500" /><span className="text-emerald-500 text-[10px]">Gespeichert</span></>}
          {!saving && !saved && text !== notiz && <span className="text-[10px] text-gray-400">Auto-Save...</span>}
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Interne Notizen zum Lead..."
        rows={3}
        className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#4573A2] placeholder-gray-400 resize-y"
      />
    </div>
  )
}
