'use client'

// Geteilte QR-Download-Buttons (PNG/SVG). Aus WerkstattPromo extrahiert, damit
// Werkstatt-Portal + Admin-Werkstattverwaltung dieselbe Download-Logik teilen.

import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/primitives'

type Props = {
  qrSvg: string
  fileBaseName: string
  pngSize?: number
}

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

export function QrCodeDownloadButtons({ qrSvg, fileBaseName, pngSize = 600 }: Props) {
  function downloadSvg() {
    const blob = new Blob([qrSvg], { type: 'image/svg+xml;charset=utf-8' })
    triggerDownload(blob, `${fileBaseName}.svg`)
  }

  function downloadPng() {
    const img = new Image()
    const encoded = btoa(unescape(encodeURIComponent(qrSvg)))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = pngSize
      canvas.height = pngSize
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, pngSize, pngSize)
      ctx.drawImage(img, 0, 0, pngSize, pngSize)
      canvas.toBlob((blob) => {
        if (!blob) return
        triggerDownload(blob, `${fileBaseName}.png`)
      }, 'image/png')
    }
    img.src = `data:image/svg+xml;base64,${encoded}`
  }

  return (
    <div className="flex gap-2">
      <Button variant="navy" size="sm" onClick={downloadPng} iconLeft={<DownloadIcon width={12} height={12} />}>
        PNG
      </Button>
      <Button variant="ghost" size="sm" onClick={downloadSvg} iconLeft={<DownloadIcon width={12} height={12} />}>
        SVG
      </Button>
    </div>
  )
}
