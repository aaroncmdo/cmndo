'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/primitives'
import { buildShareSnippets } from '@/lib/makler/share-snippets'

// Geteilte Share-Werkzeuge fuer die Makler-Aktivierung. Formelles "Sie" (B2B).
//   quick   = nur 1:1 (WhatsApp + Link kopieren)
//   passive = nur passive Kanaele (E-Mail-Signatur + Website-Embed)
//   full    = beides (z.B. /makler/promo)
// Genutzt von: Reg-Success-State (quick), Onboarding-Wizard (quick + passive), /makler/promo (full).
export function ShareTools({
  code,
  firma,
  base,
  variant = 'full',
}: {
  code: string
  firma: string
  base?: string
  variant?: 'quick' | 'passive' | 'full'
}) {
  const resolvedBase = base ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
  const snippets = buildShareSnippets(code, firma, resolvedBase)
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* noop */
      }
      document.body.removeChild(ta)
    }
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-4">
      {variant !== 'passive' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={snippets.whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-ios-lg bg-claimondo-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Per WhatsApp an einen Kunden
          </a>
          <Button variant="ghost" onClick={() => copy('url', snippets.url)}>
            {copied === 'url' ? 'Kopiert!' : 'Link kopieren'}
          </Button>
        </div>
      ) : null}

      {variant !== 'quick' ? (
        <div className="space-y-3">
          <SnippetRow
            label="E-Mail-Signatur"
            hint="Fügen Sie das in Ihre Signatur ein — jeder Kunde sieht Ihren Empfehlungs-Link."
            value={snippets.signatur}
            copied={copied === 'sig'}
            onCopy={() => copy('sig', snippets.signatur)}
          />
          <SnippetRow
            label="Für Ihre Website"
            hint="Kopieren Sie den HTML-Code auf Ihre Makler-Website."
            value={snippets.embed}
            copied={copied === 'embed'}
            onCopy={() => copy('embed', snippets.embed)}
          />
        </div>
      ) : null}
    </div>
  )
}

function SnippetRow({
  label,
  hint,
  value,
  copied,
  onCopy,
}: {
  label: string
  hint: string
  value: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-claimondo-navy">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 text-xs font-semibold text-claimondo-ondo hover:text-claimondo-navy"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Kopiert!' : 'Kopieren'}
        </button>
      </div>
      <p className="mt-1 text-xs text-claimondo-ondo">{hint}</p>
      <code className="mt-2 block overflow-x-auto whitespace-pre-wrap break-all rounded-ios-sm bg-white p-2 text-xs text-claimondo-shield">
        {value}
      </code>
    </div>
  )
}
