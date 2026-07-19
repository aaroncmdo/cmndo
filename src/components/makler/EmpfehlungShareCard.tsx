'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check, Mail } from 'lucide-react'
import { Button } from '@/components/primitives'

export function EmpfehlungShareCard({
  referralUrl,
  whatsappHref,
  mailtoHref,
}: {
  referralUrl: string
  whatsappHref: string
  mailtoHref: string
}) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(referralUrl)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = referralUrl
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch {
        /* noop */
      }
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-claimondo-ondo">
        Ihr persönlicher Empfehlungs-Link
      </p>
      <p className="mt-1 break-all text-sm font-medium text-claimondo-navy">{referralUrl}</p>
      <p className="mt-2 text-xs text-claimondo-shield">
        Wer sich über Ihren Link registriert, wird Ihr Partner. Sie erhalten 10&nbsp;€ pro
        vermitteltem Gutachten Ihrer geworbenen Makler.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-ios-lg bg-claimondo-navy px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-claimondo-shield"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Per WhatsApp einladen
        </a>
        <a
          href={mailtoHref}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-ios-lg border border-claimondo-border px-5 py-3 text-sm font-semibold text-claimondo-navy transition-colors hover:bg-claimondo-bg"
        >
          <Mail className="h-4 w-4" aria-hidden />
          Per E-Mail einladen
        </a>
        <Button variant="ghost" onClick={copy}>
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden /> Kopiert!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden /> Link kopieren
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
