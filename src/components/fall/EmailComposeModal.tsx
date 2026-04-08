'use client'

import { useState } from 'react'
import { XIcon, SendIcon, PaperclipIcon } from 'lucide-react'
import { sendEmailFromFall } from '@/lib/email/send-from-fall'

type Empfaenger = { typ: 'kunde' | 'sv' | 'kanzlei' | 'custom'; email: string; name?: string }

export default function EmailComposeModal({
  fallId,
  fallNummer,
  kundeEmail,
  kundeName,
  svEmail,
  svName,
  onClose,
  onSent,
}: {
  fallId: string
  fallNummer: string
  kundeEmail?: string | null
  kundeName?: string | null
  svEmail?: string | null
  svName?: string | null
  onClose: () => void
  onSent?: () => void
}) {
  const [empfaenger, setEmpfaenger] = useState<Empfaenger[]>([])
  const [customEmail, setCustomEmail] = useState('')
  const [subject, setSubject] = useState(`[Fall #${fallNummer}] `)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  function toggleEmpfaenger(typ: 'kunde' | 'sv' | 'kanzlei', email: string, name?: string) {
    setEmpfaenger(prev => {
      const exists = prev.find(e => e.typ === typ)
      if (exists) return prev.filter(e => e.typ !== typ)
      return [...prev, { typ, email, name }]
    })
  }

  function addCustom() {
    if (!customEmail || empfaenger.find(e => e.email === customEmail)) return
    setEmpfaenger(prev => [...prev, { typ: 'custom', email: customEmail }])
    setCustomEmail('')
  }

  async function handleSend() {
    if (empfaenger.length === 0) { setError('Bitte mindestens einen Empfänger auswählen'); return }
    if (!subject.trim()) { setError('Betreff fehlt'); return }
    if (!body.trim()) { setError('Nachricht fehlt'); return }
    setSending(true); setError('')
    try {
      await sendEmailFromFall({
        fallId,
        empfaenger,
        subject: subject.trim(),
        bodyHtml: `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#374151">${body.replace(/\n/g, '<br>')}</div>`,
        bodyText: body,
      })
      setSent(true)
      onSent?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Senden fehlgeschlagen')
    }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">Email senden</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
        </div>

        {sent ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
              <SendIcon className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-sm font-medium text-gray-900">Email gesendet!</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 text-sm text-[#4573A2] hover:underline">Schließen</button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {/* Empfänger */}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Empfänger</p>
                <div className="flex flex-wrap gap-2">
                  {kundeEmail && (
                    <button onClick={() => toggleEmpfaenger('kunde', kundeEmail, kundeName ?? undefined)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        empfaenger.find(e => e.typ === 'kunde') ? 'bg-[#4573A2] text-white border-[#4573A2]' : 'border-gray-200 text-gray-600 hover:border-[#4573A2]'
                      }`}>
                      Kunde {kundeName ? `(${kundeName})` : ''}
                    </button>
                  )}
                  {svEmail && (
                    <button onClick={() => toggleEmpfaenger('sv', svEmail, svName ?? undefined)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        empfaenger.find(e => e.typ === 'sv') ? 'bg-[#4573A2] text-white border-[#4573A2]' : 'border-gray-200 text-gray-600 hover:border-[#4573A2]'
                      }`}>
                      Gutachter {svName ? `(${svName})` : ''}
                    </button>
                  )}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={customEmail} onChange={e => setCustomEmail(e.target.value)} placeholder="Andere Email..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#4573A2]"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
                  <button onClick={addCustom} className="px-2 py-1.5 text-xs text-[#4573A2] hover:underline">+</button>
                </div>
                {empfaenger.filter(e => e.typ === 'custom').map(e => (
                  <span key={e.email} className="inline-flex items-center gap-1 mt-1 mr-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700">
                    {e.email}
                    <button onClick={() => setEmpfaenger(prev => prev.filter(p => p.email !== e.email))} className="text-gray-400 hover:text-gray-600">×</button>
                  </span>
                ))}
              </div>

              {/* Betreff */}
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Betreff"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />

              {/* Body */}
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Nachricht..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2] resize-none" rows={8} />

              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>

            <div className="px-5 py-4 border-t border-gray-200 flex gap-2">
              <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Abbrechen</button>
              <div className="flex-1" />
              <button onClick={handleSend} disabled={sending || empfaenger.length === 0}
                className="px-5 py-2.5 text-sm font-medium text-white bg-[#4573A2] rounded-lg hover:bg-[#1E3A5F] transition-colors disabled:opacity-50 flex items-center gap-2">
                <SendIcon className="w-4 h-4" />
                {sending ? 'Wird gesendet...' : 'Senden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
