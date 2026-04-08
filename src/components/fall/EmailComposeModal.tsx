'use client'

import { useState, useEffect } from 'react'
import { XIcon, SendIcon, PaperclipIcon, ChevronDownIcon, EyeIcon, Trash2Icon } from 'lucide-react'
import { sendEmailFromFall, getTemplateContext } from '@/lib/email/send-from-fall'
import { FALL_TEMPLATES, type TemplateContext } from '@/lib/email/templates-fall'

type Empfaenger = { typ: 'kunde' | 'sv' | 'kanzlei' | 'custom'; email: string; name?: string }

export default function EmailComposeModal({
  fallId,
  fallNummer,
  kundeEmail,
  kundeName,
  svEmail,
  svName,
  kanzleiEmail,
  onClose,
  onSent,
  inReplyTo,
}: {
  fallId: string
  fallNummer: string
  kundeEmail?: string | null
  kundeName?: string | null
  svEmail?: string | null
  svName?: string | null
  kanzleiEmail?: string | null
  onClose: () => void
  onSent?: () => void
  inReplyTo?: string | null
}) {
  const [empfaenger, setEmpfaenger] = useState<Empfaenger[]>([])
  const [customEmail, setCustomEmail] = useState('')
  const [showCcBcc, setShowCcBcc] = useState(false)
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [subject, setSubject] = useState(inReplyTo ? `Re: ${inReplyTo}` : `[Fall #${fallNummer}] `)
  const [body, setBody] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [templateCtx, setTemplateCtx] = useState<TemplateContext | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  // Template-Kontext laden
  useEffect(() => {
    getTemplateContext(fallId).then(ctx => { if (ctx) setTemplateCtx(ctx) }).catch(() => {})
  }, [fallId])

  function toggleEmpfaenger(typ: 'kunde' | 'sv' | 'kanzlei', email: string, name?: string) {
    setEmpfaenger(prev => {
      const exists = prev.find(e => e.typ === typ)
      if (exists) return prev.filter(e => e.typ !== typ)
      return [...prev, { typ, email, name }]
    })
  }

  function addCustom() {
    if (!customEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customEmail)) return
    if (empfaenger.find(e => e.email === customEmail)) return
    setEmpfaenger(prev => [...prev, { typ: 'custom', email: customEmail }])
    setCustomEmail('')
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplate(templateId)
    if (!templateCtx) return
    const tmpl = FALL_TEMPLATES.find(t => t.id === templateId)
    if (!tmpl) return
    setSubject(`[Fall #${fallNummer}] ${tmpl.subject(templateCtx)}`)
    setBody(tmpl.body(templateCtx))
    // Auto-select empfaenger
    if (tmpl.empfaengerTyp === 'kunde' && kundeEmail && !empfaenger.find(e => e.typ === 'kunde')) {
      setEmpfaenger(prev => [...prev, { typ: 'kunde', email: kundeEmail, name: kundeName ?? undefined }])
    } else if (tmpl.empfaengerTyp === 'sv' && svEmail && !empfaenger.find(e => e.typ === 'sv')) {
      setEmpfaenger(prev => [...prev, { typ: 'sv', email: svEmail, name: svName ?? undefined }])
    } else if (tmpl.empfaengerTyp === 'kanzlei' && kanzleiEmail && !empfaenger.find(e => e.typ === 'kanzlei')) {
      setEmpfaenger(prev => [...prev, { typ: 'kanzlei', email: kanzleiEmail }])
    }
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
        cc: cc ? cc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        bcc: bcc ? bcc.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        subject: subject.trim(),
        bodyHtml: `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.7;color:#374151">${body}</div>`,
        bodyText: body.replace(/<[^>]+>/g, ''),
        templateId: selectedTemplate || undefined,
      })
      setSent(true)
      onSent?.()
    } catch (err) { setError(err instanceof Error ? err.message : 'Senden fehlgeschlagen') }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="text-base font-semibold text-gray-900">Email senden — Fall #{fallNummer}</h3>
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
              {/* Empfänger-Chips */}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Empfänger</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {kundeEmail && (
                    <ChipButton active={!!empfaenger.find(e => e.typ === 'kunde')}
                      onClick={() => toggleEmpfaenger('kunde', kundeEmail, kundeName ?? undefined)}>
                      Kunde{kundeName ? ` (${kundeName})` : ''}
                    </ChipButton>
                  )}
                  {svEmail && (
                    <ChipButton active={!!empfaenger.find(e => e.typ === 'sv')}
                      onClick={() => toggleEmpfaenger('sv', svEmail, svName ?? undefined)}>
                      Gutachter{svName ? ` (${svName})` : ''}
                    </ChipButton>
                  )}
                  {kanzleiEmail && (
                    <ChipButton active={!!empfaenger.find(e => e.typ === 'kanzlei')}
                      onClick={() => toggleEmpfaenger('kanzlei', kanzleiEmail)}>
                      Kanzlei
                    </ChipButton>
                  )}
                </div>
                <div className="flex gap-2">
                  <input value={customEmail} onChange={e => setCustomEmail(e.target.value)} placeholder="Andere Email..."
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#4573A2]"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }} />
                  <button onClick={addCustom} disabled={!customEmail} className="px-2 py-1.5 text-xs text-[#4573A2] hover:underline disabled:opacity-30">Hinzufügen</button>
                </div>
                {empfaenger.filter(e => e.typ === 'custom').map(e => (
                  <span key={e.email} className="inline-flex items-center gap-1 mt-1 mr-1 px-2 py-0.5 bg-gray-100 rounded-full text-xs text-gray-700">
                    {e.email}
                    <button onClick={() => setEmpfaenger(prev => prev.filter(p => p.email !== e.email))} className="text-gray-400 hover:text-gray-600">×</button>
                  </span>
                ))}
              </div>

              {/* CC/BCC Toggle */}
              <button onClick={() => setShowCcBcc(!showCcBcc)} className="text-[10px] text-[#4573A2] hover:underline">
                {showCcBcc ? 'CC/BCC ausblenden' : 'CC/BCC hinzufügen'}
              </button>
              {showCcBcc && (
                <div className="grid grid-cols-2 gap-2">
                  <input value={cc} onChange={e => setCc(e.target.value)} placeholder="CC (kommagetrennt)"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#4573A2]" />
                  <input value={bcc} onChange={e => setBcc(e.target.value)} placeholder="BCC (kommagetrennt)"
                    className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#4573A2]" />
                </div>
              )}

              {/* Template-Dropdown */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Vorlage</p>
                <select value={selectedTemplate} onChange={e => applyTemplate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none focus:border-[#4573A2]">
                  <option value="">— Keine Vorlage —</option>
                  {FALL_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              {/* Betreff */}
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Betreff"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2]" />

              {/* Body (HTML-fähig) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500">Nachricht</p>
                  <button onClick={() => setShowPreview(!showPreview)} className="flex items-center gap-1 text-[10px] text-[#4573A2] hover:underline">
                    <EyeIcon className="w-3 h-3" /> {showPreview ? 'Editor' : 'Vorschau'}
                  </button>
                </div>
                {showPreview ? (
                  <div className="border border-gray-200 rounded-lg p-3 min-h-[160px] max-h-64 overflow-y-auto bg-white">
                    <div className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: body }} />
                  </div>
                ) : (
                  <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Nachricht..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#4573A2] resize-none" rows={8} />
                )}
              </div>

              {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-200 flex gap-2 flex-shrink-0">
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

function ChipButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active ? 'bg-[#4573A2] text-white border-[#4573A2]' : 'border-gray-200 text-gray-600 hover:border-[#4573A2]'
      }`}>
      {children}
    </button>
  )
}
