'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sendFlowLink } from './actions'

export default function FlowLinkSection({
  lead,
}: {
  lead: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    wa_gesendet: boolean
    status: string
  }
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [flowUrl, setFlowUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || ''
  const alreadySent = lead.wa_gesendet || lead.status === 'flow-gesendet'

  async function handleSend() {
    setSending(true)
    setError(null)
    try {
      const { token } = await sendFlowLink(lead.id)
      const url = `${window.location.origin}/flow/${token}`
      setFlowUrl(url)

      // Open WhatsApp
      const phone = (lead.telefon ?? '').replace(/[^0-9+]/g, '')
      const msg = `Hallo ${name}, hier ist Ihr Link zur Schadensaufnahme: ${url}. Ihr Claimondo-Team`
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank')

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  async function handleCopy() {
    if (!flowUrl) return
    await navigator.clipboard.writeText(flowUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
      <h2 className="text-sm font-medium text-zinc-400 mb-4">Flow-Link</h2>

      {alreadySent && !flowUrl && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-green-950/50 border border-green-900">
          <span className="text-green-400 text-sm">WhatsApp bereits gesendet</span>
        </div>
      )}

      {!lead.telefon && (
        <p className="text-yellow-400 text-sm mb-4">
          Keine Telefonnummer hinterlegt. WhatsApp-Versand nicht möglich.
        </p>
      )}

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      {flowUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-green-950/50 border border-green-900">
            <span className="text-green-400 text-sm font-medium">Link erstellt & WhatsApp geöffnet</span>
          </div>

          <div className="flex items-stretch gap-2">
            <input
              type="text"
              readOnly
              value={flowUrl}
              className="flex-1 px-3 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 font-mono truncate focus:outline-none"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 transition-colors shrink-0"
            >
              {copied ? 'Kopiert!' : 'Kopieren'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={handleSend}
          disabled={sending || !lead.telefon}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500 text-white active:scale-[0.98]"
        >
          {sending ? 'Wird erstellt ...' : 'Flow-Link senden via WhatsApp'}
        </button>
      )}
    </div>
  )
}
