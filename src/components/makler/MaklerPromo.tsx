'use client'

// AAR-491 (M9): Promo & QR-Code Client-Komponente. Code + Landing-Link
// (Copy-Buttons), QR-Code-Downloads (SVG + PNG), Share (WhatsApp/Email/
// Copy), Tracking-Stats-Kacheln, Landing-Preview-iframe.

import { useMemo, useState } from 'react'
import {
  QrCodeIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MailIcon,
  MessageCircleIcon,
  Share2Icon,
  MousePointerClickIcon,
  UsersIcon,
  FolderCheckIcon,
  TrendingUpIcon,
} from 'lucide-react'
import type { PromoStats } from '@/lib/makler/queries'

type Props = {
  code: string
  landingUrl: string
  qrSvg: string
  stats: PromoStats
  firma: string
}

const PCT = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  maximumFractionDigits: 1,
})

const NUM = new Intl.NumberFormat('de-DE')

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function MaklerPromo({ code, landingUrl, qrSvg, stats, firma }: Props) {
  const [copied, setCopied] = useState<string | null>(null)

  const shareText = useMemo(
    () =>
      `Claimondo regelt Ihren Kfz-Unfall-Schaden digital — Gutachten, Werkstatt, Anwalt und Auszahlung aus einer Hand. Mein Partner-Code: ${code}\n${landingUrl}`,
    [code, landingUrl],
  )

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    })
  }

  function downloadSvg() {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' })
    triggerDownload(blob, `claimondo-${code}.svg`)
  }

  function downloadPng() {
    const size = 600
    const img = new Image()
    const encoded = btoa(unescape(encodeURIComponent(qrSvg)))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, 0, 0, size, size)
      canvas.toBlob((blob) => {
        if (!blob) return
        triggerDownload(blob, `claimondo-${code}.png`)
      }, 'image/png')
    }
    img.src = `data:image/svg+xml;base64,${encoded}`
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const mailHref = `mailto:?subject=${encodeURIComponent(
    'Unverschuldet im Blech? Claimondo regelt das.',
  )}&body=${encodeURIComponent(shareText)}`
  const linkedInHref = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    landingUrl,
  )}`

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-claimondo-navy">
          Promo &amp; QR-Code
        </h1>
        <p className="text-sm text-claimondo-ondo mt-0.5">
          Ihr Partner-Code für {firma} — QR-Code herunterladen, teilen und
          Klicks sowie Leads nachverfolgen.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Linke Spalte: Code + QR */}
        <section className="bg-white rounded-ios-md border border-claimondo-border p-5 space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium">
              Ihr Promo-Code
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 font-mono text-2xl md:text-3xl font-bold text-claimondo-navy bg-[#f8f9fb] border border-claimondo-border rounded-lg px-4 py-3 tracking-wider">
                {code}
              </code>
              <button
                type="button"
                onClick={() => copy(code, 'code')}
                className="shrink-0 inline-flex items-center justify-center w-11 h-11 rounded-lg bg-claimondo-navy text-white hover:bg-[#1E3A5F]"
                aria-label="Code kopieren"
              >
                {copied === 'code' ? (
                  <CheckIcon width={16} height={16} />
                ) : (
                  <CopyIcon width={16} height={16} />
                )}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium">
              Landing-URL
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={landingUrl}
                className="flex-1 font-mono text-sm text-claimondo-navy bg-[#f8f9fb] border border-claimondo-border rounded-lg px-3 py-2.5 truncate"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => copy(landingUrl, 'url')}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 h-10 rounded-lg bg-white border border-claimondo-border text-sm text-claimondo-navy hover:border-[#4573A2]"
              >
                {copied === 'url' ? (
                  <>
                    <CheckIcon width={14} height={14} /> Kopiert
                  </>
                ) : (
                  <>
                    <CopyIcon width={14} height={14} /> Kopieren
                  </>
                )}
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium inline-flex items-center gap-1.5">
                <QrCodeIcon width={12} height={12} />
                QR-Code
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={downloadPng}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-claimondo-navy text-white text-xs font-semibold hover:bg-[#1E3A5F]"
                >
                  <DownloadIcon width={12} height={12} /> PNG
                </button>
                <button
                  type="button"
                  onClick={downloadSvg}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-white border border-claimondo-border text-xs font-semibold text-claimondo-navy hover:border-[#4573A2]"
                >
                  <DownloadIcon width={12} height={12} /> SVG
                </button>
              </div>
            </div>
            <div
              className="flex items-center justify-center p-4 rounded-xl bg-[#f8f9fb] border border-claimondo-border"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-2 text-[11px] text-claimondo-shield text-center">
              Scan führt zur Landing-Page mit vorausgefülltem Partner-Code.
            </p>
          </div>
        </section>

        {/* Rechte Spalte: Stats + Share + Preview */}
        <section className="space-y-5">
          <div className="bg-white rounded-ios-md border border-claimondo-border p-5">
            <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium inline-flex items-center gap-1.5">
              <TrendingUpIcon width={12} height={12} /> Performance
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatCard
                label="Klicks"
                value={NUM.format(stats.clicks)}
                icon={<MousePointerClickIcon width={14} height={14} />}
                tone="blue"
              />
              <StatCard
                label="Leads"
                value={NUM.format(stats.leads)}
                icon={<UsersIcon width={14} height={14} />}
                tone="navy"
              />
              <StatCard
                label="Akten"
                value={NUM.format(stats.akten)}
                icon={<FolderCheckIcon width={14} height={14} />}
                tone="green"
              />
              <StatCard
                label="Konversion"
                value={PCT.format(stats.konversion)}
                icon={<TrendingUpIcon width={14} height={14} />}
                tone="orange"
              />
            </div>
          </div>

          <div className="bg-white rounded-ios-md border border-claimondo-border p-5">
            <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium inline-flex items-center gap-1.5">
              <Share2Icon width={12} height={12} /> Teilen
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <a
                href={waHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-[#25D366] text-white text-sm font-semibold hover:brightness-95"
              >
                <MessageCircleIcon width={14} height={14} /> WhatsApp
              </a>
              <a
                href={mailHref}
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-claimondo-navy text-white text-sm font-semibold hover:bg-[#1E3A5F]"
              >
                <MailIcon width={14} height={14} /> Email
              </a>
              <a
                href={linkedInHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-[#0A66C2] text-white text-sm font-semibold hover:brightness-95"
              >
                <Share2Icon width={14} height={14} /> LinkedIn
              </a>
              <button
                type="button"
                onClick={() => copy(shareText, 'share')}
                className="inline-flex items-center gap-2 px-3 h-10 rounded-lg bg-white border border-claimondo-border text-sm font-semibold text-claimondo-navy hover:border-[#4573A2]"
              >
                {copied === 'share' ? (
                  <>
                    <CheckIcon width={14} height={14} /> Text kopiert
                  </>
                ) : (
                  <>
                    <CopyIcon width={14} height={14} /> Text kopieren
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-ios-md border border-claimondo-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-claimondo-border">
              <p className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium">
                Landing-Preview
              </p>
              <a
                href={landingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy"
              >
                In neuem Tab <ExternalLinkIcon width={12} height={12} />
              </a>
            </div>
            <iframe
              src={landingUrl}
              title="Landing-Vorschau"
              loading="lazy"
              className="w-full h-[420px] bg-white"
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'blue' | 'navy' | 'green' | 'orange'
}) {
  const toneMap: Record<typeof tone, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    navy: 'bg-claimondo-navy/5 text-claimondo-navy border-[#0D1B3E]/10',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
  }
  return (
    <div className="rounded-xl border border-claimondo-border bg-[#f8f9fb] p-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border ${toneMap[tone]}`}
        >
          {icon}
        </span>
        <span className="text-[11px] uppercase tracking-wider text-claimondo-ondo font-medium">
          {label}
        </span>
      </div>
      <p className="mt-1.5 text-xl font-bold text-claimondo-navy">{value}</p>
    </div>
  )
}
